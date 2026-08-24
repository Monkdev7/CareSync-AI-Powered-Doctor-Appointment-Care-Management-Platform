import { z } from "zod";

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
