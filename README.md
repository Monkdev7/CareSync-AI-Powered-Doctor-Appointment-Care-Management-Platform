# CareSync — AI-Powered Healthcare Appointment & Follow-up Manager

Full-stack healthcare appointment platform with role-based portals (Patient, Doctor, Admin), AI-powered pre/post-visit summaries, double-booking prevention, notification outbox, and Google Calendar integration.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker
pnpm install
docker compose up -d         # PostgreSQL
cp .env.example apps/api/.env
pnpm db:migrate              # Apply migrations
pnpm db:seed                 # Seed development data
pnpm dev:api                 # http://localhost:3000
cd apps/web && pnpm dev      # http://localhost:5173
```

## Architecture (System Design)

**Stack:** Node.js + Fastify + TypeScript + Prisma + PostgreSQL + React + Vite

**Double-Booking Prevention:** PostgreSQL partial unique index `WHERE status = 'CONFIRMED'` guarantees at most one confirmed appointment per doctor/date/time slot. Application-level availability checks provide early rejection; the database constraint is the authoritative last line of defense. Cancelled appointments do not block rebooking.

**Slot Hold Mechanism:** A 5-minute `SlotHold` (enforced by DB unique constraint `doctorProfileId + slotDate + slotStartTime`) temporarily reserves a slot while the patient fills symptoms. Confirmation atomically DELETEs the hold (`WHERE expiresAt > NOW()`) and INSERTs the appointment in one transaction. Expired holds are cleaned by a background job and ignored by availability queries.

**Doctor Leave Conflict Handling:** When admin creates leave, a transaction: (1) creates the leave record, (2) cancels all CONFIRMED appointments in the range, (3) creates PENDING notification records for affected patients, (4) releases any active slot holds. Availability returns zero slots for leave dates.

**Notification Reliability (Outbox Pattern):** Notification rows are created inside business transactions (same COMMIT as appointments/cancellations). A sender job picks up PENDING notifications, attempts email delivery, marks SENT on success or FAILED with exponential backoff (2^attempts × 60s). After `maxAttempts` (3), stays FAILED for admin review. Already-SENT notifications are never reprocessed.

**LLM Failure Handling:** Pre-visit and post-visit summaries are generated asynchronously after booking/prescription creation. LLM failure never blocks any user operation. Failed summaries store `isFailure: true` with the error. Output is validated with Zod schemas before persistence. A mock provider enables testing without real API keys.

**Calendar Synchronization:** `CalendarEvent` rows (PENDING) are created in the booking transaction. A background sync job processes them using the CalendarProvider abstraction. Success stores `googleEventId` + SYNCED status. Failure stores error + FAILED. Calendar failure never affects appointment state.

**Background Jobs:** Single-instance deployment with idempotent jobs (slot hold expiry, notification sender, calendar sync, medication reminders). All use DB state checks to prevent duplicate processing.

## API Endpoints

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | /api/auth/register | Public | Patient registration |
| POST | /api/auth/login | Public | Login (all roles) |
| GET | /api/users/me | Auth | Current profile |
| PATCH | /api/users/:id/status | Admin | Activate/deactivate user |
| GET/POST/PATCH/DEL | /api/specialisations | Auth/Admin | Specialisation CRUD |
| POST | /api/doctors | Admin | Create doctor (atomic) |
| GET | /api/doctors | Auth | List/filter doctors |
| GET | /api/doctors/:id | Auth | Doctor detail |
| PUT | /api/doctors/:id/working-hours | Admin | Set working hours |
| GET | /api/doctors/:id/availability?date= | Auth | Dynamic slot availability |
| POST | /api/doctors/:id/leave | Admin | Create leave (cancels conflicts) |
| POST | /api/appointments/hold | Patient | 5-min slot hold |
| POST | /api/appointments/confirm | Patient | Confirm with symptoms |
| GET | /api/appointments | Auth | List own appointments |
| GET | /api/appointments/:id | Owner | Appointment detail |
| GET | /api/appointments/:id/pre-summary | Doctor | AI pre-visit summary |
| POST | /api/appointments/:id/visit-note | Doctor | Create visit note |
| POST | /api/appointments/:id/prescription | Doctor | Create prescription |
| GET | /api/appointments/:id/post-summary | Patient/Doctor | AI post-visit summary |

## Database Schema

17 models: User, Specialisation, DoctorProfile, DoctorWorkingHour, DoctorLeave, SlotHold, Appointment, SymptomSubmission, PreVisitSummary, VisitNote, Prescription, Medication, MedicationReminder, PostVisitSummary, Notification, CalendarConnection, CalendarEvent.

Critical constraint: `CREATE UNIQUE INDEX "unique_confirmed_appointment" ON "Appointment" ("doctorProfileId","slotDate","slotStartTime") WHERE "status" = 'CONFIRMED'` — implemented via custom Prisma migration.

## LLM Prompts

**Pre-visit:** Receives symptoms/duration/severity → returns `{urgencyLevel, chiefComplaint, suggestedQuestions[3]}`. Validated with Zod. Mock provider returns deterministic output for testing.

**Post-visit:** Receives doctor notes/diagnosis/medications → returns `{patientExplanation, medicationSchedule, followUpSteps}`. Provider selected via `LLM_PROVIDER` env var (mock/openai).

## Google Calendar Setup

1. Create Google Cloud project with Calendar API enabled
2. Create OAuth 2.0 credentials (Web application type)
3. Set redirect URI to `http://localhost:3000/api/v1/calendar/callback`
4. Configure: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
5. The CalendarProvider abstraction uses OAuth access tokens to create/manage events

## Email Configuration

Uses Nodemailer SMTP. Configure: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. For development, use Mailtrap or similar. Mock sender is used when SMTP is not configured.

## Environment Variables

See `.env.example` for all variables with descriptions.

## Running Tests

```bash
pnpm --filter @healthcare/api test        # All 198 assertions
pnpm --filter @healthcare/api typecheck   # TypeScript
pnpm --filter @healthcare/api db:test     # DB constraints only
```

## Project Structure

```
apps/api/src/
  auth/          — JWT, bcrypt, RBAC middleware
  users/         — Profile management
  specialisations/ — Specialisation CRUD
  doctors/       — Doctor profiles, working hours
  availability/  — Dynamic slot generation
  appointments/  — Hold, confirm, list
  visits/        — Visit notes, prescriptions
  leaves/        — Doctor leave management
  llm/           — LLM provider abstraction, pre/post summaries
  notifications/ — Email sender, outbox processor
  calendar/      — Calendar provider, sync processor
  jobs/          — Background job registry
apps/web/src/    — React frontend (Patient/Doctor/Admin portals)
```
