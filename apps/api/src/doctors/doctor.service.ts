import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import type { CreateDoctorInput, UpdateDoctorInput } from "./doctor.schemas.js";

const DOCTOR_SELECT = {
  id: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  },
  specialisation: true,
  qualifications: true,
  bio: true,
  consultationDurationMin: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createDoctor(input: CreateDoctorInput) {
  const email = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        role: "DOCTOR",
      },
    });

    const profile = await tx.doctorProfile.create({
      data: {
        userId: user.id,
        specialisationId: input.specialisationId,
        qualifications: input.qualifications,
        bio: input.bio?.trim() || null,
        consultationDurationMin: input.consultationDurationMin,
      },
      select: DOCTOR_SELECT,
    });

    return profile;
  });
}

export async function listDoctors(filters?: { specialisationId?: string; isActive?: boolean }) {
  const where: any = {};

  if (filters?.specialisationId) {
    where.specialisationId = filters.specialisationId;
  }

  if (filters?.isActive !== undefined) {
    where.user = { isActive: filters.isActive };
  }

  return prisma.doctorProfile.findMany({
    where,
    select: DOCTOR_SELECT,
    orderBy: { user: { lastName: "asc" } },
  });
}

export async function getDoctorById(doctorProfileId: string) {
  return prisma.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: DOCTOR_SELECT,
  });
}

export async function updateDoctor(doctorProfileId: string, input: UpdateDoctorInput) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: { userId: true },
  });

  if (!profile) return null;

  return prisma.$transaction(async (tx) => {
    // Update user fields if provided
    const userUpdate: any = {};
    if (input.firstName !== undefined) userUpdate.firstName = input.firstName.trim();
    if (input.lastName !== undefined) userUpdate.lastName = input.lastName.trim();
    if (input.phone !== undefined) userUpdate.phone = input.phone?.trim() || null;
    if (input.isActive !== undefined) userUpdate.isActive = input.isActive;

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: profile.userId },
        data: userUpdate,
      });
    }

    // Update profile fields if provided
    const profileUpdate: any = {};
    if (input.specialisationId !== undefined) profileUpdate.specialisationId = input.specialisationId;
    if (input.qualifications !== undefined) profileUpdate.qualifications = input.qualifications;
    if (input.bio !== undefined) profileUpdate.bio = input.bio?.trim() || null;
    if (input.consultationDurationMin !== undefined) profileUpdate.consultationDurationMin = input.consultationDurationMin;

    if (Object.keys(profileUpdate).length > 0) {
      await tx.doctorProfile.update({
        where: { id: doctorProfileId },
        data: profileUpdate,
      });
    }

    return tx.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      select: DOCTOR_SELECT,
    });
  });
}

export async function getDoctorWorkingHours(doctorProfileId: string) {
  return prisma.doctorWorkingHour.findMany({
    where: { doctorProfileId },
    orderBy: { dayOfWeek: "asc" },
  });
}

export async function setDoctorWorkingHours(
  doctorProfileId: string,
  hours: Array<{ dayOfWeek: string; startTime: string; endTime: string; isActive: boolean }>
) {
  // Upsert each entry to avoid duplicates on the unique(doctorProfileId, dayOfWeek) constraint
  return prisma.$transaction(
    hours.map((h) =>
      prisma.doctorWorkingHour.upsert({
        where: {
          doctorProfileId_dayOfWeek: {
            doctorProfileId,
            dayOfWeek: h.dayOfWeek as any,
          },
        },
        update: {
          startTime: h.startTime,
          endTime: h.endTime,
          isActive: h.isActive,
        },
        create: {
          doctorProfileId,
          dayOfWeek: h.dayOfWeek as any,
          startTime: h.startTime,
          endTime: h.endTime,
          isActive: h.isActive,
        },
      })
    )
  );
}
