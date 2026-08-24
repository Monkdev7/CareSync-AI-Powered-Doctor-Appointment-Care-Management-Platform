import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import { createVisitNoteSchema, createPrescriptionSchema } from "./visit.schemas.js";
import { createVisitNote, getVisitNote, createPrescription } from "./visit.service.js";
import { generatePostVisitSummary } from "../llm/post-visit-summary.js";
import { prisma } from "../db.js";

async function getDoctorProfileId(userId: string): Promise<string | null> {
  const p = await prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } });
  return p?.id ?? null;
}

async function doctorOwnsAppointment(userId: string, appointmentId: string): Promise<boolean> {
  const profileId = await getDoctorProfileId(userId);
  if (!profileId) return false;
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorProfileId: profileId },
  });
  return appt !== null;
}

export async function visitRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/appointments/:id/visit-note — doctor creates visit note
  app.post(
    "/api/appointments/:id/visit-note",
    { preHandler: [authenticate, requireRole("DOCTOR")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!(await doctorOwnsAppointment(request.user!.id, id))) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
      }

      const existing = await getVisitNote(id);
      if (existing) {
        return reply.status(409).send({ error: { code: "DUPLICATE", message: "Visit note already exists for this appointment" } });
      }

      const parsed = createVisitNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid request data", details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        });
      }

      const note = await createVisitNote(id, parsed.data);
      return reply.status(201).send({ data: note });
    }
  );

  // GET /api/appointments/:id/visit-note — doctor or patient views visit note
  app.get(
    "/api/appointments/:id/visit-note",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      // Ownership check
      if (user.role === "PATIENT") {
        const appt = await prisma.appointment.findFirst({ where: { id, patientId: user.id } });
        if (!appt) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
      } else if (user.role === "DOCTOR") {
        if (!(await doctorOwnsAppointment(user.id, id))) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
        }
      }

      const note = await getVisitNote(id);
      if (!note) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Visit note not found" } });
      }
      return reply.status(200).send({ data: note });
    }
  );

  // POST /api/appointments/:id/prescription — doctor creates prescription
  app.post(
    "/api/appointments/:id/prescription",
    { preHandler: [authenticate, requireRole("DOCTOR")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!(await doctorOwnsAppointment(request.user!.id, id))) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
      }

      const visitNote = await getVisitNote(id);
      if (!visitNote) {
        return reply.status(400).send({ error: { code: "NO_VISIT_NOTE", message: "Visit note must be created before prescription" } });
      }

      const parsed = createPrescriptionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid request data", details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        });
      }

      const prescription = await createPrescription(visitNote.id, parsed.data);

      // Trigger post-visit summary generation (async, non-blocking)
      generatePostVisitSummary(visitNote.id).catch(() => {});

      return reply.status(201).send({ data: prescription });
    }
  );

  // GET /api/appointments/:id/post-summary — patient or doctor views post-visit summary
  app.get(
    "/api/appointments/:id/post-summary",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      // Ownership check
      if (user.role === "PATIENT") {
        const appt = await prisma.appointment.findFirst({ where: { id, patientId: user.id } });
        if (!appt) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
      } else if (user.role === "DOCTOR") {
        if (!(await doctorOwnsAppointment(user.id, id))) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
        }
      }

      const visitNote = await prisma.visitNote.findUnique({ where: { appointmentId: id }, select: { id: true } });
      if (!visitNote) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Visit note not found" } });
      }

      const summary = await prisma.postVisitSummary.findUnique({ where: { visitNoteId: visitNote.id } });
      if (!summary) {
        return reply.status(200).send({ data: { status: "pending", message: "Summary is being generated" } });
      }
      return reply.status(200).send({ data: summary });
    }
  );
}
