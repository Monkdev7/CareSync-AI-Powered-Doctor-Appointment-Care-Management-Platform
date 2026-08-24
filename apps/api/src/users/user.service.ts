import { prisma } from "../db.js";
import type { SafeUser } from "../auth/auth.types.js";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export async function getUserById(id: string): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: SAFE_USER_SELECT,
  });
  return user as SafeUser | null;
}

export async function updateUserStatus(
  userId: string,
  isActive: boolean
): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: SAFE_USER_SELECT,
  });
  return updated as SafeUser;
}
