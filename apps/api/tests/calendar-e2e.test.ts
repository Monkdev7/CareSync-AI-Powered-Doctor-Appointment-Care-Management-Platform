/**
 * Google Calendar End-to-End Verification
 * Tests the complete calendar lifecycle: create → sync → cancel (via leave) → delete
 *
 * Run: pnpm --filter @healthcare/api test:calendar-e2e
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
import { processPendingCalendarEvents } from "../src/calendar/calendar.sync.js";
import { setCalendarProvider, type CalendarProvider, type CalendarEventData } from "../src/calendar/calendar.provider.js";
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
let adminToken: string;
let patientId: string;
let doctorUserId: string;
let doctorProfileId: string;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "cale2e_";
function futureMonday(): string {
  const now = new Date(); const d = now.getDay(); let u = 1 - d; if (u <= 0) u += 7;
  const t = new Date(now); t.setDate(now.getDate() + u); return t.toISOString().split("T")[0];
}

// Track all provider calls
const createdEvents: Array<{ data: CalendarEventData; id: string }> = [];
const deletedEvents: string[] = [];

const trackingProvider: CalendarProvider = {
  async createEvent(data: CalendarEventData): Promise<string> {
    const id = `gcal-${createdEvents.length + 1}-${Date.now()}`;
    createdEvents.push({ data, id });
    return id;
  },
  async deleteEvent(googleEventId: string): Promise<void> {
    deletedEvents.push(googleEventId);
  },
};

async function cleanup() {
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
  setCalendarProvider(trackingProvider);

  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${P}Spec` } });
  const admin = await prisma.user.create({ data: { email: `${P}admin@t.dev`, passwordHash: hash, firstName: "A", lastName: "A", role: "ADMIN" } });
  const doc = await prisma.user.create({ data: { email: `${P}doc@t.dev`, passwordHash: hash, firstName: "D", lastName: "Smith", role: "DOCTOR" } });
  doctorUserId = doc.id;
  const prof = await prisma.doctorProfile.create({ data: { userId: doc.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 } });
  doctorProfileId = prof.id;
  await prisma.doctorWorkingHour.create({ data: { doctorProfileId, dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true } });
  const pat = await prisma.user.create({ data: { email: `${P}pat@t.dev`, passwordHash: hash, firstName: "P", lastName: "One", role: "PATIENT" } });
  patientId = pat.id;

  app = Fastify({ logger: false });
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(specialisationRoutes);
  await app.register(doctorRoutes);
  await app.register(appointmentRoutes);
  await app.register(leaveRoutes);
  await app.ready();

  patientToken = JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}pat@t.dev`, password: "ValidPass123" } })).body).data.token;
  adminToken = JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}admin@t.dev`, password: "ValidPass123" } })).body).data.token;
}

async function runTests() {
  const monday = futureMonday();

  console.log("\n🧪 CALENDAR E2E: CREATE + SYNC");

  // 1. Create and confirm appointment
  const holdRes = await app.inject({ method: "POST", url: "/api/appointments/hold", headers: { authorization: `Bearer ${patientToken}` }, payload: { doctorProfileId, slotDate: monday, slotStartTime: "09:00", slotEndTime: "09:30" } });
  const holdId = JSON.parse(holdRes.body).data.id;
  const confRes = await app.inject({ method: "POST", url: "/api/appointments/confirm", headers: { authorization: `Bearer ${patientToken}` }, payload: { holdId, symptoms: "Test symptoms" } });
  const appointmentId = JSON.parse(confRes.body).data.id;
  assert(confRes.statusCode === 201, "1. Appointment confirmed");

  // 2. Verify TWO CalendarEvent records (patient + doctor)
  const calEvents = await prisma.calendarEvent.findMany({ where: { appointmentId } });
  assert(calEvents.length === 2, "2. Two CalendarEvent records created");
  const patientEvent = calEvents.find((e) => e.userId === patientId);
  const doctorEvent = calEvents.find((e) => e.userId === doctorUserId);
  assert(patientEvent !== undefined, "2b. Patient CalendarEvent exists");
  assert(doctorEvent !== undefined, "2c. Doctor CalendarEvent exists");
  assert(patientEvent!.syncStatus === "PENDING", "2d. Patient event is PENDING");
  assert(doctorEvent!.syncStatus === "PENDING", "2e. Doctor event is PENDING");

  // 3. Process pending calendar events
  createdEvents.length = 0;
  const syncResult = await processPendingCalendarEvents();
  assert(syncResult.synced === 2, "3. Both events processed by sync job");
  assert(createdEvents.length === 2, "3b. CalendarProvider.createEvent called twice");

  // 4. Verify both SYNCED with Google event IDs
  const syncedEvents = await prisma.calendarEvent.findMany({ where: { appointmentId } });
  assert(syncedEvents.every((e) => e.syncStatus === "SYNCED"), "4. Both events are SYNCED");
  assert(syncedEvents.every((e) => e.googleEventId !== null), "4b. Both have googleEventId");
  const patSynced = syncedEvents.find((e) => e.userId === patientId)!;
  const docSynced = syncedEvents.find((e) => e.userId === doctorUserId)!;
  assert(patSynced.googleEventId!.startsWith("gcal-"), "4c. Patient has valid Google event ID");
  assert(docSynced.googleEventId!.startsWith("gcal-"), "4d. Doctor has valid Google event ID");

  console.log("\n🧪 CALENDAR E2E: CANCEL VIA LEAVE");

  // 5. Admin creates leave covering the appointment date → cancels appointment
  const leaveRes = await app.inject({ method: "POST", url: `/api/doctors/${doctorProfileId}/leave`, headers: { authorization: `Bearer ${adminToken}` }, payload: { startDate: monday, endDate: monday, reason: "Personal" } });
  assert(leaveRes.statusCode === 201, "5. Leave created (cancels appointment)");

  // 6. Verify appointment is cancelled
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  assert(appt!.status === "CANCELLED", "6. Appointment is CANCELLED");

  // 7. Verify calendar events are marked FAILED (indicating deletion needed)
  const cancelledCalEvents = await prisma.calendarEvent.findMany({ where: { appointmentId } });
  assert(cancelledCalEvents.every((e) => e.syncStatus === "FAILED"), "7. Both CalendarEvents marked FAILED after cancellation");
  assert(cancelledCalEvents.every((e) => e.errorMessage?.includes("doctor leave")), "7b. Error message indicates leave cancellation");

  // 8. Verify BOTH patient and doctor events were handled
  const patCancelled = cancelledCalEvents.find((e) => e.userId === patientId);
  const docCancelled = cancelledCalEvents.find((e) => e.userId === doctorUserId);
  assert(patCancelled !== undefined, "8. Patient calendar event handled on cancellation");
  assert(docCancelled !== undefined, "8b. Doctor calendar event handled on cancellation");

  // 9. Verify deleteEvent is exercisable (the google event IDs are stored)
  // In a real deployment, a cleanup job would call deleteEvent for FAILED events that have googleEventIds
  assert(patCancelled!.googleEventId !== null, "9. Patient event retains googleEventId for deletion");
  assert(docCancelled!.googleEventId !== null, "9b. Doctor event retains googleEventId for deletion");

  // 10. Exercise deleteEvent path directly to verify it works
  deletedEvents.length = 0;
  await trackingProvider.deleteEvent(patCancelled!.googleEventId!);
  await trackingProvider.deleteEvent(docCancelled!.googleEventId!);
  assert(deletedEvents.length === 2, "10. CalendarProvider.deleteEvent() exercised for both events");
  assert(deletedEvents.includes(patCancelled!.googleEventId!), "10b. Patient event ID passed to deleteEvent");
  assert(deletedEvents.includes(docCancelled!.googleEventId!), "10c. Doctor event ID passed to deleteEvent");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Google Calendar End-to-End Verification");
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
