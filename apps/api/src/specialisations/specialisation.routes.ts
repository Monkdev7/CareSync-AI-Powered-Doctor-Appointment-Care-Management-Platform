import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/auth.middleware.js";
import {
  createSpecialisationSchema,
  updateSpecialisationSchema,
} from "./specialisation.schemas.js";
import {
  createSpecialisation,
  listSpecialisations,
  getSpecialisationById,
  updateSpecialisation,
  deleteSpecialisation,
} from "./specialisation.service.js";

export async function specialisationRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/specialisations — authenticated users can list
  app.get(
    "/api/specialisations",
    { preHandler: [authenticate] },
    async (_request, reply) => {
      const specialisations = await listSpecialisations();
      return reply.status(200).send({ data: specialisations });
    }
  );

  // POST /api/specialisations — admin only
  app.post(
    "/api/specialisations",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = createSpecialisationSchema.safeParse(request.body);
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
        const specialisation = await createSpecialisation(parsed.data);
        return reply.status(201).send({ data: specialisation });
      } catch (error: any) {
        if (error.code === "P2002") {
          return reply.status(409).send({
            error: {
              code: "DUPLICATE",
              message: "A specialisation with this name already exists",
            },
          });
        }
        request.log.error(error, "Failed to create specialisation");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to create specialisation" },
        });
      }
    }
  );

  // PATCH /api/specialisations/:id — admin only
  app.patch(
    "/api/specialisations/:id",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateSpecialisationSchema.safeParse(request.body);
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
        const specialisation = await updateSpecialisation(id, parsed.data);
        return reply.status(200).send({ data: specialisation });
      } catch (error: any) {
        if (error.code === "P2025") {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Specialisation not found" },
          });
        }
        if (error.code === "P2002") {
          return reply.status(409).send({
            error: { code: "DUPLICATE", message: "A specialisation with this name already exists" },
          });
        }
        request.log.error(error, "Failed to update specialisation");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to update specialisation" },
        });
      }
    }
  );

  // DELETE /api/specialisations/:id — admin only
  app.delete(
    "/api/specialisations/:id",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await getSpecialisationById(id);
      if (!existing) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Specialisation not found" },
        });
      }

      try {
        await deleteSpecialisation(id);
        return reply.status(204).send();
      } catch (error: any) {
        // Foreign key constraint — doctors still reference this specialisation
        if (error.code === "P2003") {
          return reply.status(409).send({
            error: {
              code: "CONFLICT",
              message: "Cannot delete specialisation with existing doctor profiles",
            },
          });
        }
        request.log.error(error, "Failed to delete specialisation");
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to delete specialisation" },
        });
      }
    }
  );
}
