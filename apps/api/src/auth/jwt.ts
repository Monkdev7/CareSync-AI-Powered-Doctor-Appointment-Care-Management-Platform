import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";

export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
}

export function signToken(
  payload: JwtPayload,
  secret: string,
  expiresIn: string
): string {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, secret, options);
}

export function verifyToken(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret);
  return decoded as JwtPayload;
}
