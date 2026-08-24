import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const createVisitNoteSchema = z.object({
  doctorNotes: z.string().min(1, "Doctor notes are required").max(5000),
  diagnosis: z.string().max(1000).optional(),
  followUpDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD").optional(),
});

export const createPrescriptionSchema = z.object({
  instructions: z.string().max(2000).optional(),
  medications: z.array(z.object({
    name: z.string().min(1).max(200),
    dosage: z.string().min(1).max(100),
    frequency: z.enum(["ONCE_DAILY", "TWICE_DAILY", "THREE_TIMES_DAILY", "EVERY_8_HOURS", "EVERY_12_HOURS"]),
    duration: z.string().min(1).max(100),
    instructions: z.string().max(500).optional(),
    startDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
    endDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  })).min(1, "At least one medication required"),
});

export type CreateVisitNoteInput = z.infer<typeof createVisitNoteSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
