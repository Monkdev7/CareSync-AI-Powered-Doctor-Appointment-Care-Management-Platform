/**
 * Milestone 9 Tests: Google Calendar Integration
 * Run: pnpm --filter @healthcare/api test:calendar
 */
import { PrismaClient } from "@prisma/client";
import { processPendingCalendarEvents } from "../src/calendar/calendar.sync.js";
import { setCalendarProvider, type CalendarProvider, type CalendarEventData } from "../src/calendar/calendar.provider.js";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.NODE_ENV = "test";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "m9t_";
let userId: string;
let doctorProfileId: string;
let appointmentId: string;

async function cleanup() {
  await prisma.calendarEvent.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.symptomSubmission.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: P } } } });
  await prisma.doctorWorkingHour.deleteMany({ where: { doctorProfile: { user: { email: { startsWith: P } } } } });
  await prisma.doctorProfile.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  await prisma.specialisation.deleteMany({ where: { name: { startsWith: P } } });
}

async function setup() {
  await cleanup();
  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${P}Spec` } });
  const patient = await prisma.user.create({ data: { email: `${P}pat@t.dev`, passwordHash: hash, firstName: "P", lastName: "P", role: "PATIENT" } });
  userId = patient.id;
  const doc = await prisma.user.create({ data: { email: `${P}doc@t.dev`, passwordHash: hash, firstName: "D", lastName: "D", role: "DOCTOR" } });
  const prof = await prisma.doctorProfile.create({ data: { userId: doc.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 } });
  doctorProfileId = prof.id;

  // Create a confirmed appointment with a PENDING CalendarEvent (simulating M4 output)
  const appt = await prisma.appointment.create({
    data: { patientId: userId, doctorProfileId, slotDate: new Date(Date.UTC(2099, 0, 13)), slotStartTime: "09:00", slotEndTime: "09:30", status: "CONFIRMED" },
  });
  appointmentId = appt.id;
  await prisma.calendarEvent.create({ data: { appointmentId, userId, syncStatus: "PENDING" } });
}

async function runTests() {
  console.log("\n🧪 GOOGLE CALENDAR SYNC");

  // Use mock provider
  const created: CalendarEventData[] = [];
  const mock: CalendarProvider = { createEvent: async (d) => { created.push(d); return `gcal-${Date.now()}`; } };
  setCalendarProvider(mock);

  // 1. PENDING event is processed
  const r1 = await processPendingCalendarEvents();
  assert(r1.synced === 1, "1. PENDING CalendarEvent processed successfully");

  // 2. googleEventId stored
  const ev2 = await prisma.calendarEvent.findFirst({ where: { appointmentId } });
  assert(ev2!.googleEventId !== null && ev2!.googleEventId!.startsWith("gcal-"), "2. googleEventId stored");

  // 3. Status is SYNCED
  assert(ev2!.syncStatus === "SYNCED", "3. syncStatus is SYNCED");
  assert(ev2!.lastSyncAt !== null, "3b. lastSyncAt set");

  // 4. Already SYNCED event not recreated
  created.length = 0;
  const r4 = await processPendingCalendarEvents();
  assert(r4.processed === 0, "4. Already SYNCED event not reprocessed");
  assert(created.length === 0, "4b. No provider call made");

  // 5. Provider failure handled safely
  const failProvider: CalendarProvider = { createEvent: async () => { throw new Error("API unavailable"); } };
  setCalendarProvider(failProvider);

  const appt2 = await prisma.appointment.create({
    data: { patientId: userId, doctorProfileId, slotDate: new Date(Date.UTC(2099, 0, 14)), slotStartTime: "10:00", slotEndTime: "10:30", status: "CONFIRMED" },
  });
  await prisma.calendarEvent.create({ data: { appointmentId: appt2.id, userId, syncStatus: "PENDING" } });

  const r5 = await processPendingCalendarEvents();
  assert(r5.failed === 1, "5. Provider failure handled");
  const ev5 = await prisma.calendarEvent.findFirst({ where: { appointmentId: appt2.id } });
  assert(ev5!.syncStatus === "FAILED", "5b. syncStatus is FAILED");
  assert(ev5!.errorMessage === "API unavailable", "5c. errorMessage stored");
  assert(ev5!.retryCount === 1, "5d. retryCount incremented");

  // 6. Booking is independent of calendar (appointment still CONFIRMED despite calendar failure)
  const apptCheck = await prisma.appointment.findUnique({ where: { id: appt2.id } });
  assert(apptCheck!.status === "CONFIRMED", "6. Booking remains CONFIRMED despite calendar failure");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 9: Google Calendar Integration Tests");
  console.log("═══════════════════════════════════════════════════════════");
  try { await setup(); await runTests(); } catch (e) { console.error("\n💥", e); failed++; } finally {
    await cleanup(); await prisma.$disconnect();
  }
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) failures.forEach((f) => console.log(`    - ${f}`));
  console.log("═══════════════════════════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}
run();
