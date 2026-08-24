# Healthcare Appointment & Follow-up Manager — Revised Architecture

This document supersedes the original `ARCHITECTURE.md` and addresses all review feedback.

---

## Table of Contents

1. [Issue 1: Appointment Double-Booking Constraint](#1-appointment-double-booking-constraint)
2. [Issue 2: Slot Hold vs Appointment Lifecycle](#2-slot-hold-vs-appointment-lifecycle)
3. [Issue 3: CalendarEvent Failure State](#3-calendarevent-failure-state)
4. [Issue 4: Email Recipients](#4-email-recipients)
5. [Issue 5: Medication Reminder Model](#5-medication-reminder-model)
6. [Issue 6: Background Job Deployment Constraint](#6-background-job-deployment-constraint)
7. [Issue 7: LLM Safety](#7-llm-safety)
8. [Issue 8: Google Calendar Security](#8-google-calendar-security)
9. [Issue 9: Leave Conflict Handling](#9-leave-conflict-handling)
10. [Issue 10: Notification Reliability (Outbox Pattern)](#10-notification-reliability-outbox-pattern)
11. [Issue 11: Final Architecture Review](#11-final-architecture-review)

---

## 1. Appointment Double-Booking Constraint

### Problem with the Original Design

The original design used `@@unique([doctorProfileId, slotDate, slotStartTime, status])`. This is **not** equivalent to a partial unique index. With `status` included in the compound key:

- A `CONFIRMED` appointment and a `CANCELLED` appointment for the same slot would have different composite keys, allowing both to exist — that part is fine.
- But it would also allow **two** `CONFIRMED` rows if they differed in any other way (they wouldn't in this schema, but the semantics are wrong and Prisma treats this as a full compound unique, not a conditional one).
- More critically, it would also prevent rebooking a slot that was previously `CANCELLED` then re-confirmed — because the new `CONFIRMED` row would conflict with the old `CONFIRMED` row if the status is part of a normal unique constraint.

### Correct Solution: PostgreSQL Partial Unique Index

The correct database-level guarantee is a **partial unique index**:

```sql
CREATE UNIQUE INDEX unique_confirmed_appointment
ON "Appointment" ("doctor_profile_id", "slot_date", "slot_start_time")
WHERE status = 'CONFIRMED';
```

And a separate one for holds (since holds live in a separate table, the hold table already uses a normal unique):

```sql
-- SlotHold table already uses:
CREATE UNIQUE INDEX unique_active_hold
ON "SlotHold" ("doctor_profile_id", "slot_date", "slot_start_time");
-- (no partial needed — expired holds are physically deleted)
```

### Guarantees Provided

| Requirement | How Guaranteed |
|---|---|
| At most one active booking per doctor/date/time | Partial unique index on `Appointment` WHERE status = 'CONFIRMED' |
| CANCELLED appointments don't block the slot | Index only covers `CONFIRMED` rows |
| A new appointment can reuse a cancelled slot | New `CONFIRMED` row doesn't conflict with existing `CANCELLED` row |
| Concurrent booking requests can't create two CONFIRMED | PostgreSQL enforces uniqueness at INSERT/UPDATE time within the index |
| Concurrent hold requests can't create two active holds | Normal unique index on `SlotHold` table (expired holds are deleted) |

### Prisma Migration Strategy

Prisma's schema language does **not** support partial unique indexes natively. The solution:

1. Define the `Appointment` model in Prisma **without** any `@@unique` on the slot columns.
2. Create a **custom migration** to add the partial unique index.

```prisma
model Appointment {
  id              String            @id @default(uuid())
  patientId       String
  doctorProfileId String
  slotDate        DateTime          @db.Date
  slotStartTime   String
  slotEndTime     String
  status          AppointmentStatus @default(CONFIRMED)
  cancellationReason String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  // Relations omitted for brevity
  // NO @@unique here — managed by custom migration

  @@index([patientId])
  @@index([doctorProfileId, slotDate])
  @@index([status])
}
```

Custom migration file (`prisma/migrations/XXX_add_partial_unique_indexes/migration.sql`):

```sql
-- Partial unique index: only one CONFIRMED appointment per doctor/date/slot
CREATE UNIQUE INDEX "unique_confirmed_appointment"
ON "Appointment" ("doctorProfileId", "slotDate", "slotStartTime")
WHERE "status" = 'CONFIRMED';
```

This migration is created manually after the initial `prisma migrate dev`:

```bash
pnpm prisma migrate dev --create-only --name add_partial_unique_indexes
# Then edit the generated SQL file to add the partial index
pnpm prisma migrate dev
```

Future `prisma migrate` commands will apply this migration normally. The index won't appear in the Prisma schema but Prisma's query engine respects it (constraint violations surface as P2002 unique constraint errors that we catch and map to HTTP 409).

---

## 2. Slot Hold vs Appointment Lifecycle

### Authoritative Booking Flow

```
Available Slot
    │
    ▼
SlotHold (5-min TTL, unique constraint)
    │
    ▼
Patient fills symptom form
    │
    ▼
Confirm booking (within hold TTL)
    │
    ▼
CONFIRMED Appointment (partial unique index enforced)
```

- `SlotHold` is the **only** temporary reservation mechanism.
- `Appointment` table only contains finalized bookings (CONFIRMED, CANCELLED, COMPLETED, NO_SHOW, RESCHEDULED).
- There is no `HELD` status on the `Appointment` table.

### Race Condition Analysis

**Race 1: Hold expiry cleanup vs booking confirmation**

Scenario: Patient's hold is about to expire. The cron job deletes it at the same instant the patient confirms.

Resolution — the confirmation transaction handles this:

```typescript
async function confirmBooking(holdId: string, patientId: string, symptoms: SymptomData) {
  return prisma.$transaction(async (tx) => {
    // Step 1: Attempt to delete the hold (acts as a lock + existence check)
    const deleted = await tx.$executeRaw`
      DELETE FROM "SlotHold"
      WHERE id = ${holdId}
        AND "patientId" = ${patientId}
        AND "expiresAt" > NOW()
      RETURNING *
    `;

    if (deleted === 0) {
      // Hold was already expired/deleted or doesn't belong to this patient
      throw new ConflictError('Hold expired or invalid. Please select a new slot.');
    }

    // Step 2: Create the appointment (partial unique index prevents duplicates)
    const appointment = await tx.appointment.create({
      data: { patientId, doctorProfileId, slotDate, slotStartTime, slotEndTime, status: 'CONFIRMED' }
    });

    // Step 3: Create symptom submission
    await tx.symptomSubmission.create({
      data: { appointmentId: appointment.id, patientId, ...symptoms }
    });

    // Step 4: Create notification records (outbox — see Issue 10)
    await tx.notification.createMany({ data: [...] });

    return appointment;
  }, { isolationLevel: 'ReadCommitted' });
}
```

Key insight: `DELETE ... WHERE expiresAt > NOW()` is atomic. If the cron already deleted the hold, this returns 0 rows and the confirmation fails. If the patient confirms before expiry, the DELETE succeeds and the hold is consumed.

**Race 2: Two patients try to hold the same slot**

Resolution: Normal unique constraint on `SlotHold(doctorProfileId, slotDate, slotStartTime)`:
- First INSERT succeeds.
- Second INSERT fails with unique constraint violation → mapped to HTTP 409.

**Race 3: Hold expires, two patients immediately try to hold the freed slot**

Resolution: Same as Race 2 — unique constraint on the hold table. Only one INSERT wins.

**Race 4: Two patients somehow both confirm (e.g., bug in hold logic)**

Resolution: Partial unique index on `Appointment` WHERE status = 'CONFIRMED'. PostgreSQL rejects the second INSERT. This is the last line of defense and guarantees correctness even if application logic has a bug.

### Expired Hold Cannot Confirm

The `DELETE ... WHERE expiresAt > NOW()` check is inside the same transaction as the appointment creation. An expired hold:
1. May already be physically deleted by cron → DELETE returns 0 → confirmation aborted.
2. May still exist but be past expiry → `expiresAt > NOW()` is false → DELETE returns 0 → confirmation aborted.

Either way, an expired hold cannot produce a confirmed appointment.

---

## 3. CalendarEvent Failure State

### Corrected Schema

```prisma
model CalendarEvent {
  id              String              @id @default(uuid())
  appointmentId   String
  userId          String
  googleEventId   String?             // NULL when sync has not yet succeeded
  syncStatus      CalendarSyncStatus  @default(PENDING)
  lastSyncAt      DateTime?
  errorMessage    String?
  retryCount      Int                 @default(0)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  appointment     Appointment         @relation(fields: [appointmentId], references: [id])

  @@unique([appointmentId, userId])
  @@index([syncStatus])
}

enum CalendarSyncStatus {
  PENDING
  SYNCED
  FAILED
}
```

### Lifecycle

```
Appointment confirmed
       │
       ▼
CalendarEvent created (syncStatus: PENDING, googleEventId: null)
       │
       ├──── Immediate sync attempt ────┐
       │                                │
       ▼                                ▼
   [Success]                        [Failure]
       │                                │
       ▼                                ▼
syncStatus: SYNCED              syncStatus: FAILED
googleEventId: "abc123"         errorMessage: "token expired"
lastSyncAt: now()               retryCount: 1
       │                                │
       │                                ▼
       │                    [Cron retry every 15 min]
       │                                │
       │                    ┌───────────┴───────────┐
       │                    ▼                       ▼
       │              [Retry succeeds]        [Max retries exceeded]
       │                    │                       │
       │                    ▼                       ▼
       │            syncStatus: SYNCED      syncStatus: FAILED
       │            googleEventId: set      (remains for admin review)
       │                                    (user informed via UI)
       ▼
 [Appointment cancelled]
       │
       ▼
 Delete Google event via API
       │
       ├── Success: Delete CalendarEvent row
       └── Failure: Mark as FAILED (orphaned event, cleaned up on next sync)
```

### Key Properties

- `googleEventId` is nullable — failed syncs don't have one.
- Calendar failure **never** rolls back or cancels an appointment.
- The `CalendarEvent` row is created inside the appointment transaction (cheap DB write). The actual Google API call happens **after** the transaction commits.
- If the process crashes between commit and Google API call, the PENDING row remains and the cron job picks it up.

---

## 4. Email Recipients

### Corrected Notification Design

The system needs to send notifications to **multiple recipients** for a single event. Rather than duplicating business logic, we create **one notification row per recipient**:

```prisma
model Notification {
  id              String              @id @default(uuid())
  userId          String              // The recipient
  type            NotificationType
  subject         String
  body            String
  status          NotificationStatus  @default(PENDING)
  attempts        Int                 @default(0)
  maxAttempts     Int                 @default(3)
  lastAttemptAt   DateTime?
  sentAt          DateTime?
  errorMessage    String?
  referenceId     String?             // Appointment ID, leave ID, etc.
  referenceType   String?             // "appointment", "leave", "medication"
  createdAt       DateTime            @default(now())

  user            User                @relation(fields: [userId], references: [id])

  @@index([status, lastAttemptAt])
  @@index([userId])
  @@index([referenceId, referenceType])
}
```

### Recipient Matrix

| Event | Recipients | Rows Created |
|-------|-----------|--------------|
| Booking confirmation | Patient + Doctor | 2 notification rows |
| Appointment reminder (24h before) | Patient + Doctor | 2 notification rows |
| Cancellation (by patient) | Patient (ack) + Doctor | 2 notification rows |
| Cancellation (by admin/leave) | Patient + Doctor | 2 notification rows |
| Doctor leave notification | Each affected patient | 1 row per patient |
| Medication reminder | Patient | 1 notification row |

### How It Works

The service layer contains a `createAppointmentNotifications` function that knows the business rule "confirmation goes to both patient and doctor" and creates the appropriate rows:

```typescript
async function createBookingNotifications(appointment: Appointment, tx: PrismaTransaction) {
  const patient = await tx.user.findUnique({ where: { id: appointment.patientId } });
  const doctor = await tx.user.findFirst({
    where: { doctorProfile: { id: appointment.doctorProfileId } }
  });

  await tx.notification.createMany({
    data: [
      {
        userId: patient.id,
        type: 'BOOKING_CONFIRMATION',
        subject: `Appointment Confirmed - ${formatDate(appointment.slotDate)}`,
        body: buildPatientConfirmationEmail(appointment, doctor),
        referenceId: appointment.id,
        referenceType: 'appointment'
      },
      {
        userId: doctor.id,
        type: 'BOOKING_CONFIRMATION',
        subject: `New Appointment - ${patient.firstName} ${patient.lastName}`,
        body: buildDoctorConfirmationEmail(appointment, patient),
        referenceId: appointment.id,
        referenceType: 'appointment'
      }
    ]
  });
}
```

This approach:
- Each notification row targets **one user** (simple to query, simple to retry)
- No separate recipients table needed for this project's complexity
- `referenceId` + `referenceType` enable deduplication and idempotent job execution
- Business logic (who receives what) lives in the service layer, not in the job

---

## 5. Medication Reminder Model

### Structured Frequency Enum

```prisma
enum MedicationFrequency {
  ONCE_DAILY
  TWICE_DAILY
  THREE_TIMES_DAILY
  EVERY_8_HOURS
  EVERY_12_HOURS
}
```

### Updated Medication Model

```prisma
model Medication {
  id              String              @id @default(uuid())
  prescriptionId  String
  name            String
  dosage          String              // "500mg", "10ml"
  frequency       MedicationFrequency
  duration        String              // "7 days", "2 weeks"
  instructions    String?             // "take with food"
  startDate       DateTime            @db.Date
  endDate         DateTime            @db.Date
  isActive        Boolean             @default(true)

  prescription    Prescription        @relation(fields: [prescriptionId], references: [id])
  reminders       MedicationReminder[]

  @@index([isActive, endDate])
}
```

### Reminder Generation Table

```prisma
model MedicationReminder {
  id              String    @id @default(uuid())
  medicationId    String
  patientId       String
  scheduledDate   DateTime  @db.Date
  scheduledTime   String    // "08:00", "14:00", "20:00"
  notificationId  String?   // Links to the notification that was created
  createdAt       DateTime  @default(now())

  medication      Medication @relation(fields: [medicationId], references: [id])

  @@unique([medicationId, scheduledDate, scheduledTime])
  @@index([scheduledDate, scheduledTime])
}
```

### How the Scheduler Interprets Frequency

```typescript
const FREQUENCY_TIMES: Record<MedicationFrequency, string[]> = {
  ONCE_DAILY:        ['08:00'],
  TWICE_DAILY:       ['08:00', '20:00'],
  THREE_TIMES_DAILY: ['08:00', '14:00', '20:00'],
  EVERY_8_HOURS:     ['06:00', '14:00', '22:00'],
  EVERY_12_HOURS:    ['08:00', '20:00'],
};
```

### Medication Reminder Job Logic

Runs every 30 minutes:

1. Find active medications where `startDate <= today <= endDate` and `isActive = true`.
2. For each medication, determine today's reminder times from `FREQUENCY_TIMES[frequency]`.
3. For each time that is within the next 30-minute window:
   - Check if a `MedicationReminder` row already exists for `(medicationId, today, time)`.
   - If not, create the reminder row AND a `Notification` row (PENDING).
   - If yes, skip (idempotent).
4. The notification retry job handles actual email delivery.

The `@@unique([medicationId, scheduledDate, scheduledTime])` constraint on `MedicationReminder` prevents duplicate reminders even if the job runs multiple times.

---

## 6. Background Job Deployment Constraint

### Documented Limitation

**node-cron runs in-process**. Every instance of the backend that starts will independently schedule and execute the same jobs. This creates a problem for horizontal scaling:

| Scaling | Consequence |
|---------|------------|
| 1 instance | Jobs run exactly once per schedule. Correct. |
| N instances | Jobs run N times per schedule. Duplicates possible. |

### Decision for This Screening Project

- **Deployment assumption: single backend instance.**
- This is documented explicitly in the deployment configuration.
- The architecture is designed so that **even if jobs run multiple times**, the outcome is correct (idempotent design).

### Idempotency Guarantees

| Job | Idempotency Mechanism |
|-----|----------------------|
| Slot hold expiry | `DELETE WHERE expiresAt < NOW()` — safe to run repeatedly |
| Appointment reminder | Check: notification with `referenceId=appointmentId, type=APPOINTMENT_REMINDER` exists? Skip if yes. |
| Medication reminder | `@@unique([medicationId, scheduledDate, scheduledTime])` — INSERT fails silently on duplicate |
| Notification retry | Updates status from FAILED → PENDING only if `attempts < maxAttempts`. Atomic update with WHERE clause. |
| Calendar sync retry | Picks up PENDING/FAILED rows. If already SYNCED, no-op. |

### Preventing Duplicate Notifications

```typescript
// Reminder job: before creating a notification
const existing = await prisma.notification.findFirst({
  where: {
    referenceId: appointment.id,
    referenceType: 'appointment',
    type: 'APPOINTMENT_REMINDER',
    userId: patient.id
  }
});

if (existing) return; // Already queued or sent — skip
```

### Future Horizontal Scaling Path

When scaling beyond one instance, the job layer should migrate to:
- A dedicated worker process (separate deployment), OR
- A distributed job library (e.g., `pg-boss` which uses PostgreSQL advisory locks), OR
- An external scheduler (e.g., AWS EventBridge → SQS → worker)

This migration is isolated to the `jobs/` directory and does not affect the rest of the application architecture.

---

## 7. LLM Safety

### Explicit Safety Rules

The following rules are **architectural invariants**, not suggestions:

1. **LLM output is informational assistance only.** It provides summaries to help doctors and patients. It does not diagnose, prescribe, or make clinical decisions.

2. **LLM output must not be treated as a medical diagnosis.** The pre-visit summary's "urgency level" is a triage hint for the doctor's workflow, not a clinical assessment.

3. **LLM output must never determine whether an appointment is booked.** The booking flow is: hold → symptom → confirm. LLM generation happens *after* booking is confirmed, asynchronously.

4. **LLM output must never authorize a user.** Authentication and authorization are purely JWT + RBAC. LLM has no access to auth decisions.

5. **LLM failure must never prevent appointment booking or visit completion.** Both flows:
   - Booking confirmation creates the appointment first, then triggers LLM async.
   - Visit completion saves the doctor's notes first, then triggers LLM async.
   If LLM fails, a `PreVisitSummary` or `PostVisitSummary` row is created with `isFailure: true`.

6. **Structured output must be validated before storage.** All LLM responses are parsed through Zod schemas. If parsing fails, the raw response is stored for debugging but the validated fields are NOT populated.

### UI Labeling

All AI-generated content displayed in the frontend must:
- Be clearly labeled with a visual indicator (e.g., "AI-Generated Summary" badge)
- Include a disclaimer: "This summary is AI-generated and not a medical diagnosis. Always consult your doctor."
- Show "Summary unavailable" with an appropriate message when `isFailure: true`

### LLM Invocation Points

| Trigger | When | Failure Impact |
|---------|------|---------------|
| Pre-visit summary | After appointment is CONFIRMED and symptoms are saved | None — appointment already exists |
| Post-visit summary | After doctor saves visit notes | None — visit notes already saved |

Both are fire-and-forget from the main flow's perspective.

---

## 8. Google Calendar Security

### Token Encryption

**Strategy**: AES-256-GCM encryption for refresh tokens at rest.

```typescript
// Environment variable
CALENDAR_TOKEN_ENCRYPTION_KEY=<64-character hex string (32 bytes)>
```

**Implementation**:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(stored: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

### Storage

```prisma
model CalendarConnection {
  id                    String    @id @default(uuid())
  userId                String    @unique
  encryptedAccessToken  String    // AES-256-GCM encrypted
  encryptedRefreshToken String    // AES-256-GCM encrypted
  tokenExpiry           DateTime
  calendarId            String?
  isConnected           Boolean   @default(true)
  disconnectedReason    String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user                  User      @relation(fields: [userId], references: [id])
}
```

### Security Rules

| Rule | Implementation |
|------|---------------|
| Decryption only inside calendar service | `decrypt()` is a private function in `integrations/google-calendar/calendar.client.ts`. No other module imports it. |
| Never expose tokens via API | No API endpoint returns token values. `/calendar/status` returns only `{ isConnected: boolean, calendarId }`. |
| Tokens never in frontend storage | Frontend only stores the JWT access token. Calendar OAuth is a server-side flow — tokens go server → DB, never to the browser. |
| Disconnect behavior | User clicks disconnect → delete `CalendarConnection` row → revoke token with Google. |
| Revoked token behavior | When a Google API call returns 401 (invalid_grant), set `isConnected: false`, `disconnectedReason: 'Token revoked by user'`. Notify user to reconnect. |

### Token Refresh Flow

```
Before each Google API call:
  1. Load CalendarConnection
  2. If !isConnected → skip (no-op)
  3. If tokenExpiry < now() + 5min:
     a. Decrypt refresh token
     b. Call Google token endpoint
     c. If success: encrypt new access token, update expiry
     d. If 401: mark disconnected, log, skip API call
  4. Decrypt access token
  5. Make API call
```

---

## 9. Leave Conflict Handling

### Transaction Boundary

The leave creation involves two phases: a **database transaction** (atomic) and **post-commit async work** (non-blocking).

#### Phase 1: Database Transaction (Atomic)

All of the following happen inside a single Prisma `$transaction`:

```typescript
async function createDoctorLeave(doctorProfileId: string, startDate: Date, endDate: Date, reason: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Validate date range
    if (startDate < today() || endDate < startDate) {
      throw new ValidationError('Invalid date range');
    }

    // 2. Check overlapping leave
    const overlap = await tx.doctorLeave.findFirst({
      where: {
        doctorProfileId,
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } }
        ]
      }
    });
    if (overlap) throw new ConflictError('Overlapping leave period exists');

    // 3. Create leave record
    const leave = await tx.doctorLeave.create({
      data: { doctorProfileId, startDate, endDate, reason, createdBy: adminId }
    });

    // 4. Find affected confirmed appointments
    const affected = await tx.appointment.findMany({
      where: {
        doctorProfileId,
        slotDate: { gte: startDate, lte: endDate },
        status: 'CONFIRMED'
      },
      include: { patient: true }
    });

    // 5. Cancel affected appointments
    await tx.appointment.updateMany({
      where: { id: { in: affected.map(a => a.id) } },
      data: { status: 'CANCELLED', cancellationReason: `Doctor leave: ${leave.id}` }
    });

    // 6. Create notification rows for affected patients AND doctor (outbox)
    const notifications = affected.flatMap(appt => [
      {
        userId: appt.patientId,
        type: 'DOCTOR_LEAVE' as const,
        subject: 'Appointment Cancelled - Doctor Unavailable',
        body: buildLeaveNotificationBody(appt),
        referenceId: appt.id,
        referenceType: 'appointment'
      },
      {
        userId: appt.doctorProfile?.userId, // doctor also informed
        type: 'DOCTOR_LEAVE' as const,
        subject: 'Leave Confirmed - Appointments Cancelled',
        body: buildDoctorLeaveConfirmation(appt),
        referenceId: leave.id,
        referenceType: 'leave'
      }
    ]);
    await tx.notification.createMany({ data: notifications });

    // 7. Create calendar deletion records (PENDING)
    const calendarDeletions = affected.map(appt => ({
      appointmentId: appt.id,
      // Calendar events will be handled in post-commit phase
    }));

    // 8. Release affected slot holds
    await tx.slotHold.deleteMany({
      where: {
        doctorProfileId,
        slotDate: { gte: startDate, lte: endDate }
      }
    });

    return { leave, affectedCount: affected.length, affectedAppointments: affected };
  });
}
```

#### Phase 2: Post-Commit Async Work (Non-Blocking)

After the transaction commits:

```typescript
// These happen after commit — failure does not affect the leave or cancellations
const result = await createDoctorLeave(...);

// Trigger calendar event deletions (async, non-blocking)
for (const appt of result.affectedAppointments) {
  deleteCalendarEventsForAppointment(appt.id).catch(err =>
    logger.error('Calendar deletion failed', { appointmentId: appt.id, err })
  );
}

// Trigger LLM? No — leave doesn't involve LLM.
// Notifications will be picked up by the notification sender job.
```

### Prevention of New Bookings During Leave

The slot generation function checks leave dates (unchanged from original design):

```typescript
const leave = await prisma.doctorLeave.findFirst({
  where: {
    doctorProfileId: doctorId,
    startDate: { lte: date },
    endDate: { gte: date }
  }
});
if (leave) return []; // No available slots
```

### Audit Trail

- `DoctorLeave` records are never physically deleted.
- Cancelled appointments retain `cancellationReason: "Doctor leave: {leaveId}"`.
- All notifications are logged with `referenceId` linking back to the appointment or leave.
- Admin dashboard can query cancelled appointments by `cancellationReason LIKE 'Doctor leave%'`.

---

## 10. Notification Reliability (Outbox Pattern)

### The Problem

```
Application creates appointment (transaction commits)
    ↓
Application calls queueNotification(...).catch(...)
    ↓
[CRASH HERE] ← notification lost forever
```

If the process crashes between the transaction commit and the notification queue call, the notification is lost.

### Solution: Transactional Outbox

The `Notification` table **is** the outbox. Notification rows are created **inside** the same database transaction that creates the appointment (or cancellation, or leave, etc.).

```
┌──────────────────────────────────────────────────────┐
│           Database Transaction                        │
│                                                      │
│  1. INSERT Appointment (status: CONFIRMED)           │
│  2. INSERT SymptomSubmission                         │
│  3. INSERT Notification (status: PENDING) ← patient  │
│  4. INSERT Notification (status: PENDING) ← doctor   │
│  5. INSERT CalendarEvent (status: PENDING)           │
│                                                      │
│  COMMIT                                              │
└──────────────────────────────────────────────────────┘
          │
          │ (Transaction committed — data is durable)
          │
          ▼
┌──────────────────────────────────────────────────────┐
│        Notification Sender Job (every 30 seconds)    │
│                                                      │
│  SELECT * FROM Notification                          │
│  WHERE status = 'PENDING'                            │
│    AND (lastAttemptAt IS NULL                         │
│         OR lastAttemptAt < NOW() - backoff_interval)  │
│  ORDER BY createdAt ASC                              │
│  LIMIT 50                                            │
│  FOR UPDATE SKIP LOCKED  ← prevents double-send      │
│                                                      │
│  For each:                                           │
│    - Attempt email send via Nodemailer               │
│    - Success: status = SENT, sentAt = NOW()          │
│    - Failure: status = FAILED, attempts++,           │
│              lastAttemptAt = NOW(), errorMessage      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Key Properties

| Property | How Achieved |
|----------|-------------|
| Notification never lost after commit | Created inside same transaction |
| Process crash safe | Row exists in DB regardless of crash |
| No duplicate sends | `FOR UPDATE SKIP LOCKED` + status transition |
| Retry with backoff | `lastAttemptAt` + exponential backoff calculation |
| Dead letter | After `maxAttempts`, stays as FAILED for admin review |
| Idempotent | Job only processes PENDING/FAILED with retry eligibility |

### Backoff Calculation

```typescript
function isRetryEligible(notification: Notification): boolean {
  if (notification.status === 'PENDING' && notification.attempts === 0) return true;
  if (notification.status !== 'FAILED') return false;
  if (notification.attempts >= notification.maxAttempts) return false;

  // Exponential backoff: 2^attempts * base interval
  const backoffMs = Math.pow(2, notification.attempts) * 60_000; // 2min, 4min, 8min
  const nextRetryAt = new Date(notification.lastAttemptAt!.getTime() + backoffMs);
  return new Date() >= nextRetryAt;
}
```

### Why Not a Separate Outbox Table?

For this screening project, the `Notification` table serves dual purpose:
- It's the outbox (processing queue for email delivery)
- It's the notification history (audit trail of what was sent)

A separate outbox table would add complexity without benefit at this scale. The `status` field differentiates pending work from completed history.

---

## 11. Final Architecture Review

### 11.1 Corrected Database Design

```prisma
// ─── ENUMS ───────────────────────────────────────────────

enum Role {
  PATIENT
  DOCTOR
  ADMIN
}

enum AppointmentStatus {
  CONFIRMED
  CANCELLED
  COMPLETED
  NO_SHOW
  RESCHEDULED
}

enum NotificationType {
  BOOKING_CONFIRMATION
  APPOINTMENT_REMINDER
  CANCELLATION
  DOCTOR_LEAVE
  MEDICATION_REMINDER
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
}

enum UrgencyLevel {
  LOW
  MEDIUM
  HIGH
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

enum MedicationFrequency {
  ONCE_DAILY
  TWICE_DAILY
  THREE_TIMES_DAILY
  EVERY_8_HOURS
  EVERY_12_HOURS
}

enum CalendarSyncStatus {
  PENDING
  SYNCED
  FAILED
}

// ─── MODELS ──────────────────────────────────────────────

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  firstName       String
  lastName        String
  phone           String?
  role            Role
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  doctorProfile           DoctorProfile?
  patientAppointments     Appointment[]         @relation("PatientAppointments")
  symptomSubmissions      SymptomSubmission[]
  notifications           Notification[]
  calendarConnection      CalendarConnection?

  @@index([email])
  @@index([role])
}

model Specialisation {
  id          String          @id @default(uuid())
  name        String          @unique
  description String?
  createdAt   DateTime        @default(now())

  doctors     DoctorProfile[]
}

model DoctorProfile {
  id                        String    @id @default(uuid())
  userId                    String    @unique
  specialisationId          String
  qualifications            String[]
  bio                       String?
  consultationDurationMin   Int       @default(30)
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  user              User              @relation(fields: [userId], references: [id])
  specialisation    Specialisation    @relation(fields: [specialisationId], references: [id])
  workingHours      DoctorWorkingHour[]
  leaves            DoctorLeave[]
  appointments      Appointment[]     @relation("DoctorAppointments")

  @@index([specialisationId])
}

model DoctorWorkingHour {
  id              String    @id @default(uuid())
  doctorProfileId String
  dayOfWeek       DayOfWeek
  startTime       String    // "09:00" HH:mm
  endTime         String    // "17:00" HH:mm
  isActive        Boolean   @default(true)

  doctorProfile   DoctorProfile @relation(fields: [doctorProfileId], references: [id])

  @@unique([doctorProfileId, dayOfWeek])
}

model DoctorLeave {
  id              String    @id @default(uuid())
  doctorProfileId String
  startDate       DateTime  @db.Date
  endDate         DateTime  @db.Date
  reason          String?
  createdBy       String
  createdAt       DateTime  @default(now())

  doctorProfile   DoctorProfile @relation(fields: [doctorProfileId], references: [id])

  @@index([doctorProfileId, startDate, endDate])
}

model SlotHold {
  id              String    @id @default(uuid())
  doctorProfileId String
  patientId       String
  slotDate        DateTime  @db.Date
  slotStartTime   String
  slotEndTime     String
  expiresAt       DateTime
  createdAt       DateTime  @default(now())

  @@unique([doctorProfileId, slotDate, slotStartTime])
  @@index([expiresAt])
  @@index([patientId])
}

model Appointment {
  id                  String            @id @default(uuid())
  patientId           String
  doctorProfileId     String
  slotDate            DateTime          @db.Date
  slotStartTime       String
  slotEndTime         String
  status              AppointmentStatus @default(CONFIRMED)
  cancellationReason  String?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  patient             User              @relation("PatientAppointments", fields: [patientId], references: [id])
  doctorProfile       DoctorProfile     @relation("DoctorAppointments", fields: [doctorProfileId], references: [id])
  symptomSubmission   SymptomSubmission?
  preVisitSummary     PreVisitSummary?
  visitNote           VisitNote?
  calendarEvents      CalendarEvent[]

  // NOTE: Double-booking prevention via custom partial unique index (see migration)
  // NOT expressible in Prisma schema language

  @@index([patientId])
  @@index([doctorProfileId, slotDate])
  @@index([status])
}

model SymptomSubmission {
  id              String    @id @default(uuid())
  appointmentId   String    @unique
  patientId       String
  symptoms        String    // JSON array
  duration        String?
  severity        String?
  additionalNotes String?
  createdAt       DateTime  @default(now())

  appointment     Appointment @relation(fields: [appointmentId], references: [id])
  patient         User        @relation(fields: [patientId], references: [id])
}

model PreVisitSummary {
  id                  String       @id @default(uuid())
  appointmentId       String       @unique
  urgencyLevel        UrgencyLevel?
  chiefComplaint      String?
  suggestedQuestions  String[]
  rawLlmResponse      String?
  generatedAt         DateTime     @default(now())
  llmProvider         String?
  isFailure           Boolean      @default(false)
  errorMessage        String?

  appointment         Appointment  @relation(fields: [appointmentId], references: [id])
}

model VisitNote {
  id              String    @id @default(uuid())
  appointmentId   String    @unique
  doctorNotes     String
  diagnosis       String?
  followUpDate    DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  appointment       Appointment       @relation(fields: [appointmentId], references: [id])
  prescriptions     Prescription[]
  postVisitSummary  PostVisitSummary?
}

model Prescription {
  id              String    @id @default(uuid())
  visitNoteId     String
  instructions    String?
  createdAt       DateTime  @default(now())

  visitNote       VisitNote     @relation(fields: [visitNoteId], references: [id])
  medications     Medication[]
}

model Medication {
  id              String              @id @default(uuid())
  prescriptionId  String
  name            String
  dosage          String
  frequency       MedicationFrequency
  duration        String
  instructions    String?
  startDate       DateTime            @db.Date
  endDate         DateTime            @db.Date
  isActive        Boolean             @default(true)

  prescription    Prescription        @relation(fields: [prescriptionId], references: [id])
  reminders       MedicationReminder[]

  @@index([isActive, endDate])
}

model MedicationReminder {
  id              String    @id @default(uuid())
  medicationId    String
  patientId       String
  scheduledDate   DateTime  @db.Date
  scheduledTime   String
  notificationId  String?
  createdAt       DateTime  @default(now())

  medication      Medication @relation(fields: [medicationId], references: [id])

  @@unique([medicationId, scheduledDate, scheduledTime])
  @@index([scheduledDate, scheduledTime])
}

model PostVisitSummary {
  id                    String    @id @default(uuid())
  visitNoteId           String    @unique
  patientExplanation    String?
  medicationSchedule    String?
  followUpSteps         String?
  rawLlmResponse        String?
  generatedAt           DateTime  @default(now())
  llmProvider           String?
  isFailure             Boolean   @default(false)
  errorMessage          String?

  visitNote             VisitNote @relation(fields: [visitNoteId], references: [id])
}

model Notification {
  id              String             @id @default(uuid())
  userId          String
  type            NotificationType
  subject         String
  body            String
  status          NotificationStatus @default(PENDING)
  attempts        Int                @default(0)
  maxAttempts     Int                @default(3)
  lastAttemptAt   DateTime?
  sentAt          DateTime?
  errorMessage    String?
  referenceId     String?
  referenceType   String?
  createdAt       DateTime           @default(now())

  user            User               @relation(fields: [userId], references: [id])

  @@index([status, lastAttemptAt])
  @@index([userId])
  @@index([referenceId, referenceType])
}

model CalendarConnection {
  id                    String    @id @default(uuid())
  userId                String    @unique
  encryptedAccessToken  String
  encryptedRefreshToken String
  tokenExpiry           DateTime
  calendarId            String?
  isConnected           Boolean   @default(true)
  disconnectedReason    String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user                  User      @relation(fields: [userId], references: [id])
}

model CalendarEvent {
  id              String              @id @default(uuid())
  appointmentId   String
  userId          String
  googleEventId   String?
  syncStatus      CalendarSyncStatus  @default(PENDING)
  lastSyncAt      DateTime?
  errorMessage    String?
  retryCount      Int                 @default(0)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  appointment     Appointment         @relation(fields: [appointmentId], references: [id])

  @@unique([appointmentId, userId])
  @@index([syncStatus])
}
```

### Custom Migration (Partial Unique Index)

```sql
-- File: prisma/migrations/XXX_add_partial_unique_index/migration.sql
CREATE UNIQUE INDEX "unique_confirmed_appointment"
ON "Appointment" ("doctorProfileId", "slotDate", "slotStartTime")
WHERE "status" = 'CONFIRMED';
```

---

### 11.2 Corrected Appointment Concurrency Strategy

1. **Slot generation**: Dynamic, based on working hours minus (confirmed appointments + active holds + leave dates).
2. **Hold creation**: INSERT into `SlotHold` with unique constraint `(doctorProfileId, slotDate, slotStartTime)`. First writer wins; second gets unique violation → 409.
3. **Booking confirmation**: Transaction that DELETEs the hold (WHERE expiresAt > NOW()) and INSERTs the appointment. Partial unique index is the final safety net.
4. **Expired holds**: Cleaned by cron. Cannot be used to confirm because DELETE checks `expiresAt > NOW()`.
5. **Concurrent confirmations**: If two transactions attempt to create a CONFIRMED appointment for the same slot (shouldn't happen with proper hold logic, but possible in edge cases), the partial unique index rejects the second INSERT.

---

### 11.3 Corrected Slot-Hold Lifecycle

```
[Available]
    │
    ▼ (POST /appointments/hold)
[SlotHold created] ─── unique(doctorProfileId, slotDate, slotStartTime)
    │                   expiresAt = now + 5 minutes
    │
    ├── Patient fills symptom form (frontend, within 5 minutes)
    │
    ▼ (POST /appointments/confirm)
[Transaction]:
    1. DELETE SlotHold WHERE id=X AND patientId=Y AND expiresAt > NOW()
    2. If 0 rows deleted → ABORT (hold expired)
    3. INSERT Appointment (status: CONFIRMED)
    4. INSERT SymptomSubmission
    5. INSERT Notification rows (outbox)
    6. INSERT CalendarEvent rows (PENDING)
    7. COMMIT
    │
    ▼
[CONFIRMED Appointment]
    │
    ├── Notification job sends emails
    ├── Calendar job syncs to Google
    └── LLM generates pre-visit summary (async, non-blocking)

EXPIRY PATH:
[SlotHold] ─── expiresAt passes ─── cron DELETEs row ─── slot is available again
```

---

### 11.4 Corrected Notification/Outbox Strategy

- Notification rows are created **inside** the business transaction (same COMMIT as the appointment/cancellation/leave).
- No notifications are lost due to process crashes after commit.
- A sender job runs every 30 seconds, picks up PENDING rows using `FOR UPDATE SKIP LOCKED`.
- Retries use exponential backoff (2^attempts minutes).
- After `maxAttempts`, row stays FAILED for admin visibility.
- Idempotency: `referenceId` + `referenceType` + `type` + `userId` checked before creation to prevent duplicates.

---

### 11.5 Corrected Calendar Synchronization Model

- `CalendarEvent` has nullable `googleEventId`.
- `syncStatus`: PENDING → SYNCED or PENDING → FAILED (retried by cron).
- Created inside the appointment transaction (cheap INSERT, no Google API call).
- Google API call happens post-commit or via the calendar sync job.
- Calendar failure never affects appointment state.
- Token encryption with AES-256-GCM; decryption isolated to calendar service.
- Revoked tokens detected at call time; connection marked disconnected.

---

### 11.6 Corrected Medication Reminder Model

- `MedicationFrequency` enum: `ONCE_DAILY`, `TWICE_DAILY`, `THREE_TIMES_DAILY`, `EVERY_8_HOURS`, `EVERY_12_HOURS`.
- `MedicationReminder` table with `@@unique([medicationId, scheduledDate, scheduledTime])` prevents duplicate reminders.
- Frequency maps to fixed times (e.g., TWICE_DAILY → 08:00, 20:00).
- Job generates reminder rows + notification rows (outbox) for the next 30-minute window.
- Existing reminder row means "already handled" — job skips (idempotent).

---

### 11.7 Background Job Deployment Assumption

- **Single instance deployment** for the screening project.
- node-cron is adequate for single-instance.
- All jobs are idempotent — duplicate execution produces correct results.
- Duplicate notification prevention via unique checks and `FOR UPDATE SKIP LOCKED`.
- Future scaling documented: migrate to pg-boss or dedicated worker process.

---

### 11.8 Updated Development Milestones

| # | Milestone | Key Deliverable |
|---|-----------|-----------------|
| 1 | Project Init & Database | Monorepo setup, Prisma schema, partial unique index migration, seed |
| 2 | Auth & User Management | JWT, bcrypt, RBAC middleware, register/login |
| 3 | Doctor Management & Availability | Admin creates doctors, slot generation, working hours |
| 4 | Appointment Booking & Concurrency | Hold → confirm flow, partial unique index enforcement, concurrency tests |
| 5 | Symptom Collection & Pre-Visit LLM | Symptom form, LLM provider abstraction, pre-visit summary with failure handling |
| 6 | Visit Notes & Post-Visit LLM | Doctor notes, prescriptions, post-visit summary |
| 7 | Doctor Leave Management | Leave creation, appointment cancellation, hold release, audit trail |
| 8 | Notification System (Outbox) | Transactional outbox, sender job, retry with backoff, all notification types |
| 9 | Medication Reminders | Frequency model, reminder generation job, notification integration |
| 10 | Google Calendar Integration | OAuth flow, token encryption, event CRUD, retry job, disconnect handling |
| 11 | Frontend — Patient Portal | Registration, doctor search, booking flow, symptom form, summaries |
| 12 | Frontend — Doctor Portal | Dashboard, appointments, pre-visit summary, visit notes, prescriptions |
| 13 | Frontend — Admin Portal | Doctor management, specialisations, working hours, leave, monitoring |
| 14 | Integration Testing & Docs | Concurrency tests, leave tests, notification tests, full documentation |

---

## READY FOR MILESTONE 1

Before implementation begins, the following must be true:

1. **pnpm** is installed and available in the development environment.
2. **PostgreSQL** (v14+) is running and accessible locally (or via Docker).
3. **Node.js** (v20+) is installed.
4. The workspace root directory is confirmed and empty (or contains only architecture docs).
5. The developer has reviewed and approved this revised architecture document.
6. A `.env` file template is agreed upon (see original architecture Section 14).
7. The partial unique index strategy is understood: Prisma schema + manual migration SQL.
8. Single-instance deployment assumption is accepted for the screening project.
9. The transactional outbox pattern (notification rows inside business transactions) is approved.
10. LLM provider choice is confirmed (OpenAI/Anthropic/Mock) — Mock is sufficient for initial milestones.
