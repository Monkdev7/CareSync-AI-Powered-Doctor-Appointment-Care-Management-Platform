/**
 * Milestone 5 Tests: LLM Pre-Visit Summary
 *
 * Run: pnpm --filter @healthcare/api test:llm
 */

import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { specialisationRoutes } from "../src/specialisations/specialisation.routes.js";
import { doctorRoutes } from "../src/doctors/doctor.routes.js";
import { appointmentRoutes } from "../src/appointments/appointment.routes.js";
import { hashPassword } from "../src/auth/password.js";
import { generatePreVisitSummary } from "../src/llm/pre-visit-summary.js";
import { resetLLMProvider } from "../src/llm/llm.service.js";

const prisma = new PrismaClient();

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.JWT_SECRET = "dev-only-secret-change-in-production-min16chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.NODE_ENV = "test";
process.env.LLM_PROVIDER = "mock";
process.env.SLOT_HOLD_DURATION_MINUTES = "5";

let app: FastifyInstance;
let patientToken: string;
let doctorToken: string;
let patientId: string;
let doctorProfileId: string;
let appointmentId: string;

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

const PREFIX = "m5t_";

function futureMonday(): string {
  const now = new Date();
  const day = now.getDay();
  let daysUntil = 1 - day;
  if (daysUntil <= 0) daysUntil += 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntil);
  return target.toISOString().split("T")[0];
}

async function cleanup() {
  await prisma.preVisitSummary.deleteMany({ where: { appointment: { patient: { email: { startsWith: PREFIX } } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.calendarEvent.deleteMany({ where: { appointment: { patient: { email: { startsWith: PREFIX } } } } });
  await prisma.symptomSubmission.deleteMany({ where: { patient: { email: { startsWith: PREFIX } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: PREFIX } } } });
  await prisma.slotHold.deleteMany({});
  await prisma.doctorWorkingHour.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: PREFIX } } } } });
  await prisma.doctorProfile.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.specialisation.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

