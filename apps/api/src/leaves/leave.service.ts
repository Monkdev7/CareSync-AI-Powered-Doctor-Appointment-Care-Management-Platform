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

  return prisma.doctorLeave.create({
    data: {
      doctorProfileId: input.doctorProfileId,
      startDate,
      endDate,
      reason: input.reason || null,
      createdBy: adminUserId,
    },
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
