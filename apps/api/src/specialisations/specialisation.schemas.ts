import { z } from "zod";

export const createSpecialisationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateSpecialisationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export type CreateSpecialisationInput = z.infer<typeof createSpecialisationSchema>;
export type UpdateSpecialisationInput = z.infer<typeof updateSpecialisationSchema>;
