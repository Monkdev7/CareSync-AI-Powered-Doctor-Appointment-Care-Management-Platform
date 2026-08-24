import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import { createLeaveSchema } from "./leave.schemas.js";
import { createLeave, getLeavesByDoctor, LeaveConflictError } from "./leave.service.js";

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/doctors/:doctorId/leave — admin creates leave
  app.post(
    "/api/doctors/:doctorId/leave",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { doctorId } = request.params as { doctorId: string };
      const body = { ...(request.body as object), doctorProfileId: doctorId };

      const parsed = createLeaveSchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid request data", details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        });
      }

      try {
        const leave = await createLeave(parsed.data, request.user!.id);
        if (!leave) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Doctor not found" } });
        }
        return reply.status(201).send({ data: leave });
      } catch (error: any) {
        if (error instanceof LeaveConflictError) {
          return reply.status(409).send({ error: { code: "CONFLICT", message: error.message } });
        }
        request.log.error(error, "Failed to create leave");
        return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Failed to create leave" } });
      }
    }
  );

  // GET /api/doctors/:doctorId/leave — view doctor's leave periods
  app.get(
    "/api/doctors/:doctorId/leave",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { doctorId } = request.params as { doctorId: string };
      const leaves = await getLeavesByDoctor(doctorId);
      return reply.status(200).send({ data: leaves });
    }
  );
}
