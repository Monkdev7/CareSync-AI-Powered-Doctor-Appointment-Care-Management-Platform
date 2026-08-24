import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";
import { loadEnv } from "../config/env.js";
import type { RegisterInput, LoginInput } from "./auth.schemas.js";
import type { SafeUser } from "./auth.types.js";

const env = loadEnv();

export interface AuthResult {
  token: string;
  user: SafeUser;
}

function toSafeUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role as SafeUser["role"],
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export async function registerPatient(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      role: "PATIENT",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const token = signToken(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );

  return { token, user: toSafeUser(user) };
}

export async function login(input: LoginInput): Promise<AuthResult | null> {
  const email = input.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return null;
  }

  if (!user.isActive) {
    return null;
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    return null;
  }

  const token = signToken(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );

  return { token, user: toSafeUser(user) };
}
