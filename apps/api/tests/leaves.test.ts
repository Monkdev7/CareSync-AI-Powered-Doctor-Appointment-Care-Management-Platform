/**
 * Milestone 7 Tests: Doctor Leave Management
 * Run: pnpm --filter @healthcare/api test:leaves
 */
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { specialisationRoutes } from "../src/specialisations/specialisation.routes.js";
import { doctorRoutes } from "../src/doctors/doctor.routes.js";
import { appointmentRoutes } from "../src/appointments/appointment.routes.js";
import { leaveRoutes } from "../src/leaves/leave.routes.js";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.JWT_SECRET = "dev-only-secret-change-in-production-min16chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.NODE_ENV = "test";
process.env.LLM_PROVIDER = "mock";
process.env.SLOT_HOLD_DURATION_MINUTES = "5";

let app: FastifyInstance;
let adminToken: string;
let patientToken: string;
let doctorProfileId: string;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "m7t_";
function futureMonday(): string {
  const now = new Date(); const d = now.getDay(); let u = 1 - d; if (u <= 0) u += 7;
  const t = new Date(now); t.setDate(now.getDate() + u); return t.toISOString().split("T")[0];
}
function addDays(dateStr: string, days: number): string {
  const dt = new Date(dateStr); dt.setDate(dt.getDate() + days); return dt.toISOString().split("T")[0];
}

async function cleanup() {
  await prisma.doctorLeave.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: P } } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.calendarEvent.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.symptomSubmission.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.slotHold.deleteMany({});
  await prisma.doctorWorkingHour.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: P } } } } });
  await prisma.doctorProfile.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  await prisma.specialisation.deleteMany({ where: { name: { startsWith: P } } });
}

async function setup() {
  await cleanup();
  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${P}Cardio` } });
  await prisma.user.create({ data: { email: `${P}admin@t.dev`, passwordHash: hash, firstName: "A", lastName: "A", role: "ADMIN" } });
  const dUser = await prisma.user.create({ data: { email: `${P}doc@t.dev`, passwordHash: hash, firstName: "D", lastName: "D", role: "DOCTOR" } });
  const prof = await prisma.doctorProfile.create({ data: { userId: dUser.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 } });
  doctorProfileId = prof.id;
  await prisma.doctorWorkingHour.create({ data: { doctorProfileId, dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true } });
  await prisma.user.create({ data: { email: `${P}pat@t.dev`, passwordHash: hash, firstName: "P", lastName: "P", role: "PATIENT" } });

  app = Fastify({ logger: false });
  await app.register(authRoutes); await app.register(userRoutes); await app.register(specialisationRoutes);
  await app.register(doctorRoutes); await app.register(appointmentRoutes); await app.register(leaveRoutes);
  await app.ready();

  adminToken = (JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}admin@t.dev`, password: "ValidPass123" } })).body)).data.token;
  patientToken = (JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}pat@t.dev`, password: "ValidPass123" } })).body)).data.token;
}

async function runTests() {
  console.log("\n🧪 DOCTOR LEAVE MANAGEMENT");

  const monday = futureMonday();
  const tuesday = addDays(monday, 1);

  // 1. Admin can create leave
  const r1 = await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: monday, endDate: tuesday, reason: "Personal" } });
  assert(r1.statusCode === 201, "1. Admin can create leave");
  const leave = JSON.parse(r1.body).data;
  assert(leave.reason === "Personal", "1b. Reason stored");

  // 2. Non-admin cannot create leave
  const r2 = await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${patientToken}` }, payload: { startDate: addDays(monday, 7), endDate: addDays(monday, 8) } });
  assert(r2.statusCode === 403, "2. Non-admin cannot create leave");

  // 3. Invalid leave input rejected (end before start)
  const r3 = await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: tuesday, endDate: monday } });
  assert(r3.statusCode === 400, "3. Invalid leave (end before start) rejected");

  // 4. Overlapping leave rejected
  const r4 = await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: monday, endDate: monday } });
  assert(r4.statusCode === 409, "4. Overlapping leave rejected");

  // 5. Leave stored correctly (list)
  const r5 = await app.inject({ method: "GET", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` } });
  assert(r5.statusCode === 200, "5. Leave list returns 200");
  const leaves = JSON.parse(r5.body).data;
  assert(leaves.length >= 1, "5b. Leave is stored");

  // 6. Availability returns no slots during leave
  const r6 = await app.inject({ method: "GET", url: `/api/doctors/${doctorProfileId}/availability?date=${monday}`, headers: { authorization: `Bearer ${patientToken}` } });
  const avail6 = JSON.parse(r6.body).data;
  assert(avail6.slots.length === 0, "6. Availability returns no slots during leave");

  // 7. Availability works outside leave period
  const nextMonday = addDays(monday, 14);
  const r7 = await app.inject({ method: "GET", url: `/api/doctors/${doctorProfileId}/availability?date=${nextMonday}`, headers: { authorization: `Bearer ${patientToken}` } });
  const avail7 = JSON.parse(r7.body).data;
  assert(avail7.slots.length === 6, "7. Availability works outside leave period (6 slots)");

  // 8. Invalid doctor returns 404
  const r8 = await app.inject({ method: "POST", url: `/api/doctors/00000000-0000-0000-0000-000000000099/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: "2099-01-01", endDate: "2099-01-02" } });
  assert(r8.statusCode === 404, "8. Invalid doctor returns 404");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 7: Doctor Leave Management Tests");
  console.log("═══════════════════════════════════════════════════════════");
  try { await setup(); await runTests(); } catch (e) { console.error("\n💥", e); failed++; } finally {
    await cleanup(); await app.close(); await prisma.$disconnect();
  }
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) failures.forEach((f) => console.log(`    - ${f}`));
  console.log("═══════════════════════════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}
run();
