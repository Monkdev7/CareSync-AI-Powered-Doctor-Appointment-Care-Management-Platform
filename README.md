# Healthcare Appointment & Follow-up Manager

A full-stack healthcare appointment platform with role-based portals for patients, doctors, and administrators.

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **PostgreSQL** 16+ (provided via Docker Compose)
- **Docker** (for local PostgreSQL)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Copy environment file
cp .env.example apps/api/.env
# Edit apps/api/.env if needed (defaults work with docker-compose)

# 4. Run database migrations
pnpm db:migrate

# 5. Seed development data
pnpm db:seed

# 6. Start the API server
pnpm dev:api
```

The API will be available at `http://localhost:3000`.

## Project Structure

```
healthcare-platform/
├── apps/
│   ├── api/                    # Backend API (Fastify + TypeScript + Prisma)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   ├── migrations/     # SQL migrations
│   │   │   └── seed.ts         # Development seed data
│   │   ├── src/
│   │   │   ├── config/         # Environment validation
│   │   │   ├── db.ts           # Prisma client singleton
│   │   │   └── index.ts        # Application entry point
│   │   └── tests/
│   │       └── db-constraints.test.ts  # Database constraint verification
│   └── web/                    # Frontend (future milestone)
├── packages/                   # Shared packages (future milestone)
├── docker-compose.yml          # Local PostgreSQL
├── .env.example                # Environment variable template
└── pnpm-workspace.yaml         # Monorepo workspace config
```

## Database

### Technology

- **PostgreSQL 16** via Docker
- **Prisma ORM** for schema management, migrations, and queries

### Schema

The database includes 17 models covering users, appointments, symptoms, visits, prescriptions, notifications, and calendar integration. See `apps/api/prisma/schema.prisma` for the complete schema.

### Partial Unique Index (Critical)

The system prevents double-booking at the database level using a **PostgreSQL partial unique index**:

```sql
CREATE UNIQUE INDEX "unique_confirmed_appointment"
ON "Appointment" ("doctorProfileId", "slotDate", "slotStartTime")
WHERE "status" = 'CONFIRMED';
```

**Why a partial unique index?**

- A normal compound unique constraint including `status` would prevent rebooking a slot after cancellation (since the cancelled row occupies the key space).
- A partial index only enforces uniqueness for `CONFIRMED` rows, so:
  - Two CONFIRMED appointments for the same slot are impossible.
  - A cancelled appointment does NOT block the slot.
  - A new CONFIRMED appointment can reuse a previously cancelled slot.

**Why a custom migration?**

Prisma's schema language does not support partial unique indexes. The index is created via a manually-authored migration SQL file (`20260824081231_add_partial_unique_index/migration.sql`). Prisma's migration system tracks and applies it like any other migration.

### Commands

| Command | Description |
|---------|-------------|
| `pnpm db:validate` | Validate Prisma schema syntax |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Seed development data |
| `pnpm db:reset` | Reset database (drop + migrate + seed) |
| `pnpm db:test` | Run database constraint tests |

## Development Data

The seed creates:

| Entity | Count | Details |
|--------|-------|---------|
| Admin users | 1 | admin@healthcare.dev |
| Doctors | 2 | Cardiology, Dermatology |
| Patients | 3 | alice, bob, carol |
| Specialisations | 3 | Cardiology, Dermatology, General Practice |
| Working hours | 8 | Mon-Fri for Dr. Smith, Mon/Wed/Fri for Dr. Jones |

All users share the same development password hash (not a real password).

## Environment Variables

See `.env.example` for all supported variables. For Milestone 1, only `DATABASE_URL` is required.

## Testing

### Database Constraint Tests

```bash
pnpm db:test
```

Verifies:
- Test A: Duplicate CONFIRMED appointments are rejected (partial unique index)
- Test B: Cancelled slots can be rebooked
- Test C: Duplicate slot holds are rejected (unique constraint)
- Test D: Multiple non-CONFIRMED statuses allowed for same slot

### TypeScript

```bash
pnpm typecheck
```

## Doctor & Availability API

### POST /api/specialisations (Admin)
### GET /api/specialisations (Authenticated)
### PATCH /api/specialisations/:id (Admin)
### DELETE /api/specialisations/:id (Admin)

### POST /api/doctors (Admin)

Creates a doctor user + profile atomically.

```json
{
  "email": "dr.smith@example.com",
  "password": "DoctorPass123",
  "firstName": "Sarah",
  "lastName": "Smith",
  "specialisationId": "uuid",
  "qualifications": ["MD", "Board Certified"],
  "bio": "Experienced cardiologist",
  "consultationDurationMin": 30
}
```

### GET /api/doctors (Authenticated)
### GET /api/doctors/:id (Authenticated)
### PATCH /api/doctors/:id (Admin)

### PUT /api/doctors/:doctorId/working-hours (Admin)

```json
{
  "hours": [
    { "dayOfWeek": "MONDAY", "startTime": "09:00", "endTime": "17:00", "isActive": true },
    { "dayOfWeek": "TUESDAY", "startTime": "09:00", "endTime": "12:00", "isActive": true }
  ]
}
```

### GET /api/doctors/:doctorId/working-hours (Authenticated)

### GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD (Authenticated)

Returns dynamically generated available slots.

```json
{
  "data": {
    "doctorId": "uuid",
    "date": "2024-03-15",
    "consultationDurationMin": 30,
    "slots": [
      { "startTime": "09:00", "endTime": "09:30" },
      { "startTime": "09:30", "endTime": "10:00" }
    ]
  }
}
```

**Availability rules:**
- Slots generated from working hours using `consultationDurationMin`
- Partial slots (extending beyond endTime) are not generated
- Confirmed appointments block their slot
- Active slot holds (not expired) block their slot
- Doctor leave makes all slots unavailable for affected dates
- SlotHold creation and appointment confirmation are implemented in Milestone 4

## Authentication API

### POST /api/auth/register

Register a new patient account.

```json
// Request
{
  "email": "patient@example.com",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-0100"
}

// Response 201
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "patient@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1-555-0100",
      "role": "PATIENT",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

- Only PATIENT role can be created via public registration.
- Email must be unique (409 if duplicate).
- Password requires: 8+ chars, uppercase, lowercase, digit.

### POST /api/auth/login

```json
// Request
{
  "email": "patient@example.com",
  "password": "SecurePass123"
}

// Response 200
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { ... }
  }
}

// Response 401
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

- Same generic error for wrong password, unknown email, or inactive account (prevents user enumeration).

### GET /api/users/me

Requires authentication. Returns the current user's profile.

```
Authorization: Bearer <token>
```

### PATCH /api/users/:id/status (Admin only)

Activate or deactivate a user account.

```json
// Request
{ "isActive": false }
```

### Authentication Header

All protected endpoints require:
```
Authorization: Bearer <JWT_TOKEN>
```

### RBAC

| Code | Meaning |
|------|---------|
| 401 | Missing/invalid/expired token, or deactivated user |
| 403 | Authenticated but insufficient role |

### Environment Variables (Auth)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET | Yes | — | Secret for signing JWTs (min 16 chars) |
| JWT_EXPIRES_IN | No | 24h | Token expiry duration |
| BCRYPT_ROUNDS | No | 12 | bcrypt cost factor |

## Architecture

See `ARCHITECTURE_REVISED.md` for the complete system design including:
- Appointment concurrency strategy
- Slot-hold lifecycle
- Doctor leave conflict handling
- Notification outbox pattern
- LLM integration strategy
- Google Calendar synchronization
- Background job design
