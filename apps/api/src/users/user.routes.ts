import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import { getUserById, updateUserStatus } from "./user.service.js";
import { updateStatusSchema } from "./user.schemas.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/users/me — returns the authenticated user's profile
  app.get(
    "/api/users/me",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = await getUserById(request.user!.id);
      if (!user) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }
      return reply.status(200).send({ data: user });
    }
  );

  // PATCH /api/users/:id/status — admin-only: activate/deactivate a user
  app.patch(
    "/api/users/:id/status",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = updateStatusSchema.safeParse(request.body);
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

      const updated = await updateUserStatus(id, parsed.data.isActive);
      if (!updated) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      return reply.status(200).send({ data: updated });
    }
  );
}
