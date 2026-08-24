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

## Architecture

See `ARCHITECTURE_REVISED.md` for the complete system design including:
- Appointment concurrency strategy
- Slot-hold lifecycle
- Doctor leave conflict handling
- Notification outbox pattern
- LLM integration strategy
- Google Calendar synchronization
- Background job design
