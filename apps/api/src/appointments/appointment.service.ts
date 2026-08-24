import { prisma } from "../db.js";
import { getAvailableSlots } from "../availability/availability.service.js";
import type { CreateHoldInput, ConfirmAppointmentInput } from "./appointment.schemas.js";

const HOLD_DURATION_MINUTES = Number(process.env.SLOT_HOLD_DURATION_MINUTES) || 5;

export interface HoldResult {
  id: string;
  doctorProfileId: string;
  slotDate: Date;
  slotStartTime: string;
  slotEndTime: string;
  expiresAt: Date;
}

/**
 * Application-level error with HTTP status and structured code.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Create a slot hold for a patient.
 * Validates that the slot is actually available before attempting to create.
 * The database unique constraint is the final concurrency guard.
 */
export async function createSlotHold(
  patientId: string,
  input: CreateHoldInput
): Promise<HoldResult> {
  // 1. Validate doctor exists and is active
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: input.doctorProfileId },
    include: { user: { select: { isActive: true } } },
  });

  if (!doctor || !doctor.user.isActive) {
    throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found or inactive");
  }

  // 2. Validate the slot is in the available slots list
  const availableSlots = await getAvailableSlots(input.doctorProfileId, input.slotDate);
  const slotExists = availableSlots.some(
    (s) => s.startTime === input.slotStartTime && s.endTime === input.slotEndTime
  );

  if (!slotExists) {
    throw new AppError(409, "SLOT_UNAVAILABLE", "This slot is not available");
  }

  // 3. Create the hold — unique constraint handles race conditions
  const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000);

  const hold = await prisma.slotHold.create({
    data: {
      doctorProfileId: input.doctorProfileId,
      patientId,
      slotDate: parseDateForDb(input.slotDate),
      slotStartTime: input.slotStartTime,
      slotEndTime: input.slotEndTime,
      expiresAt,
    },
  });

  return hold;
}

/**
 * Confirm an appointment by atomically consuming a hold.
 *
 * Transaction steps:
 * 1. DELETE the hold with RETURNING (WHERE id, patientId, expiresAt > NOW)
 * 2. INSERT Appointment (CONFIRMED)
 * 3. INSERT SymptomSubmission
 * 4. INSERT CalendarEvent (PENDING)
 * 5. INSERT Notification rows (PENDING, outbox pattern)
 * 6. COMMIT
 *
 * If the DELETE returns 0 rows, the hold is expired/invalid → abort.
 * The partial unique index on Appointment is the final double-booking guard.
 */
export async function confirmAppointment(
  patientId: string,
  input: ConfirmAppointmentInput
) {
  return prisma.$transaction(async (tx) => {
    // 1. Atomically consume the hold and retrieve its data
    const deletedHolds: Array<{
      id: string;
      doctorProfileId: string;
      slotDate: Date;
      slotStartTime: string;
      slotEndTime: string;
    }> = await tx.$queryRawUnsafe(
      `DELETE FROM "SlotHold"
       WHERE "id"::text = $1
         AND "patientId"::text = $2
         AND "expiresAt" > NOW()
       RETURNING "id", "doctorProfileId", "slotDate", "slotStartTime", "slotEndTime"`,
      input.holdId,
      patientId
    );

    if (deletedHolds.length === 0) {
      throw new AppError(
        409,
        "HOLD_EXPIRED",
        "Hold expired or invalid. Please select a new slot."
      );
    }

    const hold = deletedHolds[0];

    // 2. Create the appointment (partial unique index prevents double-booking)
    const appointment = await tx.appointment.create({
      data: {
        patientId,
        doctorProfileId: hold.doctorProfileId,
        slotDate: hold.slotDate,
        slotStartTime: hold.slotStartTime,
        slotEndTime: hold.slotEndTime,
        status: "CONFIRMED",
      },
    });

    // 3. Create symptom submission
    await tx.symptomSubmission.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        symptoms: input.symptoms,
        duration: input.duration || null,
        severity: input.severity || null,
        additionalNotes: input.additionalNotes || null,
      },
    });

    // 4. Create CalendarEvent (PENDING — actual Google sync is M10)
    await tx.calendarEvent.create({
      data: {
        appointmentId: appointment.id,
        userId: patientId,
        syncStatus: "PENDING",
      },
    });

    // 5. Create notification rows (outbox — actual email sending is M8)
    const doctorProfile = await tx.doctorProfile.findUnique({
      where: { id: hold.doctorProfileId },
      select: { userId: true },
    });

    const dateStr = hold.slotDate instanceof Date
      ? hold.slotDate.toISOString().split("T")[0]
      : String(hold.slotDate);

    await tx.notification.createMany({
      data: [
        {
          userId: patientId,
          type: "BOOKING_CONFIRMATION",
          subject: "Appointment Confirmed",
          body: `Your appointment on ${dateStr} at ${hold.slotStartTime} has been confirmed.`,
          status: "PENDING",
          referenceId: appointment.id,
          referenceType: "appointment",
        },
        {
          userId: doctorProfile!.userId,
          type: "BOOKING_CONFIRMATION",
          subject: "New Appointment",
          body: `A new appointment has been booked for ${dateStr} at ${hold.slotStartTime}.`,
          status: "PENDING",
          referenceId: appointment.id,
          referenceType: "appointment",
        },
      ],
    });

    // Return the confirmed appointment
    return tx.appointment.findUnique({
      where: { id: appointment.id },
      include: {
        symptomSubmission: true,
        doctorProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            specialisation: true,
          },
        },
      },
    });
  });
}

/**
 * Delete expired slot holds. Safe to run repeatedly (idempotent).
 */
export async function cleanupExpiredHolds(): Promise<number> {
  const result = await prisma.slotHold.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/**
 * Get appointments for a patient.
 */
export async function getPatientAppointments(patientId: string) {
  return prisma.appointment.findMany({
    where: { patientId },
    include: {
      doctorProfile: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          specialisation: { select: { name: true } },
        },
      },
      symptomSubmission: true,
    },
    orderBy: { slotDate: "desc" },
  });
}

/**
 * Get appointments for a doctor.
 */
export async function getDoctorAppointments(doctorProfileId: string) {
  return prisma.appointment.findMany({
    where: { doctorProfileId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      symptomSubmission: true,
    },
    orderBy: { slotDate: "desc" },
  });
}

/**
 * Get a single appointment by ID.
 */
export async function getAppointmentById(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      doctorProfile: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          specialisation: true,
        },
      },
      symptomSubmission: true,
    },
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function parseDateForDb(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