async function setup() {
  await cleanup();
  resetLLMProvider();

  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${PREFIX}Cardiology` } });

  const doctorUser = await prisma.user.create({
    data: { email: `${PREFIX}doctor@test.dev`, passwordHash: hash, firstName: "Doc", lastName: "Smith", role: "DOCTOR" },
  });
  const profile = await prisma.doctorProfile.create({
    data: { userId: doctorUser.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 },
  });
  doctorProfileId = profile.id;

  await prisma.doctorWorkingHour.create({
    data: { doctorProfileId, dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true },
  });

  const patient = await prisma.user.create({
    data: { email: `${PREFIX}patient@test.dev`, passwordHash: hash, firstName: "Pat", lastName: "One", role: "PATIENT" },
  });
  patientId = patient.id;

  app = Fastify({ logger: false });
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(specialisationRoutes);
  await app.register(doctorRoutes);
  await app.register(appointmentRoutes);
  await app.ready();

  const pRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${PREFIX}patient@test.dev`, password: "ValidPass123" } });
  patientToken = JSON.parse(pRes.body).data.token;
  const dRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${PREFIX}doctor@test.dev`, password: "ValidPass123" } });
  doctorToken = JSON.parse(dRes.body).data.token;

  // Create a confirmed appointment via hold+confirm flow
  const monday = futureMonday();
  const holdRes = await app.inject({
    method: "POST", url: "/api/appointments/hold",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { doctorProfileId, slotDate: monday, slotStartTime: "09:00", slotEndTime: "09:30" },
  });
  const hold = JSON.parse(holdRes.body).data;

  const confirmRes = await app.inject({
    method: "POST", url: "/api/appointments/confirm",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { holdId: hold.id, symptoms: "Chest pain, shortness of breath", duration: "3 days", severity: "moderate" },
  });
  appointmentId = JSON.parse(confirmRes.body).data.id;

  // Wait a moment for async summary generation
  await new Promise((r) => setTimeout(r, 200));
}

async function testPreVisitSummary() {
  console.log("\n🧪 PRE-VISIT SUMMARY GENERATION");

  // 1. Summary is generated after confirmation (mock provider)
  const summary = await prisma.preVisitSummary.findUnique({ where: { appointmentId } });
  assert(summary !== null, "1. Pre-visit summary is generated after confirmation");
  assert(summary!.isFailure === false, "1b. Summary is not a failure");
  assert(summary!.urgencyLevel === "MEDIUM", "1c. Urgency level populated from mock");
  assert(summary!.chiefComplaint !== null && summary!.chiefComplaint!.length > 0, "1d. Chief complaint populated");
  assert(summary!.suggestedQuestions.length === 3, "1e. 3 suggested questions generated");
  assert(summary!.llmProvider === "mock", "1f. LLM provider recorded");
  assert(summary!.rawLlmResponse !== null, "1g. Raw response stored");

  // 2. Idempotent — calling again does not create duplicate
  await generatePreVisitSummary(appointmentId);
  const count = await prisma.preVisitSummary.count({ where: { appointmentId } });
  assert(count === 1, "2. Idempotent — no duplicate summary created");

  // 3. Doctor can view pre-visit summary
  const res3 = await app.inject({
    method: "GET", url: `/api/appointments/${appointmentId}/pre-summary`,
    headers: { authorization: `Bearer ${doctorToken}` },
  });
  assert(res3.statusCode === 200, "3. Doctor can view pre-visit summary");
  const body3 = JSON.parse(res3.body).data;
  assert(body3.urgencyLevel === "MEDIUM", "3b. Summary data returned correctly");

  // 4. Patient cannot view pre-visit summary (doctor-only)
  const res4 = await app.inject({
    method: "GET", url: `/api/appointments/${appointmentId}/pre-summary`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res4.statusCode === 403, "4. Patient cannot view pre-visit summary");
}

async function testLLMFailureHandling() {
  console.log("\n🧪 LLM FAILURE HANDLING");

  // Create another appointment without symptoms to test failure path
  const monday = futureMonday();
  const holdRes = await app.inject({
    method: "POST", url: "/api/appointments/hold",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { doctorProfileId, slotDate: monday, slotStartTime: "09:30", slotEndTime: "10:00" },
  });
  const hold = JSON.parse(holdRes.body).data;
  const confirmRes = await app.inject({
    method: "POST", url: "/api/appointments/confirm",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { holdId: hold.id, symptoms: "Headache" },
  });
  const appt2Id = JSON.parse(confirmRes.body).data.id;
  await new Promise((r) => setTimeout(r, 200));

  // 5. Appointment booking succeeds regardless of LLM
  assert(confirmRes.statusCode === 201, "5. Appointment booking succeeds regardless of LLM state");

  // 6. Summary exists (mock always succeeds, but test the pattern)
  const summary2 = await prisma.preVisitSummary.findUnique({ where: { appointmentId: appt2Id } });
  assert(summary2 !== null, "6. Summary record created for second appointment");

  // 7. Test failure scenario: generate for non-existent symptoms
  const fakeApptId = "00000000-0000-0000-0000-fakeappt0001";
  // Create a fake appointment without symptoms
  const fakeAppt = await prisma.appointment.create({
    data: {
      id: fakeApptId,
      patientId,
      doctorProfileId,
      slotDate: new Date(Date.UTC(2099, 0, 15)),
      slotStartTime: "15:00",
      slotEndTime: "15:30",
      status: "CONFIRMED",
    },
  });

  await generatePreVisitSummary(fakeApptId);
  const failSummary = await prisma.preVisitSummary.findUnique({ where: { appointmentId: fakeApptId } });
  assert(failSummary !== null, "7. Failure record created when symptoms missing");
  assert(failSummary!.isFailure === true, "7b. isFailure is true");
  assert(failSummary!.errorMessage !== null, "7c. Error message recorded");

  // Cleanup fake
  await prisma.preVisitSummary.deleteMany({ where: { appointmentId: fakeApptId } });
  await prisma.appointment.deleteMany({ where: { id: fakeApptId } });
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 5: LLM Pre-Visit Summary Tests");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await setup();
    await testPreVisitSummary();
    await testLLMFailureHandling();
  } catch (error) {
    console.error("\n💥 Unexpected error:", error);
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
    console.log("  Failures:");
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

run();
