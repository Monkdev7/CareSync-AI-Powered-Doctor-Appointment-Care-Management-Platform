import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const createLeaveSchema = z.object({
  doctorProfileId: z.string().uuid("Invalid doctor profile ID"),
  startDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  endDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  reason: z.string().max(500).optional(),
}).refine(
  (d) => d.startDate <= d.endDate,
  { message: "startDate must be on or before endDate", path: ["endDate"] }
);

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
