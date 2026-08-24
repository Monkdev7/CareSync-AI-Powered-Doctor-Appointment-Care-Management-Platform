import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { verifyToken } from "./jwt.js";
import { prisma } from "../db.js";
import { loadEnv } from "../config/env.js";
import type { AuthenticatedUser } from "./auth.types.js";

const env = loadEnv();

/**
 * Fastify preHandler hook that verifies JWT and attaches user to request.
 * Returns 401 if token is missing, invalid, expired, or user is inactive.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token, env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    if (!user.isActive) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Account is deactivated" },
      });
    }

    request.user = user;
  } catch {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
}

/**
 * Returns a Fastify preHandler hook that checks the authenticated user's role.
 * Must be used after `authenticate`.
 * Returns 403 if user does not have one of the required roles.
 */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    if (!roles.includes(user.role)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
    }
  };
}
