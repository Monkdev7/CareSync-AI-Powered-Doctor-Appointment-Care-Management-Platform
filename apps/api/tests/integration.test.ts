/**
 * Milestone 10: Cross-Module Integration Tests
 * Run: pnpm --filter @healthcare/api test:integration
 */
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { specialisationRoutes } from "../src/specialisations/specialisation.routes.js";
import { doctorRoutes } from "../src/doctors/doctor.routes.js";
import { appointmentRoutes } from "../src/appointments/appointment.routes.js";
import { visitRoutes } from "../src/visits/visit.routes.js";
import { leaveRoutes } from "../src/leaves/leave.routes.js";
import { hashPassword } from "../src/auth/password.js";
import { processPendingNotifications } from "../src/notifications/notification.sender.js";
import { processPendingCalendarEvents } from "../src/calendar/calendar.sync.js";
import { setCalendarProvider, type CalendarProvider } from "../src/calendar/calendar.provider.js";
import { setEmailSender, type EmailSender } from "../src/notifications/email.sender.js";
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
let adminToken: string;
let doctorProfileId: string;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "m10_";
function futureMonday(): string {
  const now = new Date(); const d = now.getDay(); let u = 1 - d; if (u <= 0) u += 7;
  const t = new Date(now); t.setDate(now.getDate() + u); return t.toISOString().split("T")[0];
}
function addDays(s: string, n: number): string { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; }

async function cleanup() {
  await prisma.postVisitSummary.deleteMany({ where: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } });
  await prisma.medication.deleteMany({ where: { prescription: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } } });
  await prisma.prescription.deleteMany({ where: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } });
  await prisma.visitNote.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.preVisitSummary.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.calendarEvent.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.symptomSubmission.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.slotHold.deleteMany({});
  await prisma.doctorLeave.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: P } } } } });
  await prisma.doctorWorkingHour.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: P } } } } });
  await prisma.doctorProfile.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  await prisma.specialisation.deleteMany({ where: { name: { startsWith: P } } });
}

async function setup() {
  await cleanup();
  resetLLMProvider();
  setEmailSender({ send: async () => {} } as EmailSender);
  setCalendarProvider({ createEvent: async () => `gcal-int-${Date.now()}`, deleteEvent: async () => {} } as CalendarProvider);

  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${P}Cardio` } });
  const admin = await prisma.user.create({ data: { email: `${P}admin@t.dev`, passwordHash: hash, firstName: "A", lastName: "A", role: "ADMIN" } });
  const doc = await prisma.user.create({ data: { email: `${P}doc@t.dev`, passwordHash: hash, firstName: "D", lastName: "Smith", role: "DOCTOR" } });
  const prof = await prisma.doctorProfile.create({ data: { userId: doc.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 } });
  doctorProfileId = prof.id;
  await prisma.doctorWorkingHour.create({ data: { doctorProfileId, dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true } });
  await prisma.user.create({ data: { email: `${P}pat@t.dev`, passwordHash: hash, firstName: "P", lastName: "One", role: "PATIENT" } });

  app = Fastify({ logger: false });
  await app.register(authRoutes); await app.register(userRoutes); await app.register(specialisationRoutes);
  await app.register(doctorRoutes); await app.register(appointmentRoutes); await app.register(visitRoutes); await app.register(leaveRoutes);
  await app.ready();

  adminToken = JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}admin@t.dev`, password: "ValidPass123" } })).body).data.token;
  doctorToken = JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}doc@t.dev`, password: "ValidPass123" } })).body).data.token;
  patientToken = JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}pat@t.dev`, password: "ValidPass123" } })).body).data.token;
}

async function runTests() {
  console.log("\n🧪 CROSS-MODULE INTEGRATION");

  const monday = futureMonday();

  // 1. Patient hold + confirm → appointment created
  const holdRes = await app.inject({ method: "POST", url: "/api/appointments/hold", headers: { authorization: `Bearer ${patientToken}` }, payload: { doctorProfileId, slotDate: monday, slotStartTime: "09:00", slotEndTime: "09:30" } });
  assert(holdRes.statusCode === 201, "1. Patient creates hold");
  const holdId = JSON.parse(holdRes.body).data.id;

  const confRes = await app.inject({ method: "POST", url: "/api/appointments/confirm", headers: { authorization: `Bearer ${patientToken}` }, payload: { holdId, symptoms: "Chest pain, fatigue", duration: "1 week", severity: "moderate" } });
  assert(confRes.statusCode === 201, "2. Patient confirms appointment");
  const apptId = JSON.parse(confRes.body).data.id;

  // 3. Pre-visit summary generated (async, wait a moment)
  await new Promise((r) => setTimeout(r, 200));
  const preSum = await prisma.preVisitSummary.findUnique({ where: { appointmentId: apptId } });
  assert(preSum !== null && !preSum.isFailure, "3. Pre-visit summary generated without blocking booking");

  // 4. Doctor creates visit note
  const vnRes = await app.inject({ method: "POST", url: `/api/appointments/${apptId}/visit-note`, headers: { authorization: `Bearer ${doctorToken}` }, payload: { doctorNotes: "Examined patient. Mild condition.", diagnosis: "Fatigue syndrome" } });
  assert(vnRes.statusCode === 201, "4. Doctor creates visit note");

  // 5. Prescription triggers post-visit summary
  const rxRes = await app.inject({ method: "POST", url: `/api/appointments/${apptId}/prescription`, headers: { authorization: `Bearer ${doctorToken}` }, payload: { instructions: "Rest", medications: [{ name: "VitaminD", dosage: "1000IU", frequency: "ONCE_DAILY", duration: "30 days", startDate: "2026-08-25", endDate: "2026-09-24" }] } });
  assert(rxRes.statusCode === 201, "5. Prescription created");
  await new Promise((r) => setTimeout(r, 200));
  const postSum = await prisma.postVisitSummary.findFirst({ where: { visitNote: { appointmentId: apptId } } });
  assert(postSum !== null && !postSum.isFailure, "5b. Post-visit summary generated");

  // 6. Notification outbox can be processed
  const notifResult = await processPendingNotifications();
  assert(notifResult.sent >= 0, "6. Notification outbox processes without error");
  const sentNotifs = await prisma.notification.findMany({ where: { referenceId: apptId, status: "SENT" } });
  assert(sentNotifs.length === 2, "6b. Booking notifications sent (patient + doctor)");

  // 7. Calendar PENDING event can be processed
  const calResult = await processPendingCalendarEvents();
  assert(calResult.synced >= 0, "7. Calendar sync processes without error");
  const syncedCal = await prisma.calendarEvent.findFirst({ where: { appointmentId: apptId } });
  assert(syncedCal!.syncStatus === "SYNCED", "7b. CalendarEvent is SYNCED");

  // 8. Doctor leave affects availability
  const nextMonday = addDays(monday, 7);
  await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: nextMonday, endDate: nextMonday } });
  const availRes = await app.inject({ method: "GET", url: `/api/doctors/${doctorProfileId}/availability?date=${nextMonday}`, headers: { authorization: `Bearer ${patientToken}` } });
  const avail = JSON.parse(availRes.body).data;
  assert(avail.slots.length === 0, "8. Doctor leave blocks availability");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 10: Cross-Module Integration Tests");
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
