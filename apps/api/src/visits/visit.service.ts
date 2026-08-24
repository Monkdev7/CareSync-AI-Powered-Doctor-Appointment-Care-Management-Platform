import { prisma } from "../db.js";
import type { CreateVisitNoteInput, CreatePrescriptionInput } from "./visit.schemas.js";

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function createVisitNote(appointmentId: string, input: CreateVisitNoteInput) {
  return prisma.visitNote.create({
    data: {
      appointmentId,
      doctorNotes: input.doctorNotes,
      diagnosis: input.diagnosis || null,
      followUpDate: input.followUpDate ? parseDate(input.followUpDate) : null,
    },
    include: { prescriptions: { include: { medications: true } } },
  });
}

export async function getVisitNote(appointmentId: string) {
  return prisma.visitNote.findUnique({
    where: { appointmentId },
    include: {
      prescriptions: { include: { medications: true } },
      postVisitSummary: true,
    },
  });
}

export async function createPrescription(visitNoteId: string, input: CreatePrescriptionInput) {
  return prisma.prescription.create({
    data: {
      visitNoteId,
      instructions: input.instructions || null,
      medications: {
        create: input.medications.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          instructions: m.instructions || null,
          startDate: parseDate(m.startDate),
          endDate: parseDate(m.endDate),
          isActive: true,
        })),
      },
    },
    include: { medications: true },
  });
}
