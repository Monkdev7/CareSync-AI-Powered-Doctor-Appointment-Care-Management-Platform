import { z } from "zod";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const createHoldSchema = z.object({
  doctorProfileId: z.string().uuid("Invalid doctor profile ID"),
  slotDate: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD format"),
  slotStartTime: z.string().regex(TIME_REGEX, "Must be HH:mm format"),
  slotEndTime: z.string().regex(TIME_REGEX, "Must be HH:mm format"),
});

export const confirmAppointmentSchema = z.object({
  holdId: z.string().uuid("Invalid hold ID"),
  symptoms: z.string().min(1, "Symptoms are required"),
  duration: z.string().max(200).optional(),
  severity: z.string().max(100).optional(),
  additionalNotes: z.string().max(2000).optional(),
});

export type CreateHoldInput = z.infer<typeof createHoldSchema>;
export type ConfirmAppointmentInput = z.infer<typeof confirmAppointmentSchema>;
