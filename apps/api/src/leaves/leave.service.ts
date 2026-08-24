import { prisma } from "../db.js";
import type { CreateLeaveInput } from "./leave.schemas.js";

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function createLeave(input: CreateLeaveInput, adminUserId: string) {
  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);

  // Check doctor exists
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: input.doctorProfileId } });
  if (!doctor) return null;

  // Check overlapping leave
  const overlap = await prisma.doctorLeave.findFirst({
    where: {
      doctorProfileId: input.doctorProfileId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlap) {
    throw new LeaveConflictError("Overlapping leave period exists");
  }

  // Use transaction: create leave + cancel affected appointments + notify
  return prisma.$transaction(async (tx) => {
    const leave = await tx.doctorLeave.create({
      data: {
        doctorProfileId: input.doctorProfileId,
        startDate,
        endDate,
        reason: input.reason || null,
        createdBy: adminUserId,
      },
    });

    // Find affected confirmed appointments
    const affected = await tx.appointment.findMany({
      where: {
        doctorProfileId: input.doctorProfileId,
        slotDate: { gte: startDate, lte: endDate },
        status: "CONFIRMED",
      },
    });

    if (affected.length > 0) {
      // Cancel affected appointments
      await tx.appointment.updateMany({
        where: { id: { in: affected.map((a) => a.id) } },
        data: { status: "CANCELLED", cancellationReason: `Doctor leave: ${leave.id}` },
      });

      // Create notifications for affected patients
      await tx.notification.createMany({
        data: affected.map((a) => ({
          userId: a.patientId,
          type: "DOCTOR_LEAVE" as const,
          subject: "Appointment Cancelled - Doctor Unavailable",
          body: `Your appointment on ${a.slotDate.toISOString().split("T")[0]} at ${a.slotStartTime} has been cancelled due to doctor leave.`,
          status: "PENDING" as const,
          referenceId: a.id,
          referenceType: "appointment",
        })),
      });

      // Release any active slot holds for the leave period
      await tx.slotHold.deleteMany({
        where: {
          doctorProfileId: input.doctorProfileId,
          slotDate: { gte: startDate, lte: endDate },
        },
      });

      // Mark calendar events for cancelled appointments as FAILED (deletion handled by sync job)
      if (affected.length > 0) {
        await tx.calendarEvent.updateMany({
          where: { appointmentId: { in: affected.map((a) => a.id) } },
          data: { syncStatus: "FAILED", errorMessage: "Appointment cancelled due to doctor leave" },
        });
      }
    }

    return leave;
  });
}

export async function getLeavesByDoctor(doctorProfileId: string) {
  return prisma.doctorLeave.findMany({
    where: { doctorProfileId },
    orderBy: { startDate: "desc" },
  });
}

export class LeaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveConflictError";
  }
}
