# System Design — Healthcare Appointment Platform

## Double-Booking Prevention

The system uses a two-layer defense against simultaneous booking of the same doctor slot.

**Layer 1 — Application-level availability check:** Before creating a slot hold, the service queries existing CONFIRMED appointments and active SlotHolds for the requested doctor/date/time. If the slot is occupied, the request is rejected immediately with HTTP 409.

**Layer 2 — PostgreSQL partial unique index:** A database-level constraint `CREATE UNIQUE INDEX "unique_confirmed_appointment" ON "Appointment" ("doctorProfileId", "slotDate", "slotStartTime") WHERE "status" = 'CONFIRMED'` guarantees that at most one CONFIRMED appointment exists per doctor/date/time combination. If two concurrent transactions pass the application check simultaneously, PostgreSQL rejects the second INSERT at commit time. This constraint is the authoritative last line of defense — it cannot be bypassed by application bugs or race conditions.

The partial index only covers CONFIRMED rows, so CANCELLED appointments do not permanently block slots. A new booking can reuse a previously cancelled slot.

## Slot Hold Mechanism

When a patient selects a slot, a `SlotHold` record is created with a 5-minute expiry (`expiresAt = NOW() + 5 min`). The SlotHold table has a unique constraint on `(doctorProfileId, slotDate, slotStartTime)`, preventing two patients from holding the same slot simultaneously.

**Confirmation flow:** The patient fills in symptoms, then confirms. The confirmation transaction atomically: (1) DELETEs the hold using `WHERE id = $holdId AND patientId = $userId AND expiresAt > NOW() RETURNING ...`, (2) creates the Appointment with status CONFIRMED, (3) creates SymptomSubmission, CalendarEvent, and Notification records.

If the DELETE returns zero rows (hold expired, already consumed, or belongs to another patient), the transaction aborts with HTTP 409. The patient must select a new slot.

**Expiry handling:** A background job periodically deletes holds where `expiresAt < NOW()`. However, correctness does not depend on the cleanup job — the availability service filters out expired holds by checking `expiresAt > NOW()` at query time. The DELETE-with-expiry-check in the confirmation transaction ensures an expired hold can never produce an appointment.

**Concurrency race conditions:**
- Two patients hold the same slot → DB unique constraint resolves (one wins, one gets 409).
- Hold expires during confirmation → atomic DELETE returns 0 rows → confirmation aborted.
- Cleanup job runs during confirmation → DELETE-with-RETURNING is atomic; if cleanup already removed the hold, confirmation fails safely.

## Doctor Leave Conflict Handling

When an admin creates a doctor leave period, the system executes a single database transaction that:

1. Validates the date range and checks for overlapping leave periods (rejects with 409 if overlap exists).
2. Creates the `DoctorLeave` record.
3. Finds all CONFIRMED appointments for the doctor within the leave date range.
4. Updates those appointments to status CANCELLED with reason `"Doctor leave: {leaveId}"`.
5. Creates PENDING notification records for each affected patient.
6. Marks associated CalendarEvent records as FAILED (for deletion on next sync).
7. Deletes any active SlotHolds within the leave date range.

All operations happen atomically — if any step fails, the entire transaction rolls back. No patient is left with a confirmed appointment during a leave period.

The availability service checks DoctorLeave when generating slots: if the requested date falls within any leave period, zero slots are returned. This prevents new bookings during leave.

## Notification Failure Handling

Notifications use a transactional outbox pattern. Notification rows are created inside the same database transaction as the business operation (booking confirmation, leave cancellation). Once the transaction commits, the notification record is durable regardless of process crashes.

A background sender job processes notifications:
- Picks up rows with status PENDING (attempts=0) or FAILED (with backoff elapsed, attempts < maxAttempts).
- Attempts email delivery via the EmailSender abstraction (Nodemailer in production, mock in tests).
- On success: updates status to SENT, records `sentAt` timestamp.
- On failure: increments `attempts`, sets `lastAttemptAt`, records `errorMessage`, keeps status as FAILED.

**Exponential backoff:** Retry delay = `2^attempts × 60 seconds` (2 min, 4 min, 8 min). A notification is only retried once the backoff period has elapsed.

**Dead letter:** After `maxAttempts` (default 3) is reached, the notification stays FAILED permanently for admin review. It is never reprocessed.

**Idempotency:** The sender only processes PENDING/FAILED notifications that haven't exceeded their retry budget. Already-SENT notifications are never touched. The system is safe for repeated job execution.

**Email failure isolation:** Email delivery failures never corrupt or roll back business transactions. The appointment/leave operation commits successfully regardless of email infrastructure status.
