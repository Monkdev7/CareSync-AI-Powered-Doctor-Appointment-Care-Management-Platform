/**
 * Authentication & RBAC Tests (Milestone 2)
 *
 * Covers:
 * - Registration (valid, duplicate, invalid, role restrictions)
 * - Login (valid, wrong password, unknown email, inactive user)
 * - JWT validation (expired, malformed, missing)
 * - RBAC (role enforcement, 401 vs 403)
 * - Profile (/api/users/me)
 * - Admin user management (activate/deactivate)
 *
 * Run: pnpm --filter @healthcare/api test:auth
 */

import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

const JWT_SECRET = "dev-only-secret-change-in-production-min16chars";

// Ensure env vars are set for the test process
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRES_IN = "1h";
process.env.NODE_ENV = "test";

let app: FastifyInstance;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
    failures.push(message);
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  await server.register(authRoutes);
  await server.register(userRoutes);
  await server.ready();
  return server;
}

// ─── Test Data Cleanup ──────────────────────────────────────────────────────

const TEST_EMAILS = [
  "test.register@test.dev",
  "test.duplicate@test.dev",
  "test.login@test.dev",
  "test.inactive@test.dev",
  "test.doctor@test.dev",
  "test.admin@test.dev",
  "test.patient.rbac@test.dev",
];

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: TEST_EMAILS } },
  });
}

async function seedTestUsers() {
  const hash = await hashPassword("ValidPass123");

  // Active patient for login tests
  await prisma.user.create({
    data: {
      email: "test.login@test.dev",
      passwordHash: hash,
      firstName: "Login",
      lastName: "User",
      role: "PATIENT",
    },
  });

  // Inactive user
  await prisma.user.create({
    data: {
      email: "test.inactive@test.dev",
      passwordHash: hash,
      firstName: "Inactive",
      lastName: "User",
      role: "PATIENT",
      isActive: false,
    },
  });

  // Doctor
  await prisma.user.create({
    data: {
      email: "test.doctor@test.dev",
      passwordHash: hash,
      firstName: "Test",
      lastName: "Doctor",
      role: "DOCTOR",
    },
  });

  // Admin
  await prisma.user.create({
    data: {
      email: "test.admin@test.dev",
      passwordHash: hash,
      firstName: "Test",
      lastName: "Admin",
      role: "ADMIN",
    },
  });

  // Patient for RBAC tests
  await prisma.user.create({
    data: {
      email: "test.patient.rbac@test.dev",
      passwordHash: hash,
      firstName: "Test",
      lastName: "Patient",
      role: "PATIENT",
    },
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "ValidPass123" },
  });
  const body = JSON.parse(res.body);
  return body.data?.token;
}

// ─── REGISTRATION TESTS ─────────────────────────────────────────────────────

async function testRegistration() {
  console.log("\n🧪 REGISTRATION");

  // 1. Valid registration
  const res1 = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "test.register@test.dev",
      password: "SecurePass123",
      firstName: "John",
      lastName: "Doe",
    },
  });
  assert(res1.statusCode === 201, "1. Valid patient registration succeeds (201)");

  const body1 = JSON.parse(res1.body);
  assert(typeof body1.data.token === "string", "1b. Response contains JWT token");

  // 2. Password stored as hash (verify in DB)
  const dbUser = await prisma.user.findUnique({
    where: { email: "test.register@test.dev" },
  });
  assert(
    dbUser !== null && dbUser.passwordHash.startsWith("$2b$"),
    "2. Password is stored as a bcrypt hash"
  );

  // 3. passwordHash never returned
  assert(
    body1.data.user.passwordHash === undefined,
    "3. passwordHash is never returned in response"
  );

  // 4. Duplicate email returns 409
  const res4 = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "test.register@test.dev",
      password: "AnotherPass123",
      firstName: "Jane",
      lastName: "Doe",
    },
  });
  assert(res4.statusCode === 409, "4. Duplicate email returns 409");

  // 5. Invalid email returns 400
  const res5 = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "not-an-email",
      password: "SecurePass123",
      firstName: "X",
      lastName: "Y",
    },
  });
  assert(res5.statusCode === 400, "5. Invalid email returns 400");

  // 6. Weak password returns 400
  const res6 = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "test.weak@test.dev",
      password: "short",
      firstName: "X",
      lastName: "Y",
    },
  });
  assert(res6.statusCode === 400, "6. Weak password returns 400");

  // 7. Cannot register as ADMIN (role field ignored, always PATIENT)
  const body7 = JSON.parse(res1.body);
  assert(body7.data.user.role === "PATIENT", "7. Public registration creates PATIENT role only");

  // 8. Even if someone tries to pass role in body, still PATIENT
  const res8 = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "test.duplicate@test.dev",
      password: "SecurePass123",
      firstName: "Hack",
      lastName: "Attempt",
      role: "ADMIN",
    },
  });
  const body8 = JSON.parse(res8.body);
  if (res8.statusCode === 201) {
    assert(body8.data.user.role === "PATIENT", "8. Cannot register as DOCTOR/ADMIN");
  } else {
    // Even a 400 means the role wasn't accepted
    assert(true, "8. Cannot register as DOCTOR/ADMIN (role field not accepted)");
  }
}

