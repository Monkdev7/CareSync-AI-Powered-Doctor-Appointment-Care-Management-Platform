/**
 * Database Constraint Verification Tests
 *
 * These tests verify the critical database-level guarantees:
 * 1. Partial unique index prevents double-booking of CONFIRMED appointments
 * 2. CANCELLED appointments do not block the same slot
 * 3. SlotHold unique constraint prevents duplicate holds
 *
 * Prerequisites:
 *   - PostgreSQL running with DATABASE_URL configured
 *   - Migrations applied (pnpm db:migrate)
 *
 * Run: pnpm --filter @healthcare/api db:test
 */

import { PrismaClient, AppointmentStatus, Role } from "@prisma/client";

const prisma = new PrismaClient();

// Test data IDs
const TEST_DOCTOR_ID = "test0000-0000-0000-0000-doctor000001";
const TEST_PATIENT1_ID = "test0000-0000-0000-0000-patient00001";
const TEST_PATIENT2_ID = "test0000-0000-0000-0000-patient00002";
const TEST_SPEC_ID = "test0000-0000-0000-0000-spec00000001";
const TEST_PROFILE_ID = "test0000-0000-0000-0000-profile00001";

const TEST_SLOT_DATE = new Date("2099-01-15"); // Far future to avoid conflicts
const TEST_SLOT_TIME = "10:00";
const TEST_SLOT_END = "10:30";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function setup() {
  console.log("\n📋 Setting up test data...");

  // Clean up any previous test data
  await cleanup();

  // Create test specialisation
  await prisma.specialisation.create({
    data: { id: TEST_SPEC_ID, name: "Test Specialisation" },
  });

  // Create test users
  const fakeHash = "$2b$12$000000000000000000000000000000000000000000000000000000";
  await prisma.user.create({
    data: {
      id: TEST_DOCTOR_ID,
      email: "test.doctor@test.dev",
      passwordHash: fakeHash,
      firstName: "Test",
      lastName: "Doctor",
      role: Role.DOCTOR,
    },
  });

  await prisma.user.create({
    data: {
      id: TEST_PATIENT1_ID,
      email: "test.patient1@test.dev",
      passwordHash: fakeHash,
      firstName: "Test",
      lastName: "Patient1",
      role: Role.PATIENT,
    },
  });

  await prisma.user.create({
    data: {
      id: TEST_PATIENT2_ID,
      email: "test.patient2@test.dev",
      passwordHash: fakeHash,
      firstName: "Test",
      lastName: "Patient2",
      role: Role.PATIENT,
    },
  });

  // Create doctor profile
  await prisma.doctorProfile.create({
    data: {
      id: TEST_PROFILE_ID,
      userId: TEST_DOCTOR_ID,
      specialisationId: TEST_SPEC_ID,
      qualifications: ["MD"],
      consultationDurationMin: 30,
    },
  });

  console.log("   Test data created.\n");
}

async function cleanup() {
  // Delete in reverse dependency order
  await prisma.calendarEvent.deleteMany({
    where: { appointment: { doctorProfileId: TEST_PROFILE_ID } },
  });
  await prisma.postVisitSummary.deleteMany({
    where: { visitNote: { appointment: { doctorProfileId: TEST_PROFILE_ID } } },
  });
  await prisma.prescription.deleteMany({
    where: { visitNote: { appointment: { doctorProfileId: TEST_PROFILE_ID } } },
  });
  await prisma.visitNote.deleteMany({
    where: { appointment: { doctorProfileId: TEST_PROFILE_ID } },
  });
  await prisma.preVisitSummary.deleteMany({
    where: { appointment: { doctorProfileId: TEST_PROFILE_ID } },
  });
  await prisma.symptomSubmission.deleteMany({
    where: { appointment: { doctorProfileId: TEST_PROFILE_ID } },
  });
  await prisma.appointment.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID },
  });
  await prisma.slotHold.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID },
  });
  await prisma.doctorWorkingHour.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID },
  });
  await prisma.doctorLeave.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID },
  });
  await prisma.doctorProfile.deleteMany({
    where: { id: TEST_PROFILE_ID },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [TEST_DOCTOR_ID, TEST_PATIENT1_ID, TEST_PATIENT2_ID] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [TEST_DOCTOR_ID, TEST_PATIENT1_ID, TEST_PATIENT2_ID] } },
  });
  await prisma.specialisation.deleteMany({
    where: { id: TEST_SPEC_ID },
  });
}

// ─── TEST A: Double-booking prevention ─────────────────────────────────────────

async function testA_rejectDuplicateConfirmed() {
  console.log("🧪 Test A: Reject duplicate CONFIRMED appointment for same slot");

  // Create first CONFIRMED appointment
  await prisma.appointment.create({
    data: {
      patientId: TEST_PATIENT1_ID,
      doctorProfileId: TEST_PROFILE_ID,
      slotDate: TEST_SLOT_DATE,
      slotStartTime: TEST_SLOT_TIME,
      slotEndTime: TEST_SLOT_END,
      status: AppointmentStatus.CONFIRMED,
    },
  });

  // Attempt second CONFIRMED appointment for same doctor/date/time
  try {
    await prisma.appointment.create({
      data: {
        patientId: TEST_PATIENT2_ID,
        doctorProfileId: TEST_PROFILE_ID,
        slotDate: TEST_SLOT_DATE,
        slotStartTime: TEST_SLOT_TIME,
        slotEndTime: TEST_SLOT_END,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    assert(false, "Second CONFIRMED appointment should have been rejected");
  } catch (error: any) {
    // Prisma wraps unique constraint violations as P2002
    const isUniqueViolation = error.code === "P2002";
    assert(
      isUniqueViolation,
      "Database rejected duplicate CONFIRMED appointment (P2002 unique violation)"
    );
  }

  // Clean up
  await prisma.appointment.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID, slotDate: TEST_SLOT_DATE },
  });
}

