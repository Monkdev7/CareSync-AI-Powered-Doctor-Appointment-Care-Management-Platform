import { PrismaClient, Role, DayOfWeek } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Deterministic UUIDs for repeatable seeding
const IDS = {
  admin1: "a0000000-0000-0000-0000-000000000001",
  doctor1: "d0000000-0000-0000-0000-000000000001",
  doctor2: "d0000000-0000-0000-0000-000000000002",
  patient1: "p0000000-0000-0000-0000-000000000001",
  patient2: "p0000000-0000-0000-0000-000000000002",
  patient3: "p0000000-0000-0000-0000-000000000003",
  specCardiology: "s0000000-0000-0000-0000-000000000001",
  specDermatology: "s0000000-0000-0000-0000-000000000002",
  specGeneral: "s0000000-0000-0000-0000-000000000003",
  profile1: "dp000000-0000-0000-0000-000000000001",
  profile2: "dp000000-0000-0000-0000-000000000002",
};

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Specialisations ──────────────────────────────────────────────────────
  await prisma.specialisation.upsert({ where: { id: IDS.specCardiology }, update: {}, create: { id: IDS.specCardiology, name: "Cardiology", description: "Heart and cardiovascular system" } });
  await prisma.specialisation.upsert({ where: { id: IDS.specDermatology }, update: {}, create: { id: IDS.specDermatology, name: "Dermatology", description: "Skin, hair, and nails" } });
  await prisma.specialisation.upsert({ where: { id: IDS.specGeneral }, update: {}, create: { id: IDS.specGeneral, name: "General Practice", description: "Primary care and general medicine" } });

  // ─── Demo Credentials ─────────────────────────────────────────────────────
  // These are development/demo passwords only. Never use in production.
  const adminHash = await hash("Admin123!");
  const doctorHash = await hash("Doctor123!");
  const patientHash = await hash("Patient123!");

  // ─── Admin ────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: IDS.admin1 },
    update: { passwordHash: adminHash },
    create: { id: IDS.admin1, email: "admin@healthcare.dev", passwordHash: adminHash, firstName: "System", lastName: "Admin", role: Role.ADMIN, phone: "+1-555-000-0001" },
  });

  // ─── Doctors ──────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: IDS.doctor1 },
    update: { passwordHash: doctorHash },
    create: { id: IDS.doctor1, email: "dr.smith@healthcare.dev", passwordHash: doctorHash, firstName: "Sarah", lastName: "Smith", role: Role.DOCTOR, phone: "+1-555-000-0010" },
  });
  await prisma.user.upsert({
    where: { id: IDS.doctor2 },
    update: { passwordHash: doctorHash },
    create: { id: IDS.doctor2, email: "dr.jones@healthcare.dev", passwordHash: doctorHash, firstName: "Michael", lastName: "Jones", role: Role.DOCTOR, phone: "+1-555-000-0020" },
  });

  // ─── Patients ─────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: IDS.patient1 },
    update: { passwordHash: patientHash },
    create: { id: IDS.patient1, email: "alice.patient@example.com", passwordHash: patientHash, firstName: "Alice", lastName: "Johnson", role: Role.PATIENT, phone: "+1-555-000-0100" },
  });
  await prisma.user.upsert({
    where: { id: IDS.patient2 },
    update: { passwordHash: patientHash },
    create: { id: IDS.patient2, email: "bob.patient@example.com", passwordHash: patientHash, firstName: "Bob", lastName: "Williams", role: Role.PATIENT, phone: "+1-555-000-0200" },
  });
  await prisma.user.upsert({
    where: { id: IDS.patient3 },
    update: { passwordHash: patientHash },
    create: { id: IDS.patient3, email: "carol.patient@example.com", passwordHash: patientHash, firstName: "Carol", lastName: "Davis", role: Role.PATIENT },
  });

  // ─── Doctor Profiles ──────────────────────────────────────────────────────
  await prisma.doctorProfile.upsert({
    where: { id: IDS.profile1 },
    update: {},
    create: { id: IDS.profile1, userId: IDS.doctor1, specialisationId: IDS.specCardiology, qualifications: ["MD", "FACC", "Board Certified Cardiologist"], bio: "Dr. Smith specializes in preventive cardiology with 15 years of experience.", consultationDurationMin: 30 },
  });
  await prisma.doctorProfile.upsert({
    where: { id: IDS.profile2 },
    update: {},
    create: { id: IDS.profile2, userId: IDS.doctor2, specialisationId: IDS.specDermatology, qualifications: ["MD", "Board Certified Dermatologist"], bio: "Dr. Jones focuses on medical dermatology and skin cancer screening.", consultationDurationMin: 20 },
  });

  // ─── Working Hours ────────────────────────────────────────────────────────
  const doctor1Days = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
  for (const day of doctor1Days) {
    await prisma.doctorWorkingHour.upsert({
      where: { doctorProfileId_dayOfWeek: { doctorProfileId: IDS.profile1, dayOfWeek: day } },
      update: {},
      create: { doctorProfileId: IDS.profile1, dayOfWeek: day, startTime: "09:00", endTime: "17:00", isActive: true },
    });
  }
  const doctor2Days = [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY];
  for (const day of doctor2Days) {
    await prisma.doctorWorkingHour.upsert({
      where: { doctorProfileId_dayOfWeek: { doctorProfileId: IDS.profile2, dayOfWeek: day } },
      update: {},
      create: { doctorProfileId: IDS.profile2, dayOfWeek: day, startTime: "10:00", endTime: "16:00", isActive: true },
    });
  }

  console.log("✅ Seed completed");
  console.log("   Demo accounts:");
  console.log("   ADMIN:   admin@healthcare.dev / Admin123!");
  console.log("   DOCTOR:  dr.smith@healthcare.dev / Doctor123!");
  console.log("   DOCTOR:  dr.jones@healthcare.dev / Doctor123!");
  console.log("   PATIENT: alice.patient@example.com / Patient123!");
  console.log("   PATIENT: bob.patient@example.com / Patient123!");
  console.log("   PATIENT: carol.patient@example.com / Patient123!");
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error("❌ Seed failed:", e); await prisma.$disconnect(); process.exit(1); });