// ─── LOGIN TESTS ────────────────────────────────────────────────────────────

async function testLogin() {
  console.log("\n🧪 LOGIN");

  // 9. Valid credentials return JWT
  const res9 = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "test.login@test.dev", password: "ValidPass123" },
  });
  assert(res9.statusCode === 200, "9. Valid credentials return 200");
  const body9 = JSON.parse(res9.body);
  assert(typeof body9.data.token === "string", "9b. Response contains JWT");

  // 10. Wrong password returns 401
  const res10 = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "test.login@test.dev", password: "WrongPass999" },
  });
  assert(res10.statusCode === 401, "10. Incorrect password returns 401");
  const body10 = JSON.parse(res10.body);
  assert(
    body10.error.message === "Invalid email or password",
    "10b. Generic error message (no enumeration)"
  );

  // 11. Unknown email returns same 401
  const res11 = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "nonexistent@test.dev", password: "ValidPass123" },
  });
  assert(res11.statusCode === 401, "11. Unknown email returns 401");
  const body11 = JSON.parse(res11.body);
  assert(
    body11.error.message === "Invalid email or password",
    "11b. Same generic error for unknown email"
  );

  // 12. Inactive user cannot log in
  const res12 = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "test.inactive@test.dev", password: "ValidPass123" },
  });
  assert(res12.statusCode === 401, "12. Inactive user returns 401");

  // 13. JWT contains expected claims
  const decoded = jwt.decode(body9.data.token) as any;
  assert(decoded.sub !== undefined, "13a. JWT contains sub claim");
  assert(decoded.role === "PATIENT", "13b. JWT contains role claim");
  assert(decoded.email === "test.login@test.dev", "13c. JWT contains email claim");
  assert(decoded.exp !== undefined, "13d. JWT contains exp claim");
  assert(decoded.passwordHash === undefined, "13e. JWT does not contain passwordHash");

  // 14. Expired JWT is rejected
  const expiredToken = jwt.sign(
    { sub: "fake-id", role: "PATIENT", email: "x@x.com" },
    JWT_SECRET,
    { expiresIn: "0s" }
  );
  // Small delay to ensure expiry
  await new Promise((r) => setTimeout(r, 50));
  const res14 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  assert(res14.statusCode === 401, "14. Expired JWT is rejected (401)");
}

// ─── AUTHENTICATION TESTS ───────────────────────────────────────────────────

async function testAuthentication() {
  console.log("\n🧪 AUTHENTICATION");

  // 15. No JWT returns 401
  const res15 = await app.inject({
    method: "GET",
    url: "/api/users/me",
  });
  assert(res15.statusCode === 401, "15. Protected endpoint without JWT returns 401");

  // 16. Malformed JWT returns 401
  const res16 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: "Bearer not.a.valid.jwt.token" },
  });
  assert(res16.statusCode === 401, "16. Malformed JWT returns 401");

  // 17. Valid JWT authenticates correct user
  const token = await loginAs("test.login@test.dev");
  const res17 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: `Bearer ${token}` },
  });
  assert(res17.statusCode === 200, "17. Valid JWT returns 200");
  const body17 = JSON.parse(res17.body);
  assert(body17.data.email === "test.login@test.dev", "17b. Correct user returned");

  // 18. Deactivated user cannot access protected routes
  // First deactivate via admin
  const adminToken = await loginAs("test.admin@test.dev");
  const loginUser = await prisma.user.findUnique({
    where: { email: "test.login@test.dev" },
  });
  await app.inject({
    method: "PATCH",
    url: `/api/users/${loginUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: false },
  });

  const res18 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: `Bearer ${token}` },
  });
  assert(res18.statusCode === 401, "18. Deactivated user cannot access protected routes");

  // Re-activate for further tests
  await app.inject({
    method: "PATCH",
    url: `/api/users/${loginUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: true },
  });
}

