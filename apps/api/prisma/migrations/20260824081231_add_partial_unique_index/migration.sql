-- Custom migration: Partial unique index for appointment double-booking prevention
--
-- This index ensures that at most ONE confirmed appointment exists per
-- doctor/date/start-time combination. CANCELLED, COMPLETED, NO_SHOW, and
-- RESCHEDULED appointments do NOT block the slot, allowing rebooking.
--
-- Prisma does not support partial unique indexes in its schema language,
-- so this must be maintained as a custom migration.

CREATE UNIQUE INDEX "unique_confirmed_appointment"
ON "Appointment" ("doctorProfileId", "slotDate", "slotStartTime")
WHERE "status" = 'CONFIRMED';