// ─── TEST B: Cancelled slot can be reused ──────────────────────────────────────

async function testB_cancelledSlotReusable() {
  console.log(
    "\n🧪 Test B: CANCELLED appointment does not block same slot for new CONFIRMED"
  );

  // Create a CANCELLED appointment
  await prisma.appointment.create({
    data: {
      patientId: TEST_PATIENT1_ID,
      doctorProfileId: TEST_PROFILE_ID,
      slotDate: TEST_SLOT_DATE,
      slotStartTime: TEST_SLOT_TIME,
      slotEndTime: TEST_SLOT_END,
      status: AppointmentStatus.CANCELLED,
      cancellationReason: "Patient requested cancellation",
    },
  });

  // Create a new CONFIRMED appointment for the same slot
  try {
    const newAppt = await prisma.appointment.create({
      data: {
        patientId: TEST_PATIENT2_ID,
        doctorProfileId: TEST_PROFILE_ID,
        slotDate: TEST_SLOT_DATE,
        slotStartTime: TEST_SLOT_TIME,
        slotEndTime: TEST_SLOT_END,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    assert(
      newAppt.status === AppointmentStatus.CONFIRMED,
      "New CONFIRMED appointment created successfully on a previously cancelled slot"
    );
  } catch (error: any) {
    assert(false, `Should have allowed booking cancelled slot, got error: ${error.message}`);
  }

  // Clean up
  await prisma.appointment.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID, slotDate: TEST_SLOT_DATE },
  });
}

// ─── TEST C: SlotHold unique constraint ────────────────────────────────────────

async function testC_slotHoldUniqueConstraint() {
  console.log("\n🧪 Test C: SlotHold unique constraint prevents duplicate holds");

  // Create first hold
  await prisma.slotHold.create({
    data: {
      doctorProfileId: TEST_PROFILE_ID,
      patientId: TEST_PATIENT1_ID,
      slotDate: TEST_SLOT_DATE,
      slotStartTime: TEST_SLOT_TIME,
      slotEndTime: TEST_SLOT_END,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
    },
  });

  // Attempt duplicate hold for same doctor/date/time
  try {
    await prisma.slotHold.create({
      data: {
        doctorProfileId: TEST_PROFILE_ID,
        patientId: TEST_PATIENT2_ID,
        slotDate: TEST_SLOT_DATE,
        slotStartTime: TEST_SLOT_TIME,
        slotEndTime: TEST_SLOT_END,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    assert(false, "Second hold for same slot should have been rejected");
  } catch (error: any) {
    const isUniqueViolation = error.code === "P2002";
    assert(
      isUniqueViolation,
      "Database rejected duplicate SlotHold (P2002 unique violation)"
    );
  }

  // Clean up
  await prisma.slotHold.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID },
  });
}

// ─── TEST D: Multiple statuses for same slot allowed ───────────────────────────

async function testD_multipleNonConfirmedAllowed() {
  console.log(
    "\n🧪 Test D: Multiple non-CONFIRMED statuses allowed for same slot"
  );

  // Create a CANCELLED appointment
  await prisma.appointment.create({
    data: {
      patientId: TEST_PATIENT1_ID,
      doctorProfileId: TEST_PROFILE_ID,
      slotDate: TEST_SLOT_DATE,
      slotStartTime: TEST_SLOT_TIME,
      slotEndTime: TEST_SLOT_END,
      status: AppointmentStatus.CANCELLED,
    },
  });

  // Create another CANCELLED appointment for same slot (different patient)
  try {
    await prisma.appointment.create({
      data: {
        patientId: TEST_PATIENT2_ID,
        doctorProfileId: TEST_PROFILE_ID,
        slotDate: TEST_SLOT_DATE,
        slotStartTime: TEST_SLOT_TIME,
        slotEndTime: TEST_SLOT_END,
        status: AppointmentStatus.CANCELLED,
      },
    });
    assert(
      true,
      "Multiple CANCELLED appointments allowed for same slot (partial index only covers CONFIRMED)"
    );
  } catch (error: any) {
    assert(false, `Multiple CANCELLED should be allowed, got: ${error.message}`);
  }

  // Clean up
  await prisma.appointment.deleteMany({
    where: { doctorProfileId: TEST_PROFILE_ID, slotDate: TEST_SLOT_DATE },
  });
}

// ─── RUNNER ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Database Constraint Verification Tests");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await setup();
    await testA_rejectDuplicateConfirmed();
    await testB_cancelledSlotReusable();
    await testC_slotHoldUniqueConstraint();
    await testD_multipleNonConfirmedAllowed();
  } catch (error) {
    console.error("\n💥 Unexpected error during tests:", error);
    failed++;
  } finally {
    console.log("\n📋 Cleaning up test data...");
    await cleanup();
    await prisma.$disconnect();
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run();
