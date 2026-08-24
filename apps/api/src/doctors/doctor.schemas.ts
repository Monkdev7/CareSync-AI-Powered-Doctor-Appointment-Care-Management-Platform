import { z } from "zod";

export const createDoctorSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20).optional(),
  specialisationId: z.string().uuid("Invalid specialisation ID"),
  qualifications: z.array(z.string().min(1)).min(1, "At least one qualification required"),
  bio: z.string().max(1000).optional(),
  consultationDurationMin: z.number().int().min(5).max(120).default(30),
});

export const updateDoctorSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  specialisationId: z.string().uuid().optional(),
  qualifications: z.array(z.string().min(1)).min(1).optional(),
  bio: z.string().max(1000).nullable().optional(),
  consultationDurationMin: z.number().int().min(5).max(120).optional(),
  isActive: z.boolean().optional(),
});

const DAY_OF_WEEK = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const workingHourEntry = z.object({
  dayOfWeek: DAY_OF_WEEK,
  startTime: z.string().regex(TIME_REGEX, "Must be HH:mm format"),
  endTime: z.string().regex(TIME_REGEX, "Must be HH:mm format"),
  isActive: z.boolean().default(true),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: "startTime must be earlier than endTime", path: ["endTime"] }
);

export const setWorkingHoursSchema = z.object({
  hours: z.array(workingHourEntry).min(1).max(7),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type SetWorkingHoursInput = z.infer<typeof setWorkingHoursSchema>;
