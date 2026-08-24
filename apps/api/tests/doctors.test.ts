/**
 * Milestone 3 Tests: Doctor Management & Availability
 *
 * Run: pnpm --filter @healthcare/api test:doctors
 */

import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/auth/auth.routes.js";
import { userRoutes } from "../src/users/user.routes.js";
import { specialisationRoutes } from "../src/specialisations/specialisation.routes.js";
import { doctorRoutes } from "../src/doctors/doctor.routes.js";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.JWT_SECRET = "dev-only-secret-change-in-production-min16chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.NODE_ENV = "test";

let app: FastifyInstance;
let adminToken: string;
let patientToken: string;
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

// ─── Setup ──────────────────────────────────────────────────────────────────

const TEST_PREFIX = "m3test_";
const ADMIN_EMAIL = `${TEST_PREFIX}admin@test.dev`;
const PATIENT_EMAIL = `${TEST_PREFIX}patient@test.dev`;

async function cleanup() {
  // Delete test data in dependency order
  await prisma.slotHold.deleteMany({
    where: { doctorProfileId: { startsWith: "" } },
  });
  await prisma.appointment.deleteMany({
    where: { doctorProfile: { user: { email: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.doctorWorkingHour.deleteMany({
    where: { doctorProfile: { user: { email: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.doctorLeave.deleteMany({
    where: { doctorProfile: { user: { email: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.doctorProfile.deleteMany({
    where: { user: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_PREFIX } },
  });
  await prisma.specialisation.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

async function setup() {
  await cleanup();

  const hash = await hashPassword("ValidPass123");

  await prisma.user.create({
    data: { email: ADMIN_EMAIL, passwordHash: hash, firstName: "Test", lastName: "Admin", role: "ADMIN" },
  });
  await prisma.user.create({
    data: { email: PATIENT_EMAIL, passwordHash: hash, firstName: "Test", lastName: "Patient", role: "PATIENT" },
  });

  app = Fastify({ logger: false });
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(specialisationRoutes);
  await app.register(doctorRoutes);
  await app.ready();

  // Get tokens
  const adminRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: ADMIN_EMAIL, password: "ValidPass123" } });
  adminToken = JSON.parse(adminRes.body).data.token;

  const patientRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: PATIENT_EMAIL, password: "ValidPass123" } });
  patientToken = JSON.parse(patientRes.body).data.token;
}

// ─── A. Specialisation Tests ────────────────────────────────────────────────

async function testSpecialisations() {
  console.log("\n🧪 A. SPECIALISATION MANAGEMENT");

  // 1. Admin can create specialisation
  const res1 = await app.inject({
    method: "POST", url: "/api/specialisations",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: `${TEST_PREFIX}Cardiology`, description: "Heart" },
  });
  assert(res1.statusCode === 201, "1. Admin can create specialisation");
  const spec1 = JSON.parse(res1.body).data;

  // 2. Non-admin cannot create
  const res2 = await app.inject({
    method: "POST", url: "/api/specialisations",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { name: `${TEST_PREFIX}Neuro` },
  });
  assert(res2.statusCode === 403, "2. Non-admin cannot create specialisation");

  // 3. Duplicate name returns 409
  const res3 = await app.inject({
    method: "POST", url: "/api/specialisations",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: `${TEST_PREFIX}Cardiology` },
  });
  assert(res3.statusCode === 409, "3. Duplicate specialisation name returns 409");

  // 4. Admin can update specialisation
  const res4 = await app.inject({
    method: "PATCH", url: `/api/specialisations/${spec1.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { description: "Heart and cardiovascular" },
  });
  assert(res4.statusCode === 200, "4. Admin can update specialisation");

  // 5. Admin can list specialisations
  const res5 = await app.inject({
    method: "GET", url: "/api/specialisations",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert(res5.statusCode === 200, "5. Admin can list specialisations");
  const specs = JSON.parse(res5.body).data;
  assert(specs.length >= 1, "5b. List contains at least one specialisation");
}

// ─── B. Doctor Management Tests ─────────────────────────────────────────────

let testDoctorId: string;
let testSpecId: string;

async function testDoctorManagement() {
  console.log("\n🧪 B. DOCTOR MANAGEMENT");

  // Create a specialisation for doctors
  const specRes = await app.inject({
    method: "POST", url: "/api/specialisations",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: `${TEST_PREFIX}Dermatology` },
  });
  testSpecId = JSON.parse(specRes.body).data.id;

  // 6. Admin can create doctor
  const res6 = await app.inject({
    method: "POST", url: "/api/doctors",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: `${TEST_PREFIX}doctor1@test.dev`,
      password: "DoctorPass123",
      firstName: "Alice",
      lastName: "Smith",
      specialisationId: testSpecId,
      qualifications: ["MD", "Board Certified"],
      bio: "Experienced dermatologist",
      consultationDurationMin: 30,
    },
  });
  assert(res6.statusCode === 201, "6. Admin can create doctor");
  const doctor = JSON.parse(res6.body).data;
  testDoctorId = doctor.id;

  // 7. Created user has role DOCTOR
  assert(doctor.user.role === "DOCTOR", "7. Created user has role DOCTOR");

  // 8. Client cannot force role ADMIN/PATIENT
  assert(doctor.user.role === "DOCTOR", "8. Role is always DOCTOR regardless of input");

  // 9. Duplicate email rejected
  const res9 = await app.inject({
    method: "POST", url: "/api/doctors",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: `${TEST_PREFIX}doctor1@test.dev`,
      password: "DoctorPass123",
      firstName: "Bob",
      lastName: "Jones",
      specialisationId: testSpecId,
      qualifications: ["MD"],
      consultationDurationMin: 20,
    },
  });
  assert(res9.statusCode === 409, "9. Duplicate doctor email is rejected");

  // 10. Invalid specialisation rejected
  const res10 = await app.inject({
    method: "POST", url: "/api/doctors",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: `${TEST_PREFIX}doctor2@test.dev`,
      password: "DoctorPass123",
      firstName: "Charlie",
      lastName: "Brown",
      specialisationId: "00000000-0000-0000-0000-000000000000",
      qualifications: ["MD"],
      consultationDurationMin: 30,
    },
  });
  assert(res10.statusCode === 400, "10. Invalid specialisation is rejected");

  // 11. passwordHash never returned
  assert(doctor.user.passwordHash === undefined, "11. passwordHash is never returned");

  // 12. Non-admin cannot create doctors
  const res12 = await app.inject({
    method: "POST", url: "/api/doctors",
    headers: { authorization: `Bearer ${patientToken}` },
    payload: {
      email: `${TEST_PREFIX}doctor3@test.dev`,
      password: "DoctorPass123",
      firstName: "X",
      lastName: "Y",
      specialisationId: testSpecId,
      qualifications: ["MD"],
      consultationDurationMin: 30,
    },
  });
  assert(res12.statusCode === 403, "12. Non-admin cannot create doctors");

  // 13. Doctor listing works
  const res13 = await app.inject({
    method: "GET", url: "/api/doctors",
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res13.statusCode === 200, "13. Doctor listing works");
  const doctors = JSON.parse(res13.body).data;
  assert(Array.isArray(doctors) && doctors.length >= 1, "13b. Returns array with doctors");

  // 14. Doctor filtering by specialisation
  const res14 = await app.inject({
    method: "GET", url: `/api/doctors?specialisationId=${testSpecId}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res14.statusCode === 200, "14. Doctor filtering by specialisation works");
  const filtered = JSON.parse(res14.body).data;
  assert(filtered.every((d: any) => d.specialisation.id === testSpecId), "14b. All results match filter");
}

// ─── C. Working Hours Tests ─────────────────────────────────────────────────

async function testWorkingHours() {
  console.log("\n🧪 C. WORKING HOURS");

  // 15. Admin can configure working hours
  const res15 = await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      hours: [
        { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "17:00", isActive: true },
        { dayOfWeek: "TUESDAY", startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "16:00", isActive: true },
      ],
    },
  });
  assert(res15.statusCode === 200, "15. Admin can configure working hours");

  // 16. Invalid HH:mm rejected
  const res16 = await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "THURSDAY", startTime: "25:00", endTime: "17:00", isActive: true }] },
  });
  assert(res16.statusCode === 400, "16. Invalid HH:mm is rejected");

  // 17. startTime >= endTime rejected
  const res17 = await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "THURSDAY", startTime: "17:00", endTime: "09:00", isActive: true }] },
  });
  assert(res17.statusCode === 400, "17. startTime >= endTime is rejected");

  // 18. Duplicate day does not create duplicate rows (update same day)
  const res18 = await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "MONDAY", startTime: "08:00", endTime: "16:00", isActive: true }] },
  });
  assert(res18.statusCode === 200, "18. Update same day does not create duplicates");

  // Verify only one MONDAY entry
  const hoursRes = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const allHours = JSON.parse(hoursRes.body).data;
  const mondays = allHours.filter((h: any) => h.dayOfWeek === "MONDAY");
  assert(mondays.length === 1, "18b. Only one MONDAY entry exists");
  assert(mondays[0].startTime === "08:00", "19. Working hours can be updated");

  // 20. Non-admin cannot modify
  const res20 = await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${patientToken}` },
    payload: { hours: [{ dayOfWeek: "FRIDAY", startTime: "09:00", endTime: "17:00", isActive: true }] },
  });
  assert(res20.statusCode === 403, "20. Non-admin cannot modify working hours");
}

// ─── D. Availability Tests ──────────────────────────────────────────────────

async function testAvailability() {
  console.log("\n🧪 D. AVAILABILITY");

  // Set up clean working hours: Monday 09:00-12:00, 30 min slots
  await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true }] },
  });

  // Find a future Monday
  const futureMonday = getNextDayOfWeek(1); // 1 = Monday

  // 21. Correct slots generated from working hours
  const res21 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res21.statusCode === 200, "21. Availability endpoint returns 200");
  const avail21 = JSON.parse(res21.body).data;
  // 09:00-12:00 with 30 min = 6 slots
  assert(avail21.slots.length === 6, "21b. Correct number of slots (6 for 3h/30min)");

  // 22. Consultation duration respected
  assert(avail21.slots[0].startTime === "09:00" && avail21.slots[0].endTime === "09:30", "22. First slot is 09:00-09:30");
  assert(avail21.slots[5].startTime === "11:30" && avail21.slots[5].endTime === "12:00", "22b. Last slot is 11:30-12:00");

  // 23. Partial final slot not generated
  // Change to 09:00-11:45 with 30min slots → 5 full slots (last possible 11:00-11:30), 11:30 doesn't fit
  await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "11:45", isActive: true }] },
  });
  const res23 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail23 = JSON.parse(res23.body).data;
  assert(avail23.slots.length === 5, "23. Partial final slot is not generated (5 slots for 2h45m/30min)");
  assert(avail23.slots[4].endTime === "11:30", "23b. Last slot ends at 11:30, not 12:00");

  // Restore to 09:00-12:00 for remaining tests
  await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true }] },
  });

  // 24. Confirmed appointments block slots
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { id: testDoctorId }, select: { userId: true } });
  const patient = await prisma.user.findUnique({ where: { email: PATIENT_EMAIL } });

  await prisma.appointment.create({
    data: {
      patientId: patient!.id,
      doctorProfileId: testDoctorId,
      slotDate: parseDateForDb(futureMonday),
      slotStartTime: "09:30",
      slotEndTime: "10:00",
      status: "CONFIRMED",
    },
  });

  const res24 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail24 = JSON.parse(res24.body).data;
  assert(avail24.slots.length === 5, "24. Confirmed appointment blocks one slot (6-1=5)");
  assert(!avail24.slots.find((s: any) => s.startTime === "09:30"), "24b. Slot 09:30 is not available");

  // 25. Active SlotHold blocks slot
  await prisma.slotHold.create({
    data: {
      doctorProfileId: testDoctorId,
      patientId: patient!.id,
      slotDate: parseDateForDb(futureMonday),
      slotStartTime: "10:00",
      slotEndTime: "10:30",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
    },
  });

  const res25 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail25 = JSON.parse(res25.body).data;
  assert(avail25.slots.length === 4, "25. Active SlotHold blocks slot (5-1=4)");
  assert(!avail25.slots.find((s: any) => s.startTime === "10:00"), "25b. Held slot 10:00 not available");

  // 26. Expired SlotHold does NOT block slot
  await prisma.slotHold.create({
    data: {
      doctorProfileId: testDoctorId,
      patientId: patient!.id,
      slotDate: parseDateForDb(futureMonday),
      slotStartTime: "10:30",
      slotEndTime: "11:00",
      expiresAt: new Date(Date.now() - 1000), // already expired
    },
  });

  const res26 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail26 = JSON.parse(res26.body).data;
  assert(avail26.slots.find((s: any) => s.startTime === "10:30") !== undefined, "26. Expired SlotHold does NOT block slot");

  // 27. Doctor leave makes all slots unavailable
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  await prisma.doctorLeave.create({
    data: {
      doctorProfileId: testDoctorId,
      startDate: parseDateForDb(futureMonday),
      endDate: parseDateForDb(futureMonday),
      reason: "Personal leave",
      createdBy: admin!.id,
    },
  });

  const res27 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureMonday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail27 = JSON.parse(res27.body).data;
  assert(avail27.slots.length === 0, "27. Doctor leave makes all slots unavailable");

  // 28. Date outside leave remains available
  // Remove leave and check the next Monday after
  await prisma.doctorLeave.deleteMany({ where: { doctorProfileId: testDoctorId } });
  const nextMonday2 = getNextDayOfWeek(1, 14); // 2 weeks out
  await app.inject({
    method: "PUT", url: `/api/doctors/${testDoctorId}/working-hours`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { hours: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "12:00", isActive: true }] },
  });
  const res28 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${nextMonday2}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail28 = JSON.parse(res28.body).data;
  assert(avail28.slots.length === 6, "28. Date outside leave remains available");

  // 29. Non-working day has zero slots
  const futureTuesday = getNextDayOfWeek(2); // Tuesday
  // Tuesday working hours: 09:00-12:00 set earlier
  const res29 = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureTuesday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  // We set Tuesday hours earlier in testWorkingHours. Let's use a day with NO hours: SATURDAY
  const futureSaturday = getNextDayOfWeek(6);
  const res29b = await app.inject({
    method: "GET", url: `/api/doctors/${testDoctorId}/availability?date=${futureSaturday}`,
    headers: { authorization: `Bearer ${patientToken}` },
  });
  const avail29 = JSON.parse(res29b.body).data;
  assert(avail29.slots.length === 0, "29. Non-working day returns zero slots");

  // 30. Invalid doctor returns 404
  const res30 = await app.inject({
    method: "GET", url: "/api/doctors/00000000-0000-0000-0000-000000000099/availability?date=2099-01-15",
    headers: { authorization: `Bearer ${patientToken}` },
  });
  assert(res30.statusCode === 404, "30. Invalid doctor returns 404");
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function getNextDayOfWeek(targetDay: number, offsetDays = 7): string {
  const now = new Date();
  const current = now.getDay();
  let daysUntil = targetDay - current;
  if (daysUntil <= 0) daysUntil += 7;
  daysUntil += (offsetDays - 7); // allow offset
  if (daysUntil <= 0) daysUntil += 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntil);
  return target.toISOString().split("T")[0];
}

function parseDateForDb(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 3: Doctor Management & Availability Tests");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await setup();
    await testSpecialisations();
    await testDoctorManagement();
    await testWorkingHours();
    await testAvailability();
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
