import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { registerPatient, login } from "./auth.service.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
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
      const result = await registerPatient(parsed.data);
      return reply.status(201).send({ data: result });
    } catch (error: any) {
      // Prisma unique constraint violation on email
      if (error.code === "P2002") {
        return reply.status(409).send({
          error: {
            code: "EMAIL_EXISTS",
            message: "An account with this email already exists",
          },
        });
      }
      request.log.error(error, "Registration failed");
      return reply.status(500).send({
        error: { code: "INTERNAL_ERROR", message: "Registration failed" },
      });
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
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

    const result = await login(parsed.data);

    if (!result) {
      return reply.status(401).send({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    return reply.status(200).send({ data: result });
  });
}
