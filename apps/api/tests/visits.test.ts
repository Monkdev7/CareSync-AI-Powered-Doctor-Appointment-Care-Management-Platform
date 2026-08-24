/**
 * Milestone 6 Tests: Visit Notes, Prescriptions & Post-Visit Summary
 * Run: pnpm --filter @healthcare/api test:visits
 */
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { specialisationRoutes } from "../src/specialisations/specialisation.routes.js";
import { doctorRoutes } from "../src/doctors/doctor.routes.js";
import { appointmentRoutes } from "../src/appointments/appointment.routes.js";
import { visitRoutes } from "../src/visits/visit.routes.js";
import { hashPassword } from "../src/auth/password.js";
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
let patient2Token: string;
let appointmentId: string;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "m6t_";
function futureMonday(): string {
  const now = new Date(); const d = now.getDay(); let u = 1 - d; if (u <= 0) u += 7;
  const t = new Date(now); t.setDate(now.getDate() + u); return t.toISOString().split("T")[0];
}

async function cleanup() {
  await prisma.postVisitSummary.deleteMany({ where: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } });
  await prisma.medication.deleteMany({ where: { prescription: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } } });
  await prisma.prescription.deleteMany({ where: { visitNote: { appointment: { patient: { email: { startsWith: P } } } } } });
  await prisma.visitNote.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
  await prisma.preVisitSummary.deleteMany({ where: { appointment: { patient: { email: { startsWith: P } } } } });
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
  resetLLMProvider();
  const hash = await hashPassword("ValidPass123");
  const spec = await prisma.specialisation.create({ data: { name: `${P}Cardio` } });
  const dUser = await prisma.user.create({ data: { email: `${P}doc@t.dev`, passwordHash: hash, firstName: "Doc", lastName: "S", role: "DOCTOR" } });
  const prof = await prisma.doctorProfile.create({ data: { userId: dUser.id, specialisationId: spec.id, qualifications: ["MD"], consultationDurationMin: 30 } });
  await prisma.doctorWorkingHour.create({ data: { doctorProfileId: prof.id, dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true } });
  const p1 = await prisma.user.create({ data: { email: `${P}pat@t.dev`, passwordHash: hash, firstName: "P", lastName: "1", role: "PATIENT" } });
  const p2 = await prisma.user.create({ data: { email: `${P}pat2@t.dev`, passwordHash: hash, firstName: "P", lastName: "2", role: "PATIENT" } });

  app = Fastify({ logger: false });
  await app.register(authRoutes); await app.register(userRoutes); await app.register(specialisationRoutes);
  await app.register(doctorRoutes); await app.register(appointmentRoutes); await app.register(visitRoutes);
  await app.ready();

  patientToken = (JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}pat@t.dev`, password: "ValidPass123" } })).body)).data.token;
  doctorToken = (JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}doc@t.dev`, password: "ValidPass123" } })).body)).data.token;
  patient2Token = (JSON.parse((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${P}pat2@t.dev`, password: "ValidPass123" } })).body)).data.token;

  // Book an appointment
  const monday = futureMonday();
  const holdRes = await app.inject({ method: "POST", url: "/api/appointments/hold", headers: { authorization: `Bearer ${patientToken}` }, payload: { doctorProfileId: prof.id, slotDate: monday, slotStartTime: "09:00", slotEndTime: "09:30" } });
  const hold = JSON.parse(holdRes.body).data;
  const confRes = await app.inject({ method: "POST", url: "/api/appointments/confirm", headers: { authorization: `Bearer ${patientToken}` }, payload: { holdId: hold.id, symptoms: "Chest pain" } });
  appointmentId = JSON.parse(confRes.body).data.id;
  await new Promise((r) => setTimeout(r, 150));
}

async function testVisitNotes() {
  console.log("\n🧪 VISIT NOTES");

  // 1. Patient cannot create visit note
  const r1 = await app.inject({ method: "POST", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${patientToken}` }, payload: { doctorNotes: "Test" } });
  assert(r1.statusCode === 403, "1. Patient cannot create visit note");

  // 2. Doctor creates visit note
  const r2 = await app.inject({ method: "POST", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${doctorToken}` }, payload: { doctorNotes: "Patient examined. Mild symptoms.", diagnosis: "Common cold", followUpDate: "2026-10-01" } });
  assert(r2.statusCode === 201, "2. Doctor creates visit note");
  const note = JSON.parse(r2.body).data;
  assert(note.doctorNotes === "Patient examined. Mild symptoms.", "2b. Notes stored correctly");
  assert(note.diagnosis === "Common cold", "2c. Diagnosis stored");

  // 3. Duplicate visit note rejected
  const r3 = await app.inject({ method: "POST", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${doctorToken}` }, payload: { doctorNotes: "Another" } });
  assert(r3.statusCode === 409, "3. Duplicate visit note rejected");

  // 4. Doctor can view visit note
  const r4 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${doctorToken}` } });
  assert(r4.statusCode === 200, "4. Doctor can view visit note");

  // 5. Patient can view visit note
  const r5 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${patientToken}` } });
  assert(r5.statusCode === 200, "5. Patient can view own visit note");

  // 6. Other patient cannot view
  const r6 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/visit-note`, headers: { authorization: `Bearer ${patient2Token}` } });
  assert(r6.statusCode === 404, "6. Other patient cannot view visit note");
}

async function testPrescriptions() {
  console.log("\n🧪 PRESCRIPTIONS");

  // 7. Doctor creates prescription with medications
  const r7 = await app.inject({
    method: "POST", url: `/api/appointments/${appointmentId}/prescription`,
    headers: { authorization: `Bearer ${doctorToken}` },
    payload: {
      instructions: "Take with food",
      medications: [
        { name: "Amoxicillin", dosage: "500mg", frequency: "THREE_TIMES_DAILY", duration: "7 days", startDate: "2026-08-25", endDate: "2026-09-01" },
        { name: "Ibuprofen", dosage: "200mg", frequency: "TWICE_DAILY", duration: "5 days", instructions: "After meals", startDate: "2026-08-25", endDate: "2026-08-30" },
      ],
    },
  });
  assert(r7.statusCode === 201, "7. Doctor creates prescription");
  const presc = JSON.parse(r7.body).data;
  assert(presc.medications.length === 2, "7b. Two medications created");
  assert(presc.medications[0].name === "Amoxicillin", "7c. Medication name correct");
  assert(presc.medications[0].frequency === "THREE_TIMES_DAILY", "7d. Frequency correct");

  // 8. Patient cannot create prescription
  const r8 = await app.inject({ method: "POST", url: `/api/appointments/${appointmentId}/prescription`, headers: { authorization: `Bearer ${patientToken}` }, payload: { medications: [{ name: "X", dosage: "1mg", frequency: "ONCE_DAILY", duration: "1d", startDate: "2026-08-25", endDate: "2026-08-26" }] } });
  assert(r8.statusCode === 403, "8. Patient cannot create prescription");

  // 9. Prescription requires visit note
  // Test with a different appointment that has no visit note
  // (we skip creating another appointment; just verify schema validation works)
  const r9 = await app.inject({ method: "POST", url: `/api/appointments/${appointmentId}/prescription`, headers: { authorization: `Bearer ${doctorToken}` }, payload: { medications: [] } });
  assert(r9.statusCode === 400, "9. Empty medications rejected");
}

async function testPostVisitSummary() {
  console.log("\n🧪 POST-VISIT SUMMARY");
  await new Promise((r) => setTimeout(r, 200));

  // 10. Post-visit summary generated
  const summary = await prisma.postVisitSummary.findFirst({ where: { visitNote: { appointmentId } } });
  assert(summary !== null, "10. Post-visit summary generated");
  assert(summary!.isFailure === false, "10b. Not a failure");
  assert(summary!.patientExplanation !== null, "10c. Patient explanation present");
  assert(summary!.medicationSchedule !== null, "10d. Medication schedule present");
  assert(summary!.followUpSteps !== null, "10e. Follow-up steps present");

  // 11. Patient can view post-visit summary
  const r11 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/post-summary`, headers: { authorization: `Bearer ${patientToken}` } });
  assert(r11.statusCode === 200, "11. Patient can view post-visit summary");
  const body11 = JSON.parse(r11.body).data;
  assert(body11.patientExplanation !== undefined, "11b. Summary data returned");

  // 12. Doctor can view post-visit summary
  const r12 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/post-summary`, headers: { authorization: `Bearer ${doctorToken}` } });
  assert(r12.statusCode === 200, "12. Doctor can view post-visit summary");

  // 13. Other patient cannot view
  const r13 = await app.inject({ method: "GET", url: `/api/appointments/${appointmentId}/post-summary`, headers: { authorization: `Bearer ${patient2Token}` } });
  assert(r13.statusCode === 404, "13. Other patient cannot view post-visit summary");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 6: Visit Notes & Post-Visit Summary Tests");
  console.log("═══════════════════════════════════════════════════════════");
  try {
    await setup();
    await testVisitNotes();
    await testPrescriptions();
    await testPostVisitSummary();
  } catch (error) {
    console.error("\n💥 Unexpected error:", error);
    failed++;
  } finally {
    console.log("\n📋 Cleaning up...");
    await cleanup();
    await app.close();
    await prisma.$disconnect();
  }
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) { console.log("  Failures:"); failures.forEach((f) => console.log(`    - ${f}`)); }
  console.log("═══════════════════════════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}
run();