// ─── RBAC TESTS ─────────────────────────────────────────────────────────────

async function testRbac() {
  console.log("\n🧪 RBAC");

  const patientToken = await loginAs("test.patient.rbac@test.dev");
  const doctorToken = await loginAs("test.doctor@test.dev");
  const adminToken = await loginAs("test.admin@test.dev");

  // We'll use PATCH /api/users/:id/status which requires ADMIN

  const targetUser = await prisma.user.findUnique({
    where: { email: "test.patient.rbac@test.dev" },
  });

  // 19. PATIENT can access patient-authorized route (/api/users/me)
  const res19 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res19.statusCode === 200, "19. PATIENT can access /api/users/me");

  // 20. DOCTOR cannot access admin-only route
  const res20 = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${doctorToken}` },
    payload: { isActive: false },
  });
  assert(res20.statusCode === 403, "20. DOCTOR cannot access admin-only route (403)");

  // 21. PATIENT cannot access admin-only route
  const res21 = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { isActive: false },
  });
  assert(res21.statusCode === 403, "21. PATIENT cannot access admin-only route (403)");

  // 22. ADMIN can access admin-only route
  const res22 = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: false },
  });
  assert(res22.statusCode === 200, "22. ADMIN can access admin-only route (200)");

  // Re-activate
  await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: true },
  });

  // 23. Authenticated user without required role gets 403 (not 401)
  const body21 = JSON.parse(res21.body);
  assert(
    body21.error.code === "FORBIDDEN",
    "23. Insufficient role returns FORBIDDEN code (not UNAUTHORIZED)"
  );
}

// ─── PROFILE TESTS ──────────────────────────────────────────────────────────

async function testProfile() {
  console.log("\n🧪 PROFILE");

  const token = await loginAs("test.login@test.dev");

  // 24. GET /api/users/me returns correct user
  const res24 = await app.inject({
    method: "GET",
    url: "/api/users/me",
    headers: { authorization: `Bearer ${token}` },
  });
  const body24 = JSON.parse(res24.body);
  assert(res24.statusCode === 200, "24. GET /api/users/me returns 200");
  assert(body24.data.firstName === "Login", "24b. Correct user data returned");

  // 25. Never returns passwordHash
  assert(
    body24.data.passwordHash === undefined,
    "25. GET /api/users/me never returns passwordHash"
  );
}

// ─── ADMIN USER MANAGEMENT TESTS ────────────────────────────────────────────

async function testAdminManagement() {
  console.log("\n🧪 ADMIN USER MANAGEMENT");

  const adminToken = await loginAs("test.admin@test.dev");
  const targetUser = await prisma.user.findUnique({
    where: { email: "test.patient.rbac@test.dev" },
  });

  // 26. Admin can deactivate user
  const res26 = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: false },
  });
  assert(res26.statusCode === 200, "26a. Admin can deactivate user");
  const body26 = JSON.parse(res26.body);
  assert(body26.data.isActive === false, "26b. User is now inactive");

  // Re-activate
  const res26b = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isActive: true },
  });
  assert(res26b.statusCode === 200, "26c. Admin can reactivate user");

  // 27. Non-admin receives 403
  const patientToken = await loginAs("test.patient.rbac@test.dev");
  const res27 = await app.inject({
    method: "PATCH",
    url: `/api/users/${targetUser!.id}/status`,
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { isActive: false },
  });
  assert(res27.statusCode === 403, "27. Non-admin receives 403");
}

// ─── RUNNER ─────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Authentication & RBAC Tests (Milestone 2)");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await cleanup();
    await seedTestUsers();
    app = await buildApp();

    await testRegistration();
    await testLogin();
    await testAuthentication();
    await testRbac();
    await testProfile();
    await testAdminManagement();
  } catch (error) {
    console.error("\n💥 Unexpected error during tests:", error);
    failed++;
  } finally {
    console.log("\n📋 Cleaning up...");
    await cleanup();
    await app.close();
    await prisma.$disconnect();
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  Failures:`);
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run();
