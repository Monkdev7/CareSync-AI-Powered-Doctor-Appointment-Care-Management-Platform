# Healthcare Appointment & Follow-up Manager — System Architecture

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository & Project Structure](#2-repository--project-structure)
3. [Database Entity Model](#3-database-entity-model)
4. [API Module Structure](#4-api-module-structure)
5. [Authentication & RBAC Design](#5-authentication--rbac-design)
6. [Appointment Booking & Concurrency Strategy](#6-appointment-booking--concurrency-strategy)
7. [Slot-Hold Strategy](#7-slot-hold-strategy)
8. [Doctor Leave Conflict Strategy](#8-doctor-leave-conflict-strategy)
9. [LLM Integration Strategy](#9-llm-integration-strategy)
10. [Email Notification Strategy](#10-email-notification-strategy)
11. [Google Calendar Synchronization Strategy](#11-google-calendar-synchronization-strategy)
12. [Background Job Strategy](#12-background-job-strategy)
13. [Failure & Retry Strategy](#13-failure--retry-strategy)
14. [Environment Variable Design](#14-environment-variable-design)
15. [Testing Strategy](#15-testing-strategy)
16. [Deployment Strategy](#16-deployment-strategy)
17. [Development Milestones](#17-development-milestones)

---

## 1. System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TS)                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐   │
│  │ Patient Portal│  │ Doctor Portal │  │    Admin Portal        │   │
│  └───────┬───────┘  └───────┬───────┘  └───────────┬───────────┘   │
└──────────┼───────────────────┼──────────────────────┼───────────────┘
           │                   │                      │
           ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Express + TS)                        │
│  ┌────────┐ ┌──────────┐ ┌────────────┐ ┌─────────────────────┐    │
│  │  Auth  │ │  RBAC    │ │ Validation │ │  Rate Limiting      │    │
│  │Middleware│ │Middleware│ │ Middleware │ │  Middleware          │    │
│  └────────┘ └──────────┘ └────────────┘ └─────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                       SERVICE LAYER                                  │
│  ┌──────┐ ┌────────┐ ┌──────────────┐ ┌───────────┐ ┌──────────┐  │
│  │ Auth │ │ Doctor │ │ Appointment  │ │  Visit    │ │ Calendar │  │
│  └──────┘ └────────┘ └──────────────┘ └───────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌────────────────────┐  │
│  │ Symptom  │ │Notification│ │    LLM     │ │  Admin            │  │
│  └──────────┘ └──────────┘ └─────────────┘ └────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                     DATA ACCESS LAYER (Prisma ORM)                   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                             │
│  • Unique constraints for slot prevention                           │
│  • Row-level locking for concurrency                                │
│  • Indexes for query performance                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL INTEGRATIONS                            │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────────────┐    │
│  │  LLM API    │  │ Google Cal API│  │  SMTP (Nodemailer)     │    │
│  │ (Pluggable) │  │  (OAuth 2.0)  │  │                        │    │
│  └─────────────┘  └───────────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     BACKGROUND JOBS (node-cron)                      │
│  • Slot hold expiry                                                 │
│  • Appointment reminders                                            │
│  • Medication reminders                                             │
│  • Notification retries                                             │
│  • Calendar sync reconciliation                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Architecture Principles

- **Monorepo** with shared types between frontend and backend
- **Layered architecture**: Routes → Controllers → Services → Repositories
- **Domain-driven module organization** on both frontend and backend
- **Fail-safe external integrations**: LLM, email, calendar failures never corrupt core transactions
- **Database-level concurrency guarantees**: unique constraints + row-level locking
- **Stateless API server**: JWT-based auth, no server sessions

---

## 2. Repository & Project Structure

```
healthcare-platform/
├── .env.example
├── .gitignore
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── ARCHITECTURE.md
├── docs/
│   ├── api.md
│   ├── database-schema.md
│   ├── llm-prompts.md
│   ├── google-calendar-setup.md
│   ├── deployment.md
│   └── local-development.md
│
├── packages/
│   └── shared/                     # Shared TypeScript types
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types/
│           │   ├── auth.ts
│           │   ├── user.ts
│           │   ├── doctor.ts
│           │   ├── appointment.ts
│           │   ├── symptom.ts
│           │   ├── visit.ts
│           │   ├── notification.ts
│           │   └── calendar.ts
│           ├── enums/
│           │   ├── roles.ts
│           │   ├── appointment-status.ts
│           │   └── notification-type.ts
│           └── index.ts
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   └── src/
│       ├── index.ts                # Express app entry
│       ├── app.ts                  # Express app configuration
│       ├── config/
│       │   ├── index.ts            # Central config loader
│       │   ├── database.ts
│       │   ├── auth.ts
│       │   ├── email.ts
│       │   ├── calendar.ts
│       │   └── llm.ts
│       ├── middleware/
│       │   ├── authenticate.ts
│       │   ├── authorize.ts
│       │   ├── validate.ts
│       │   ├── error-handler.ts
│       │   └── rate-limiter.ts
│       ├── modules/
│       │   ├── auth/
│       │   │   ├── auth.routes.ts
│       │   │   ├── auth.controller.ts
│       │   │   ├── auth.service.ts
│       │   │   ├── auth.validator.ts
│       │   │   └── auth.repository.ts
│       │   ├── users/
│       │   │   ├── users.routes.ts
│       │   │   ├── users.controller.ts
│       │   │   ├── users.service.ts
│       │   │   └── users.repository.ts
│       │   ├── doctors/
│       │   │   ├── doctors.routes.ts
│       │   │   ├── doctors.controller.ts
│       │   │   ├── doctors.service.ts
│       │   │   ├── doctors.validator.ts
│       │   │   └── doctors.repository.ts
│       │   ├── availability/
│       │   │   ├── availability.routes.ts
│       │   │   ├── availability.controller.ts
│       │   │   ├── availability.service.ts
│       │   │   ├── availability.validator.ts
│       │   │   └── availability.repository.ts
│       │   ├── appointments/
│       │   │   ├── appointments.routes.ts
│       │   │   ├── appointments.controller.ts
│       │   │   ├── appointments.service.ts
│       │   │   ├── appointments.validator.ts
│       │   │   └── appointments.repository.ts
│       │   ├── symptoms/
│       │   │   ├── symptoms.routes.ts
│       │   │   ├── symptoms.controller.ts
│       │   │   ├── symptoms.service.ts
│       │   │   ├── symptoms.validator.ts
│       │   │   └── symptoms.repository.ts
│       │   ├── visits/
│       │   │   ├── visits.routes.ts
│       │   │   ├── visits.controller.ts
│       │   │   ├── visits.service.ts
│       │   │   ├── visits.validator.ts
│       │   │   └── visits.repository.ts
│       │   ├── prescriptions/
│       │   │   ├── prescriptions.routes.ts
│       │   │   ├── prescriptions.controller.ts
│       │   │   ├── prescriptions.service.ts
│       │   │   ├── prescriptions.validator.ts
│       │   │   └── prescriptions.repository.ts
│       │   ├── notifications/
│       │   │   ├── notifications.routes.ts
│       │   │   ├── notifications.controller.ts
│       │   │   ├── notifications.service.ts
│       │   │   └── notifications.repository.ts
│       │   ├── calendar/
│       │   │   ├── calendar.routes.ts
│       │   │   ├── calendar.controller.ts
│       │   │   ├── calendar.service.ts
│       │   │   └── calendar.repository.ts
│       │   └── admin/
│       │       ├── admin.routes.ts
│       │       ├── admin.controller.ts
│       │       ├── admin.service.ts
│       │       └── admin.validator.ts
│       ├── integrations/
│       │   ├── llm/
│       │   │   ├── llm.provider.ts          # Abstract provider interface
│       │   │   ├── llm.service.ts           # Orchestration layer
│       │   │   ├── providers/
│       │   │   │   ├── openai.provider.ts
│       │   │   │   └── anthropic.provider.ts
│       │   │   ├── prompts/
│       │   │   │   ├── pre-visit-summary.ts
│       │   │   │   └── post-visit-summary.ts
│       │   │   └── schemas/
│       │   │       ├── pre-visit-output.ts
│       │   │       └── post-visit-output.ts
│       │   ├── email/
│       │   │   ├── email.service.ts
│       │   │   ├── email.templates.ts
│       │   │   └── email.queue.ts
│       │   └── google-calendar/
│       │       ├── calendar.client.ts
│       │       ├── calendar.oauth.ts
│       │       └── calendar.sync.ts
│       ├── jobs/
│       │   ├── index.ts                     # Job scheduler registry
│       │   ├── slot-hold-expiry.job.ts
│       │   ├── appointment-reminder.job.ts
│       │   ├── medication-reminder.job.ts
│       │   ├── notification-retry.job.ts
│       │   └── calendar-sync.job.ts
│       ├── utils/
│       │   ├── slot-generator.ts
│       │   ├── date.ts
│       │   ├── pagination.ts
│       │   ├── api-response.ts
│       │   └── logger.ts
│       └── types/
│           └── express.d.ts                 # Express type augmentation
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   ├── client.ts                    # Axios instance + interceptors
│       │   ├── auth.api.ts
│       │   ├── doctors.api.ts
│       │   ├── appointments.api.ts
│       │   ├── symptoms.api.ts
│       │   ├── visits.api.ts
│       │   ├── notifications.api.ts
│       │   └── calendar.api.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useDoctors.ts
│       │   ├── useAppointments.ts
│       │   └── useNotifications.ts
│       ├── contexts/
│       │   └── AuthContext.tsx
│       ├── components/
│       │   ├── common/
│       │   │   ├── Layout.tsx
│       │   │   ├── Navbar.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── LoadingSpinner.tsx
│       │   │   ├── EmptyState.tsx
│       │   │   ├── ConfirmDialog.tsx
│       │   │   ├── StatusBadge.tsx
│       │   │   └── Notification.tsx
│       │   ├── forms/
│       │   │   ├── LoginForm.tsx
│       │   │   ├── RegisterForm.tsx
│       │   │   ├── SymptomForm.tsx
│       │   │   ├── VisitNoteForm.tsx
│       │   │   └── PrescriptionForm.tsx
│       │   └── appointments/
│       │       ├── SlotPicker.tsx
│       │       ├── AppointmentCard.tsx
│       │       └── AppointmentTimeline.tsx
│       ├── pages/
│       │   ├── patient/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── DoctorSearch.tsx
│       │   │   ├── DoctorDetail.tsx
│       │   │   ├── BookAppointment.tsx
│       │   │   ├── MyAppointments.tsx
│       │   │   ├── AppointmentDetail.tsx
│       │   │   ├── PostVisitSummary.tsx
│       │   │   └── MedicationReminders.tsx
│       │   ├── doctor/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── UpcomingAppointments.tsx
│       │   │   ├── AppointmentDetail.tsx
│       │   │   ├── VisitNotes.tsx
│       │   │   ├── Prescriptions.tsx
│       │   │   └── Schedule.tsx
│       │   └── admin/
│       │       ├── Dashboard.tsx
│       │       ├── DoctorManagement.tsx
│       │       ├── Specialisations.tsx
│       │       ├── WorkingHours.tsx
│       │       ├── DoctorLeave.tsx
│       │       ├── AppointmentOverview.tsx
│       │       └── NotificationMonitor.tsx
│       ├── routes/
│       │   ├── index.tsx
│       │   ├── PatientRoutes.tsx
│       │   ├── DoctorRoutes.tsx
│       │   └── AdminRoutes.tsx
│       ├── styles/
│       │   └── globals.css
│       └── utils/
│           ├── date.ts
│           └── constants.ts
│
└── tests/
    ├── backend/
    │   ├── unit/
    │   │   ├── services/
    │   │   └── utils/
    │   ├── integration/
    │   │   ├── auth.test.ts
    │   │   ├── appointments.test.ts
    │   │   └── concurrency.test.ts
    │   └── setup.ts
    └── frontend/
        └── components/
```

---

## 3. Database Entity Model

### Prisma Schema Design

```prisma
// ─── ENUMS ───────────────────────────────────────────────

enum Role {
  PATIENT
  DOCTOR
  ADMIN
}

enum AppointmentStatus {
  HELD          // Slot temporarily held
  CONFIRMED     // Booking finalized
  CANCELLED     // Cancelled by patient or admin
  COMPLETED     // Visit completed
  NO_SHOW       // Patient did not attend
  RESCHEDULED   // Moved to another slot
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
  RETRYING
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

  // Relations
  doctorProfile           DoctorProfile?
  patientAppointments     Appointment[]       @relation("PatientAppointments")
  symptomSubmissions      SymptomSubmission[]
  notifications           Notification[]
  calendarConnections     CalendarConnection[]

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
  id                String    @id @default(uuid())
  userId            String    @unique
  specialisationId  String
  qualifications    String[]
  bio               String?
  consultationDurationMin  Int   @default(30)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Relations
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
  startTime       String    // "09:00" (HH:mm format)
  endTime         String    // "17:00" (HH:mm format)
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
  createdBy       String    // Admin user ID
  createdAt       DateTime  @default(now())

  doctorProfile   DoctorProfile @relation(fields: [doctorProfileId], references: [id])

  @@index([doctorProfileId, startDate, endDate])
}

model SlotHold {
  id              String    @id @default(uuid())
  doctorProfileId String
  patientId       String
  slotDate        DateTime  @db.Date
  slotStartTime   String    // "09:00"
  slotEndTime     String    // "09:30"
  expiresAt       DateTime
  createdAt       DateTime  @default(now())

  @@unique([doctorProfileId, slotDate, slotStartTime])
  @@index([expiresAt])
}

model Appointment {
  id              String            @id @default(uuid())
  patientId       String
  doctorProfileId String
  slotDate        DateTime          @db.Date
  slotStartTime   String            // "09:00"
  slotEndTime     String            // "09:30"
  status          AppointmentStatus @default(CONFIRMED)
  cancellationReason String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  // Relations
  patient         User              @relation("PatientAppointments", fields: [patientId], references: [id])
  doctorProfile   DoctorProfile     @relation("DoctorAppointments", fields: [doctorProfileId], references: [id])
  symptomSubmission SymptomSubmission?
  preVisitSummary PreVisitSummary?
  visitNote       VisitNote?
  calendarEvents  CalendarEvent[]

  // CRITICAL: Prevents double-booking at database level
  @@unique([doctorProfileId, slotDate, slotStartTime, status], name: "unique_active_booking")
  @@index([patientId])
  @@index([doctorProfileId, slotDate])
  @@index([status])
}

model SymptomSubmission {
  id              String    @id @default(uuid())
  appointmentId   String    @unique
  patientId       String
  symptoms        String    // JSON array of symptom descriptions
  duration        String?
  severity        String?
  additionalNotes String?
  createdAt       DateTime  @default(now())

  appointment     Appointment @relation(fields: [appointmentId], references: [id])
  patient         User        @relation(fields: [patientId], references: [id])
}

model PreVisitSummary {
  id              String       @id @default(uuid())
  appointmentId   String       @unique
  urgencyLevel    UrgencyLevel
  chiefComplaint  String
  suggestedQuestions String[]   // Array of 3 suggested questions
  rawLlmResponse  String?      // Store raw response for debugging
  generatedAt     DateTime     @default(now())
  llmProvider     String       // Which provider generated this
  isFailure       Boolean      @default(false)

  appointment     Appointment  @relation(fields: [appointmentId], references: [id])
}

model VisitNote {
  id              String    @id @default(uuid())
  appointmentId   String    @unique
  doctorNotes     String
  diagnosis       String?
  followUpDate    DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  appointment     Appointment   @relation(fields: [appointmentId], references: [id])
  prescriptions   Prescription[]
  postVisitSummary PostVisitSummary?
}

model Prescription {
  id              String    @id @default(uuid())
  visitNoteId     String
  medications     Medication[]
  instructions    String?
  createdAt       DateTime  @default(now())

  visitNote       VisitNote @relation(fields: [visitNoteId], references: [id])
}

model Medication {
  id              String    @id @default(uuid())
  prescriptionId  String
  name            String
  dosage          String
  frequency       String    // "twice daily", "every 8 hours"
  duration        String    // "7 days", "2 weeks"
  instructions    String?   // "take with food"
  startDate       DateTime  @db.Date
  endDate         DateTime? @db.Date

  prescription    Prescription @relation(fields: [prescriptionId], references: [id])
}

model PostVisitSummary {
  id                    String    @id @default(uuid())
  visitNoteId           String    @unique
  patientExplanation    String    // Patient-friendly explanation
  medicationSchedule    String    // Structured medication info
  followUpSteps         String    // What patient should do next
  rawLlmResponse        String?
  generatedAt           DateTime  @default(now())
  llmProvider           String
  isFailure             Boolean   @default(false)

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
  metadata        Json?              // Reference IDs, context
  createdAt       DateTime           @default(now())

  user            User               @relation(fields: [userId], references: [id])

  @@index([status, lastAttemptAt])
  @@index([userId])
}

model CalendarConnection {
  id              String    @id @default(uuid())
  userId          String
  accessToken     String
  refreshToken    String
  tokenExpiry     DateTime
  calendarId      String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User      @relation(fields: [userId], references: [id])

  @@unique([userId])
}

model CalendarEvent {
  id              String    @id @default(uuid())
  appointmentId   String
  userId          String    // Owner of this calendar event
  googleEventId   String
  syncStatus      String    @default("synced") // synced, pending, failed
  lastSyncAt      DateTime  @default(now())

  appointment     Appointment @relation(fields: [appointmentId], references: [id])

  @@unique([appointmentId, userId])
  @@index([googleEventId])
}
```

### Key Relationships

| Relationship | Cardinality | Purpose |
|---|---|---|
| User → DoctorProfile | 1:1 (optional) | Only users with DOCTOR role have a profile |
| DoctorProfile → Specialisation | N:1 | Each doctor has one specialisation |
| DoctorProfile → DoctorWorkingHour | 1:N | One entry per active day |
| DoctorProfile → DoctorLeave | 1:N | Multiple leave periods |
| DoctorProfile → Appointment | 1:N | A doctor has many appointments |
| User (patient) → Appointment | 1:N | A patient books many appointments |
| Appointment → SymptomSubmission | 1:1 | One symptom set per appointment |
| Appointment → PreVisitSummary | 1:1 | One AI summary per appointment |
| Appointment → VisitNote | 1:1 | One note per completed visit |
| VisitNote → Prescription | 1:N | A visit may have multiple prescriptions |
| Prescription → Medication | 1:N | Each prescription has multiple medications |
| VisitNote → PostVisitSummary | 1:1 | One AI summary per visit |
| User → Notification | 1:N | Users receive multiple notifications |
| Appointment → CalendarEvent | 1:N | Events for both patient and doctor |

---

## 4. API Module Structure

### Base URL: `/api/v1`

### Auth Module (`/auth`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/auth/register` | Patient registration | Public |
| POST | `/auth/login` | Login (all roles) | Public |
| POST | `/auth/refresh` | Refresh access token | Authenticated |
| POST | `/auth/logout` | Invalidate refresh token | Authenticated |
| GET | `/auth/me` | Get current user profile | Authenticated |

### Users Module (`/users`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/users/profile` | Get own profile | Authenticated |
| PUT | `/users/profile` | Update own profile | Authenticated |
| PUT | `/users/change-password` | Change password | Authenticated |

### Doctors Module (`/doctors`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/doctors` | List doctors (search, filter) | Patient |
| GET | `/doctors/:id` | Get doctor detail | Patient |
| GET | `/doctors/specialisations` | List specialisations | Patient |
| GET | `/doctors/:id/availability` | Get available slots | Patient |

### Availability Module (`/availability`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/availability/doctors/:id/slots` | Available slots for date range | Patient |
| GET | `/availability/doctors/:id/working-hours` | Doctor schedule | Doctor (own), Admin |
| PUT | `/availability/doctors/:id/working-hours` | Update working hours | Admin |

### Appointments Module (`/appointments`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/appointments/hold` | Hold a slot temporarily | Patient |
| POST | `/appointments/confirm` | Confirm booking | Patient |
| GET | `/appointments` | List own appointments | Patient, Doctor |
| GET | `/appointments/:id` | Appointment details | Owner |
| PUT | `/appointments/:id/cancel` | Cancel appointment | Patient, Admin |
| PUT | `/appointments/:id/reschedule` | Reschedule | Patient |
| PUT | `/appointments/:id/complete` | Mark as completed | Doctor |
| PUT | `/appointments/:id/no-show` | Mark as no-show | Doctor |

### Symptoms Module (`/symptoms`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/symptoms/appointments/:id` | Submit symptoms | Patient |
| GET | `/symptoms/appointments/:id` | Get symptoms | Patient (own), Doctor |

### Visits Module (`/visits`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/visits/appointments/:id/notes` | Create visit note | Doctor |
| GET | `/visits/appointments/:id/notes` | Get visit note | Doctor, Patient |
| GET | `/visits/appointments/:id/pre-summary` | Get pre-visit AI summary | Doctor |
| GET | `/visits/appointments/:id/post-summary` | Get post-visit AI summary | Patient, Doctor |

### Prescriptions Module (`/prescriptions`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/prescriptions/visits/:id` | Create prescription | Doctor |
| GET | `/prescriptions/visits/:id` | Get prescription | Doctor, Patient |
| GET | `/prescriptions/my` | Patient's all prescriptions | Patient |

### Notifications Module (`/notifications`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/notifications` | List own notifications | Authenticated |
| PUT | `/notifications/:id/read` | Mark as read | Authenticated |

### Calendar Module (`/calendar`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/calendar/auth-url` | Get Google OAuth URL | Authenticated |
| GET | `/calendar/callback` | OAuth callback | System |
| DELETE | `/calendar/disconnect` | Disconnect calendar | Authenticated |
| GET | `/calendar/status` | Check connection status | Authenticated |

### Admin Module (`/admin`)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/admin/doctors` | Register a doctor | Admin |
| PUT | `/admin/doctors/:id` | Update doctor | Admin |
| GET | `/admin/doctors` | List all doctors | Admin |
| POST | `/admin/specialisations` | Create specialisation | Admin |
| POST | `/admin/doctors/:id/leave` | Create leave period | Admin |
| DELETE | `/admin/doctors/:id/leave/:leaveId` | Cancel leave | Admin |
| GET | `/admin/appointments` | All appointments | Admin |
| GET | `/admin/notifications/status` | Notification health | Admin |

### Response Format (Consistent)

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "SLOT_ALREADY_BOOKED",
    "message": "This time slot is no longer available.",
    "details": []
  }
}
```

---

## 5. Authentication & RBAC Design

### Authentication Flow

```
1. Registration (Patient only via public endpoint)
   → Validate input → Hash password (bcrypt, 12 rounds) → Create user → Return tokens

2. Login
   → Validate credentials → Compare hash → Generate access + refresh tokens

3. Token Structure
   Access Token (15 min expiry):
   {
     sub: userId,
     role: "PATIENT" | "DOCTOR" | "ADMIN",
     email: string,
     iat, exp
   }

   Refresh Token (7 days expiry):
   {
     sub: userId,
     type: "refresh",
     iat, exp
   }
```

### RBAC Middleware Design

```typescript
// Usage in routes:
router.get('/appointments', authenticate, authorize(['PATIENT', 'DOCTOR']), controller.list);

// authorize middleware checks:
// 1. Token is valid and not expired
// 2. User role matches allowed roles
// 3. For resource-specific endpoints: user owns the resource OR has admin role
```

### Authorization Rules

| Resource | Patient | Doctor | Admin |
|----------|---------|--------|-------|
| Own profile | Read/Write | Read/Write | Read/Write |
| Doctor search | Read | — | — |
| Own appointments | Read/Write | Read | Read |
| Doctor's appointments | — | Read (own) | Read (all) |
| Symptom submission | Write (own) | Read (patients') | — |
| Visit notes | Read (own) | Write (own patients) | — |
| Working hours | — | Read (own) | Read/Write |
| Doctor leave | — | Read (own) | Write |
| Notifications | Read (own) | Read (own) | Read (all) |

### Security Implementation

- Passwords hashed with bcrypt (cost factor 12)
- JWT signed with RS256 or HS256 (configurable)
- Refresh token rotation on use
- Rate limiting on auth endpoints (5 attempts/15 min)
- Input validation on all endpoints via Zod schemas
- SQL injection prevention via Prisma parameterized queries
- CORS restricted to frontend origin
- Helmet.js for HTTP security headers

---

## 6. Appointment Booking & Concurrency Strategy

### How Available Slots Are Generated

Slots are generated dynamically (not stored as rows) based on:

1. Doctor's `DoctorWorkingHour` entries for the requested day of week
2. Doctor's `consultationDurationMin` (default 30 min)
3. Existing confirmed appointments for that date
4. Active slot holds for that date
5. Doctor leave periods covering that date

```
Algorithm: generateAvailableSlots(doctorId, date)
  1. Get working hours for date's dayOfWeek
  2. If no working hours → return []
  3. Check if date falls in any DoctorLeave → return []
  4. Generate all possible slot times within working hours
  5. Fetch existing CONFIRMED/HELD appointments for (doctorId, date)
  6. Fetch active SlotHolds for (doctorId, date)
  7. Subtract booked + held slots from all possible slots
  8. Return remaining available slots
```

### How Concurrent Requests Are Handled

**Database-Level Double-Booking Prevention:**

```sql
-- Unique constraint on Appointment table:
UNIQUE (doctorProfileId, slotDate, slotStartTime) WHERE status IN ('CONFIRMED', 'HELD')
```

Since PostgreSQL doesn't support partial unique indexes via Prisma natively, we use a compound unique constraint with status included, combined with a transaction-level approach:

**Booking Transaction (Serializable Isolation):**

```typescript
async function confirmBooking(holdId: string, patientId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock and verify the hold belongs to this patient and hasn't expired
    const hold = await tx.slotHold.findFirst({
      where: { id: holdId, patientId, expiresAt: { gt: new Date() } }
    });
    if (!hold) throw new ConflictError('Hold expired or invalid');

    // 2. Check no confirmed appointment exists for this slot
    const existing = await tx.appointment.findFirst({
      where: {
        doctorProfileId: hold.doctorProfileId,
        slotDate: hold.slotDate,
        slotStartTime: hold.slotStartTime,
        status: { in: ['CONFIRMED'] }
      }
    });
    if (existing) throw new ConflictError('Slot already booked');

    // 3. Create the appointment
    const appointment = await tx.appointment.create({
      data: {
        patientId,
        doctorProfileId: hold.doctorProfileId,
        slotDate: hold.slotDate,
        slotStartTime: hold.slotStartTime,
        slotEndTime: hold.slotEndTime,
        status: 'CONFIRMED'
      }
    });

    // 4. Delete the hold
    await tx.slotHold.delete({ where: { id: holdId } });

    return appointment;
  }, {
    isolationLevel: 'Serializable'  // Prevents phantom reads
  });
}
```

### What Happens When Two Users Attempt the Same Slot

**Scenario: Two patients try to hold the same slot simultaneously**

1. Patient A sends POST `/appointments/hold` for Dr. Smith, 2024-03-15, 09:00
2. Patient B sends POST `/appointments/hold` for Dr. Smith, 2024-03-15, 09:00

**Resolution via unique constraint on SlotHold:**

```
SlotHold has: @@unique([doctorProfileId, slotDate, slotStartTime])
```

- First INSERT succeeds → Patient A gets the hold
- Second INSERT fails with unique constraint violation → Patient B receives HTTP 409 "Slot no longer available"

**Scenario: Hold expired, two patients try to confirm**

- Serializable transaction isolation ensures only one `CONFIRMED` appointment is created
- The second transaction will fail with a serialization error and receive a conflict response

### What Happens When Booking Is Immediate (No Payment)

Since there is no payment flow, the booking can be immediate:

1. Patient selects slot → System creates a `SlotHold` (5-minute expiry)
2. Patient fills symptom form → Patient confirms
3. System runs confirm transaction → Appointment created with status `CONFIRMED`
4. Async: Send confirmation email, create calendar event, generate pre-visit AI summary

The hold step exists to give the patient time to fill the symptom form without losing the slot to another patient.

---

## 7. Slot-Hold Strategy

### Hold Lifecycle

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌───────────┐
│  Select  │ ──► │   HELD   │ ──► │  CONFIRM   │ ──► │ CONFIRMED │
│   Slot   │     │ (5 min)  │     │ (patient)  │     │           │
└──────────┘     └─────┬────┘     └────────────┘     └───────────┘
                       │
                       │ (expired)
                       ▼
                 ┌──────────┐
                 │ RELEASED │ (deleted by cron)
                 └──────────┘
```

### Hold Rules

- Hold duration: **5 minutes** (configurable via env var)
- One active hold per patient per doctor at a time
- Hold is enforced by unique constraint: `(doctorProfileId, slotDate, slotStartTime)`
- Expired holds are cleaned up by a cron job every **1 minute**
- Creating a new hold for a different slot releases any existing hold by the same patient

### Hold Expiry Cleanup Job

```typescript
// Runs every minute
async function cleanExpiredHolds() {
  await prisma.slotHold.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
}
```

### Frontend Behavior

- When a slot is held, start a countdown timer on the UI
- At 1 minute remaining, show warning
- At expiry, redirect patient back to slot selection with a message
- Optimistic UI: disable the slot for other patients viewing the same doctor

---

## 8. Doctor Leave Conflict Strategy

### Leave Creation Flow

```
Admin creates leave for Dr. Smith (March 15-17)
  │
  ├─► 1. Validate no overlapping leave exists
  │
  ├─► 2. Create DoctorLeave record
  │
  ├─► 3. Find all CONFIRMED appointments for doctor on March 15-17
  │
  ├─► 4. For each affected appointment:
  │       ├─► Update status to CANCELLED (reason: "Doctor leave")
  │       ├─► Queue notification to patient
  │       └─► Delete/cancel calendar events
  │
  └─► 5. Active slot holds for those dates are released
```

### Prevention of New Bookings

The slot generation algorithm checks for leave:

```typescript
async function generateAvailableSlots(doctorId: string, date: Date) {
  // Check if date falls within any leave period
  const leave = await prisma.doctorLeave.findFirst({
    where: {
      doctorProfileId: doctorId,
      startDate: { lte: date },
      endDate: { gte: date }
    }
  });

  if (leave) return []; // No slots available during leave
  // ... continue with normal slot generation
}
```

### Auditability

- `DoctorLeave` records are never deleted (soft approach: the leave record persists)
- Cancelled appointments retain `cancellationReason: "Doctor leave - [leave ID]"`
- Notifications for affected patients are logged in the `Notification` table
- Admin dashboard shows leave history and affected appointments

### Edge Cases

- **Leave overlapping existing leave**: Reject with validation error
- **Leave in the past**: Reject
- **Partial day leave**: Not supported in v1 (full days only)
- **Leave cancelled by admin**: Does NOT automatically reinstate cancelled appointments (patients must rebook)

---

## 9. LLM Integration Strategy

### Provider Abstraction Architecture

```typescript
// Abstract interface
interface LLMProvider {
  generateCompletion(prompt: string, options: LLMOptions): Promise<LLMResponse>;
  name: string;
}

// Options
interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

// Response
interface LLMResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  provider: string;
}
```

### Provider Selection (via environment)

```
LLM_PROVIDER=openai          # or "anthropic" or "mock"
LLM_MODEL=gpt-4o-mini        # model within the provider
LLM_API_KEY=sk-...
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=2
```

### Pre-Visit Summary Generation

**Trigger**: After symptoms are submitted for an appointment

**Input**: Symptom submission data

**Expected Output Schema (validated with Zod)**:
```typescript
const PreVisitSummarySchema = z.object({
  urgencyLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(10).max(500),
  suggestedQuestions: z.array(z.string()).length(3)
});
```

**Prompt Template** (stored in `prompts/pre-visit-summary.ts`):
```
You are a medical triage assistant. Given the following patient symptoms,
provide a structured pre-visit summary for the doctor.

Patient symptoms: {symptoms}
Duration: {duration}
Severity reported: {severity}
Additional notes: {additionalNotes}

Respond in JSON format with:
- urgencyLevel: "LOW", "MEDIUM", or "HIGH"
- chiefComplaint: Brief summary of the main concern
- suggestedQuestions: Array of exactly 3 questions the doctor should ask
```

### Post-Visit Summary Generation

**Trigger**: After doctor completes visit notes and prescription

**Input**: Visit note, diagnosis, prescription, medications

**Expected Output Schema**:
```typescript
const PostVisitSummarySchema = z.object({
  patientExplanation: z.string().min(20).max(1000),
  medicationSchedule: z.string().min(10).max(500),
  followUpSteps: z.string().min(10).max(500)
});
```

### Failure Handling (Critical)

```typescript
async function generatePreVisitSummary(appointmentId: string, symptoms: SymptomData) {
  try {
    const response = await llmService.generate(buildPrompt(symptoms), {
      responseFormat: 'json',
      timeout: 30000
    });

    const parsed = PreVisitSummarySchema.safeParse(JSON.parse(response.content));

    if (!parsed.success) {
      // Store a failure record - summary unavailable but appointment continues
      await saveFailedSummary(appointmentId, 'PARSE_ERROR', response.content);
      return null;
    }

    await savePreVisitSummary(appointmentId, parsed.data, response);
    return parsed.data;
  } catch (error) {
    // LLM timeout, rate limit, network error
    // Log error, store failure record, but DO NOT fail the appointment
    await saveFailedSummary(appointmentId, 'PROVIDER_ERROR', error.message);
    return null;
  }
}
```

### Key Constraints

- LLM is NEVER used for booking, authorization, or scheduling decisions
- LLM output is always validated against a Zod schema before storage
- LLM failure produces a "summary unavailable" state, never blocks the workflow
- Raw LLM responses are stored for debugging/auditing
- A `mock` provider exists for testing that returns deterministic output

---

## 10. Email Notification Strategy

### Email Templates

| Type | Trigger | Recipients |
|------|---------|-----------|
| Booking Confirmation | Appointment confirmed | Patient |
| Appointment Reminder | 24h before appointment | Patient |
| Cancellation Notice | Appointment cancelled | Patient |
| Doctor Leave Notice | Leave affects appointment | Patient |
| Medication Reminder | Per medication schedule | Patient |

### Architecture

```
┌──────────────┐     ┌───────────────┐     ┌─────────────────┐
│  Service     │ ──► │ Notification  │ ──► │  Email Queue    │
│  (creates    │     │   Table       │     │  (node-cron     │
│  notification)│     │ status:PENDING│     │   processes)    │
└──────────────┘     └───────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │   Nodemailer    │
                                            │   (SMTP send)   │
                                            └─────────────────┘
```

### Send Strategy

1. **Creating a notification**: Services create a `Notification` row with `status: PENDING`
2. **Immediate attempt**: After creation, attempt to send immediately
3. **If send fails**: Update status to `FAILED`, increment `attempts`
4. **Retry job** (runs every 2 minutes): Picks up FAILED notifications where `attempts < maxAttempts`
5. **Exponential backoff**: Retry delays increase (2 min, 8 min, 32 min)
6. **Dead notifications**: After `maxAttempts` reached, status stays `FAILED` for admin review

### Transaction Safety

```typescript
// Email is NEVER inside the appointment transaction
async function bookAppointment(data) {
  // 1. Database transaction - creates appointment
  const appointment = await confirmBookingTransaction(data);

  // 2. AFTER transaction commits - queue email (non-blocking)
  queueNotification({
    userId: data.patientId,
    type: 'BOOKING_CONFIRMATION',
    subject: 'Appointment Confirmed',
    body: buildConfirmationEmail(appointment)
  }).catch(err => logger.error('Failed to queue notification', err));

  return appointment;
}
```

### Nodemailer Configuration

```typescript
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password
  }
});
```

---

## 11. Google Calendar Synchronization Strategy

### OAuth 2.0 Flow

```
1. User clicks "Connect Google Calendar"
2. Backend generates OAuth URL with scopes: calendar.events
3. User authorizes → Google redirects to callback URL
4. Backend exchanges code for access + refresh tokens
5. Tokens stored in CalendarConnection (encrypted at rest)
6. User is now "connected"
```

### Event Synchronization

| Action | Calendar Operation |
|--------|-------------------|
| Appointment confirmed | Create event for patient + doctor (if connected) |
| Appointment rescheduled | Update event time |
| Appointment cancelled | Delete event |
| Doctor leave (cancels appt) | Delete event |

### Sync Implementation

```typescript
async function syncAppointmentToCalendar(appointment: Appointment) {
  // Get connected users (patient and/or doctor)
  const connections = await getCalendarConnections([
    appointment.patientId,
    appointment.doctorProfile.userId
  ]);

  for (const connection of connections) {
    try {
      const event = await googleCalendar.createEvent(connection, {
        summary: `Medical Appointment - Dr. ${appointment.doctorProfile.user.lastName}`,
        start: buildDateTime(appointment.slotDate, appointment.slotStartTime),
        end: buildDateTime(appointment.slotDate, appointment.slotEndTime),
        description: 'Healthcare appointment'
      });

      await saveCalendarEvent(appointment.id, connection.userId, event.id);
    } catch (error) {
      // Calendar failure does NOT corrupt appointment
      logger.error('Calendar sync failed', { appointmentId: appointment.id, error });
      await saveCalendarEvent(appointment.id, connection.userId, null, 'failed');
    }
  }
}
```

### Token Refresh

- Before each API call, check if `tokenExpiry` is within 5 minutes
- If expiring, use refresh token to get new access token
- Update stored tokens
- If refresh fails (revoked), mark connection as disconnected, notify user

### Failure Handling

- Calendar sync is always async and non-blocking
- Failed syncs are recorded with `syncStatus: 'failed'`
- A reconciliation job runs every 15 minutes to retry failed syncs
- If a user's token is permanently invalid, the connection is marked disconnected

---

## 12. Background Job Strategy

### Job Registry (node-cron)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `slot-hold-expiry` | Every 1 minute | Delete expired SlotHolds |
| `appointment-reminder` | Every 15 minutes | Send 24h-before reminders |
| `medication-reminder` | Every 30 minutes | Send medication reminders based on schedule |
| `notification-retry` | Every 2 minutes | Retry failed notifications |
| `calendar-sync` | Every 15 minutes | Retry failed calendar syncs |

### Job Implementation Pattern

```typescript
// Each job file exports a setup function
export function setupSlotHoldExpiryJob() {
  cron.schedule('* * * * *', async () => {
    const jobStart = Date.now();
    try {
      const deleted = await prisma.slotHold.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      logger.info(`Slot hold cleanup: removed ${deleted.count} expired holds`, {
        duration: Date.now() - jobStart
      });
    } catch (error) {
      logger.error('Slot hold cleanup failed', error);
    }
  });
}
```

### Job Safety

- Each job has try/catch — a failed job run doesn't crash the server
- Jobs log start time, duration, and result count
- Jobs are idempotent — running twice in a row produces the same result
- Jobs use database timestamps, not in-memory state

---

## 13. Failure & Retry Strategy

### Retry Matrix

| Operation | Retry? | Max Attempts | Backoff | On Final Failure |
|-----------|--------|-------------|---------|-----------------|
| Email send | Yes | 3 | Exponential (2/8/32 min) | Mark FAILED, admin alert |
| LLM generation | Yes | 2 | Linear (5s) | Store failure record, continue |
| Calendar sync | Yes | 3 | Linear (15 min via cron) | Mark failed, user can retry |
| Database transaction | No | — | — | Return error to client |
| Slot hold creation | No | — | — | Return 409 Conflict |

### Circuit Breaker Pattern (for LLM)

```typescript
class LLMCircuitBreaker {
  private failures = 0;
  private lastFailure: Date | null = null;
  private threshold = 5;          // Open after 5 failures
  private resetTimeout = 60000;   // Try again after 60s

  async call<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.isOpen()) {
      logger.warn('LLM circuit breaker is OPEN, skipping call');
      return null;
    }
    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
```

### Graceful Degradation

- **LLM down**: Appointments book fine, summaries show "Analysis pending" or "Unavailable"
- **Email down**: Appointments book fine, notifications queued for retry
- **Calendar down**: Appointments book fine, sync retried later
- **Database down**: Service returns 503, frontend shows maintenance message

---

## 14. Environment Variable Design

```env
# ─── APPLICATION ───────────────────────────────────────
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
API_PREFIX=/api/v1

# ─── DATABASE ──────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/healthcare_db

# ─── AUTHENTICATION ───────────────────────────────────
JWT_SECRET=your-256-bit-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# ─── EMAIL ─────────────────────────────────────────────
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=noreply@healthcare-app.com

# ─── LLM ──────────────────────────────────────────────
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-your-api-key
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=2

# ─── GOOGLE CALENDAR ──────────────────────────────────
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/calendar/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events

# ─── BOOKING ──────────────────────────────────────────
SLOT_HOLD_DURATION_MINUTES=5
DEFAULT_CONSULTATION_DURATION_MIN=30

# ─── NOTIFICATIONS ────────────────────────────────────
NOTIFICATION_MAX_RETRIES=3
NOTIFICATION_RETRY_INTERVAL_MS=120000
APPOINTMENT_REMINDER_HOURS_BEFORE=24

# ─── RATE LIMITING ────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
```

---

## 15. Testing Strategy

### Test Pyramid

```
           ┌─────────┐
           │  E2E    │  (Future: Playwright — not in initial scope)
          ┌┴─────────┴┐
          │Integration │  Appointment booking, concurrency, auth flows
         ┌┴───────────┴┐
         │    Unit     │  Services, utilities, validators, LLM parsing
         └─────────────┘
```

### Testing Tools

- **Unit tests**: Vitest
- **Integration tests**: Vitest + Supertest + test database
- **Database**: Separate PostgreSQL test database, migrations applied before tests

### Critical Test Cases

**Concurrency Tests:**
```typescript
describe('Double-booking prevention', () => {
  it('should reject second booking for same slot', async () => {
    // Arrange: Two patients, same doctor, same slot
    // Act: Send two booking requests concurrently (Promise.all)
    // Assert: Exactly one succeeds (201), one fails (409)
  });

  it('should reject hold when slot already held', async () => {
    // Same pattern for SlotHold unique constraint
  });

  it('should allow booking after hold expires', async () => {
    // Create hold, fast-forward time, verify slot becomes available
  });
});
```

**LLM Failure Tests:**
```typescript
describe('LLM failure handling', () => {
  it('should complete appointment booking when LLM is down', async () => { ... });
  it('should store failure record on parse error', async () => { ... });
  it('should return null summary gracefully', async () => { ... });
});
```

**Doctor Leave Tests:**
```typescript
describe('Doctor leave', () => {
  it('should cancel existing appointments when leave created', async () => { ... });
  it('should notify affected patients', async () => { ... });
  it('should prevent new bookings during leave', async () => { ... });
});
```

---

## 16. Deployment Strategy

### Container Architecture

```dockerfile
# Backend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY backend ./backend
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter backend build
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]

# Frontend Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter frontend build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### docker-compose.yml (Local Development)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: healthcare_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  backend:
    build: { context: ., dockerfile: backend/Dockerfile }
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres]

  frontend:
    build: { context: ., dockerfile: frontend/Dockerfile }
    ports: ["80:80"]
    depends_on: [backend]

volumes:
  postgres_data:
```

### Production Considerations

- Backend runs as stateless container (scales horizontally)
- Database is a managed PostgreSQL service (e.g., AWS RDS, Railway)
- Frontend is static build served via CDN or Nginx
- Environment variables injected via deployment platform (not .env files)
- Database migrations run as a separate init step before deployment

---

## 17. Development Milestones

### Milestone 1: Project Initialization & Database
**Objective**: Set up monorepo, install dependencies, create Prisma schema, run migrations.

**Files created/modified**:
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `packages/shared/` — shared types
- `backend/package.json`, `backend/tsconfig.json`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `frontend/package.json`, `frontend/vite.config.ts`
- `.env.example`, `.gitignore`

**Deliverable**: `pnpm install` works, `prisma migrate dev` creates all tables, seed creates test data.

---

### Milestone 2: Authentication & User Management
**Objective**: Register patients, login all roles, JWT middleware, RBAC.

**Files created/modified**:
- `backend/src/app.ts`, `backend/src/index.ts`
- `backend/src/config/`
- `backend/src/middleware/` (authenticate, authorize, error-handler, validate)
- `backend/src/modules/auth/`
- `backend/src/modules/users/`
- `backend/src/utils/` (api-response, logger)

**Deliverable**: Can register, login, access protected routes with correct roles.

---

### Milestone 3: Doctor Management & Availability
**Objective**: Admin creates doctors, sets specialisations, working hours. Patients search doctors and view slots.

**Files created/modified**:
- `backend/src/modules/doctors/`
- `backend/src/modules/availability/`
- `backend/src/modules/admin/`
- `backend/src/utils/slot-generator.ts`

**Deliverable**: Slot generation returns correct available times based on working hours.

---

### Milestone 4: Appointment Booking with Concurrency Protection
**Objective**: Slot hold, booking confirmation, cancellation, rescheduling — with database-level double-booking prevention.

**Files created/modified**:
- `backend/src/modules/appointments/`
- `backend/src/jobs/slot-hold-expiry.job.ts`
- `backend/src/jobs/index.ts`

**Deliverable**: Concurrent booking tests pass. Only one booking succeeds per slot.

---

### Milestone 5: Symptom Collection & LLM Pre-Visit Summary
**Objective**: Patients submit symptoms, LLM generates pre-visit summary, doctor views it.

**Files created/modified**:
- `backend/src/modules/symptoms/`
- `backend/src/integrations/llm/`
- Pre-visit summary prompt and schema

**Deliverable**: Symptom submission triggers LLM summary. LLM failure doesn't block appointment.

---

### Milestone 6: Visit Notes, Prescriptions & Post-Visit Summary
**Objective**: Doctor records notes, creates prescriptions. LLM generates patient-friendly summary.

**Files created/modified**:
- `backend/src/modules/visits/`
- `backend/src/modules/prescriptions/`
- Post-visit summary prompt and schema

**Deliverable**: Complete visit workflow from notes to patient summary.

---

### Milestone 7: Doctor Leave Management
**Objective**: Admin creates leave, existing appointments are cancelled, patients notified, slots blocked.

**Files created/modified**:
- Admin leave endpoints
- Leave conflict resolution logic
- Integration with notification system

**Deliverable**: Leave creation cancels affected appointments and notifies patients.

---

### Milestone 8: Email Notifications with Retry
**Objective**: All notification types sent via email, with failure tracking and retry.

**Files created/modified**:
- `backend/src/integrations/email/`
- `backend/src/modules/notifications/`
- `backend/src/jobs/notification-retry.job.ts`
- `backend/src/jobs/appointment-reminder.job.ts`
- `backend/src/jobs/medication-reminder.job.ts`

**Deliverable**: Emails sent on booking/cancellation/leave. Failed emails retry automatically.

---

### Milestone 9: Google Calendar Integration
**Objective**: OAuth flow, event creation/update/deletion, token refresh, graceful failure.

**Files created/modified**:
- `backend/src/integrations/google-calendar/`
- `backend/src/modules/calendar/`
- `backend/src/jobs/calendar-sync.job.ts`

**Deliverable**: Connecting calendar works, appointments appear as events, disconnection is clean.

---

### Milestone 10: Frontend — Patient Portal
**Objective**: Patient registration, login, doctor search, slot booking, symptom form, appointments list, post-visit summary, medication reminders.

**Files created/modified**:
- `frontend/src/` — full patient flow
- Shared components (Layout, forms, common)

**Deliverable**: Patient can complete full journey from registration through viewing post-visit summary.

---

### Milestone 11: Frontend — Doctor Portal
**Objective**: Doctor login, dashboard, upcoming appointments, pre-visit summary view, visit notes, prescription entry.

**Files created/modified**:
- `frontend/src/pages/doctor/`
- Doctor-specific components

**Deliverable**: Doctor can view appointments, see AI summary, complete visits.

---

### Milestone 12: Frontend — Admin Portal
**Objective**: Admin login, doctor management, specialisations, working hours, leave management, appointment overview, notification monitoring.

**Files created/modified**:
- `frontend/src/pages/admin/`
- Admin-specific components

**Deliverable**: Admin can manage the entire platform.

---

### Milestone 13: Integration Testing & Documentation
**Objective**: Concurrency tests, end-to-end flow validation, complete documentation.

**Files created/modified**:
- `tests/` — integration and concurrency tests
- `docs/` — all documentation files
- `README.md`

**Deliverable**: All critical paths tested. Documentation complete for setup and deployment.

---

## Summary

This architecture prioritizes:
1. **Correctness** — database-level concurrency guarantees, validated LLM output
2. **Reliability** — retry mechanisms, graceful degradation, transaction safety
3. **Security** — RBAC, input validation, encrypted credentials
4. **Maintainability** — modular structure, domain separation, shared types
5. **Auditability** — notification logs, LLM response storage, leave history

Awaiting your approval before implementation begins.
