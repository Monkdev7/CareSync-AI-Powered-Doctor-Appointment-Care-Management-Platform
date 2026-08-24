import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import { createHoldSchema, confirmAppointmentSchema } from "./appointment.schemas.js";
import {
  createSlotHold,
  confirmAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  getAppointmentById,
  AppError,
} from "./appointment.service.js";
import { generatePreVisitSummary } from "../llm/pre-visit-summary.js";
import { prisma } from "../db.js";

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/appointments/hold — Patient creates a slot hold
  app.post(
    "/api/appointments/hold",
    { preHandler: [authenticate, requireRole("PATIENT")] },
    async (request, reply) => {
      const parsed = createHoldSchema.safeParse(request.body);
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
        const hold = await createSlotHold(request.user!.id, parsed.data);
        return reply.status(201).send({ data: hold });
      } catch (error: any) {
        if (error instanceof AppError) {
          return reply.status(error.statusCode).send({
            error: { code: error.code, message: error.message },
          });
        }
        // Prisma unique constraint violation (concurrent hold attempt)
        if (error.code === "P2002") {
          return reply.status(409).send({
            error: { code: "SLOT_UNAVAILABLE", message: "This slot is no longer available" },
          });
        }
        request.log.error(error, "Failed to create hold");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to create hold" },
        });
      }
    }
  );

  // POST /api/appointments/confirm — Patient confirms appointment
  app.post(
    "/api/appointments/confirm",
    { preHandler: [authenticate, requireRole("PATIENT")] },
    async (request, reply) => {
      const parsed = confirmAppointmentSchema.safeParse(request.body);
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
        const appointment = await confirmAppointment(request.user!.id, parsed.data);

        // Trigger pre-visit summary generation asynchronously (fire-and-forget)
        // LLM failure must NEVER block the booking response
        if (appointment?.id) {
          generatePreVisitSummary(appointment.id).catch((err) => {
            request.log.error(err, "Pre-visit summary generation failed (non-blocking)");
          });
        }

        return reply.status(201).send({ data: appointment });
      } catch (error: any) {
        if (error instanceof AppError) {
          return reply.status(error.statusCode).send({
            error: { code: error.code, message: error.message },
          });
        }
        // Partial unique index violation (double-booking attempt)
        if (error.code === "P2002") {
          return reply.status(409).send({
            error: { code: "SLOT_ALREADY_BOOKED", message: "Appointment slot is no longer available" },
          });
        }
        request.log.error(error, "Failed to confirm appointment");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to confirm appointment" },
        });
      }
    }
  );

  // GET /api/appointments — list appointments for current user
  app.get(
    "/api/appointments",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user!;

      if (user.role === "PATIENT") {
        const appointments = await getPatientAppointments(user.id);
        return reply.status(200).send({ data: appointments });
      }

      if (user.role === "DOCTOR") {
        const profile = await prisma.doctorProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (!profile) {
          return reply.status(200).send({ data: [] });
        }
        const appointments = await getDoctorAppointments(profile.id);
        return reply.status(200).send({ data: appointments });
      }

      if (user.role === "ADMIN") {
        // Admin can see all appointments
        const appointments = await prisma.appointment.findMany({
          include: {
            patient: { select: { id: true, firstName: true, lastName: true, email: true } },
            doctorProfile: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                specialisation: { select: { name: true } },
              },
            },
          },
          orderBy: { slotDate: "desc" },
        });
        return reply.status(200).send({ data: appointments });
      }

      return reply.status(200).send({ data: [] });
    }
  );

  // GET /api/appointments/:id — appointment detail with access control
  app.get(
    "/api/appointments/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      const appointment = await getAppointmentById(id);
      if (!appointment) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Appointment not found" },
        });
      }

      // Access control
      if (user.role === "PATIENT" && appointment.patient.id !== user.id) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Appointment not found" },
        });
      }

      if (user.role === "DOCTOR") {
        const profile = await prisma.doctorProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (!profile || appointment.doctorProfile.id !== profile.id) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Appointment not found" },
          });
        }
      }

      return reply.status(200).send({ data: appointment });
    }
  );

  // GET /api/appointments/:id/pre-summary — view pre-visit AI summary
  app.get(
    "/api/appointments/:id/pre-summary",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      const appointment = await getAppointmentById(id);
      if (!appointment) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Appointment not found" },
        });
      }

      // Access: doctor (own patients) or admin
      if (user.role === "PATIENT") {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Pre-visit summaries are for doctors only" },
        });
      }

      if (user.role === "DOCTOR") {
        const profile = await prisma.doctorProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (!profile || appointment.doctorProfile.id !== profile.id) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Appointment not found" },
          });
        }
      }

      const summary = await prisma.preVisitSummary.findUnique({
        where: { appointmentId: id },
      });

      if (!summary) {
        return reply.status(200).send({
          data: { status: "pending", message: "Summary is being generated" },
        });
      }

      return reply.status(200).send({ data: summary });
    }
  );
}
