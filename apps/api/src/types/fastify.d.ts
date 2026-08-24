import type { AuthenticatedUser } from "../auth/auth.types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
