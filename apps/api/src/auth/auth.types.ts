import type { Role } from "@prisma/client";

/** Safe user info returned from API (never includes passwordHash) */
export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

/** Authenticated user attached to request */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
}
