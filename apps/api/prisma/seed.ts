import { PrismaClient, Role, DayOfWeek, MedicationFrequency } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministic UUIDs for repeatable seeding
const IDS = {
  // Users
  admin1: "a0000000-0000-0000-0000-000000000001",
  doctor1: "d0000000-0000-0000-0000-000000000001",
  doctor2: "d0000000-0000-0000-0000-000000000002",
  patient1: "p0000000-0000-0000-0000-000000000001",
  patient2: "p0000000-0000-0000-0000-000000000002",
  patient3: "p0000000-0000-0000-0000-000000000003",
  // Specialisations
  specCardiology: "s0000000-0000-0000-0000-000000000001",
  specDermatology: "s0000000-0000-0000-0000-000000000002",
  specGeneral: "s0000000-0000-0000-0000-000000000003",
  // Doctor profiles
  profile1: "dp000000-0000-0000-0000-000000000001",
  profile2: "dp000000-0000-0000-0000-000000000002",
};

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Specialisations ────────────────────────────────────────────────────────
  await prisma.specialisation.upsert({
    where: { id: IDS.specCardiology },
    update: {},
    create: {
      id: IDS.specCardiology,
      name: "Cardiology",
      description: "Heart and cardiovascular system",
    },
  });

  await prisma.specialisation.upsert({
    where: { id: IDS.specDermatology },
    update: {},
    create: {
      id: IDS.specDermatology,
      name: "Dermatology",
      description: "Skin, hair, and nails",
    },
  });

  await prisma.specialisation.upsert({
    where: { id: IDS.specGeneral },
    update: {},
    create: {
      id: IDS.specGeneral,
      name: "General Practice",
      description: "Primary care and general medicine",
    },
  });

  // ─── Admin User ─────────────────────────────────────────────────────────────
  // Password: "admin123" (hashed with bcrypt, 12 rounds)
  // In a real scenario this would be generated; using a pre-computed hash for seed
  const fakePasswordHash =
    "$2b$12$LJ0vGhiMmMq4c7/ZNLOoOeHf4fXQ.d.BNQR6B7VWmFYx9aKf2h7Li";

  await prisma.user.upsert({
    where: { id: IDS.admin1 },
    update: {},
    create: {
      id: IDS.admin1,
      email: "admin@healthcare.dev",
      passwordHash: fakePasswordHash,
      firstName: "System",
      lastName: "Admin",
      role: Role.ADMIN,
      phone: "+1-555-000-0001",
    },
  });

  // ─── Doctor Users ───────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: IDS.doctor1 },
    update: {},
    create: {
      id: IDS.doctor1,
      email: "dr.smith@healthcare.dev",
      passwordHash: fakePasswordHash,
      firstName: "Sarah",
      lastName: "Smith",
      role: Role.DOCTOR,
      phone: "+1-555-000-0010",
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.doctor2 },
    update: {},
    create: {
      id: IDS.doctor2,
      email: "dr.jones@healthcare.dev",
      passwordHash: fakePasswordHash,
      firstName: "Michael",
      lastName: "Jones",
      role: Role.DOCTOR,
      phone: "+1-555-000-0020",
    },
  });

  // ─── Patient Users ──────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: IDS.patient1 },
    update: {},
    create: {
      id: IDS.patient1,
      email: "alice.patient@example.com",
      passwordHash: fakePasswordHash,
      firstName: "Alice",
      lastName: "Johnson",
      role: Role.PATIENT,
      phone: "+1-555-000-0100",
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.patient2 },
    update: {},
    create: {
      id: IDS.patient2,
      email: "bob.patient@example.com",
      passwordHash: fakePasswordHash,
      firstName: "Bob",
      lastName: "Williams",
      role: Role.PATIENT,
      phone: "+1-555-000-0200",
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.patient3 },
    update: {},
    create: {
      id: IDS.patient3,
      email: "carol.patient@example.com",
      passwordHash: fakePasswordHash,
      firstName: "Carol",
      lastName: "Davis",
      role: Role.PATIENT,
    },
  });

  // ─── Doctor Profiles ────────────────────────────────────────────────────────
  await prisma.doctorProfile.upsert({
    where: { id: IDS.profile1 },
    update: {},
    create: {
      id: IDS.profile1,
      userId: IDS.doctor1,
      specialisationId: IDS.specCardiology,
      qualifications: ["MD", "FACC", "Board Certified Cardiologist"],
      bio: "Dr. Smith specializes in preventive cardiology and heart failure management with 15 years of experience.",
      consultationDurationMin: 30,
    },
  });

  await prisma.doctorProfile.upsert({
    where: { id: IDS.profile2 },
    update: {},
    create: {
      id: IDS.profile2,
      userId: IDS.doctor2,
      specialisationId: IDS.specDermatology,
      qualifications: ["MD", "Board Certified Dermatologist"],
      bio: "Dr. Jones focuses on medical dermatology and skin cancer screening.",
      consultationDurationMin: 20,
    },
  });

  // ─── Working Hours ──────────────────────────────────────────────────────────
  const doctor1WorkDays = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
  ];

  for (const day of doctor1WorkDays) {
    await prisma.doctorWorkingHour.upsert({
      where: {
        doctorProfileId_dayOfWeek: {
          doctorProfileId: IDS.profile1,
          dayOfWeek: day,
        },
      },
      update: {},
      create: {
        doctorProfileId: IDS.profile1,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "17:00",
        isActive: true,
      },
    });
  }

  const doctor2WorkDays = [
    DayOfWeek.MONDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.FRIDAY,
  ];

  for (const day of doctor2WorkDays) {
    await prisma.doctorWorkingHour.upsert({
      where: {
        doctorProfileId_dayOfWeek: {
          doctorProfileId: IDS.profile2,
          dayOfWeek: day,
        },
      },
      update: {},
      create: {
        doctorProfileId: IDS.profile2,
        dayOfWeek: day,
        startTime: "10:00",
        endTime: "16:00",
        isActive: true,
      },
    });
  }

  console.log("✅ Seed completed successfully");
  console.log("   - 1 admin user");
  console.log("   - 2 doctors with profiles and working hours");
  console.log("   - 3 patients");
  console.log("   - 3 specialisations");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
