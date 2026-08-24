import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import {
  createDoctorSchema,
  updateDoctorSchema,
  setWorkingHoursSchema,
  availabilityQuerySchema,
} from "./doctor.schemas.js";
import {
  createDoctor,
  listDoctors,
  getDoctorById,
  updateDoctor,
  getDoctorWorkingHours,
  setDoctorWorkingHours,
} from "./doctor.service.js";
import { getAvailableSlots } from "../availability/availability.service.js";

export async function doctorRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/doctors — admin creates a doctor
  app.post(
    "/api/doctors",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = createDoctorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request data",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
        });
      }

      try {
        const doctor = await createDoctor(parsed.data);
        return reply.status(201).send({ data: doctor });
      } catch (error: any) {
        if (error.code === "P2002") {
          return reply.status(409).send({
            error: { code: "DUPLICATE", message: "A user with this email already exists" },
          });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({
            error: { code: "INVALID_REFERENCE", message: "Invalid specialisation ID" },
          });
        }
        request.log.error(error, "Failed to create doctor");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to create doctor" },
        });
      }
    }
  );

  // GET /api/doctors — authenticated users list doctors
  app.get(
    "/api/doctors",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const query = request.query as { specialisationId?: string; isActive?: string };
      const filters: { specialisationId?: string; isActive?: boolean } = {};

      if (query.specialisationId) {
        filters.specialisationId = query.specialisationId;
      }
      if (query.isActive !== undefined) {
        filters.isActive = query.isActive === "true";
      }

      const doctors = await listDoctors(filters);
      return reply.status(200).send({ data: doctors });
    }
  );

  // GET /api/doctors/:id — authenticated users view doctor detail
  app.get(
    "/api/doctors/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doctor = await getDoctorById(id);
      if (!doctor) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Doctor not found" },
        });
      }
      return reply.status(200).send({ data: doctor });
    }
  );

  // PATCH /api/doctors/:id — admin updates doctor
  app.patch(
    "/api/doctors/:id",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateDoctorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request data",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
        });
      }

      try {
        const updated = await updateDoctor(id, parsed.data);
        if (!updated) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Doctor not found" },
          });
        }
        return reply.status(200).send({ data: updated });
      } catch (error: any) {
        if (error.code === "P2003") {
          return reply.status(400).send({
            error: { code: "INVALID_REFERENCE", message: "Invalid specialisation ID" },
          });
        }
        request.log.error(error, "Failed to update doctor");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to update doctor" },
        });
      }
    }
  );

  // GET /api/doctors/:doctorId/working-hours
  app.get(
    "/api/doctors/:doctorId/working-hours",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { doctorId } = request.params as { doctorId: string };
      const doctor = await getDoctorById(doctorId);
      if (!doctor) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Doctor not found" },
        });
      }
      const hours = await getDoctorWorkingHours(doctorId);
      return reply.status(200).send({ data: hours });
    }
  );

  // PUT /api/doctors/:doctorId/working-hours — admin only
  app.put(
    "/api/doctors/:doctorId/working-hours",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { doctorId } = request.params as { doctorId: string };

      const doctor = await getDoctorById(doctorId);
      if (!doctor) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Doctor not found" },
        });
      }

      const parsed = setWorkingHoursSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request data",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
        });
      }

      // Check for duplicate days in the request
      const days = parsed.data.hours.map((h) => h.dayOfWeek);
      const uniqueDays = new Set(days);
      if (uniqueDays.size !== days.length) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Duplicate days are not allowed in a single request",
          },
        });
      }

      const hours = await setDoctorWorkingHours(doctorId, parsed.data.hours);
      return reply.status(200).send({ data: hours });
    }
  );

  // GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD
  app.get(
    "/api/doctors/:doctorId/availability",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { doctorId } = request.params as { doctorId: string };
      const parsed = availabilityQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
        });
      }

      const doctor = await getDoctorById(doctorId);
      if (!doctor) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Doctor not found" },
        });
      }

      const slots = await getAvailableSlots(doctorId, parsed.data.date);
      return reply.status(200).send({
        data: {
          doctorId,
          date: parsed.data.date,
          consultationDurationMin: doctor.consultationDurationMin,
          slots,
        },
      });
    }
  );
}
