-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'CANCELLATION', 'DOCTOR_LEAVE', 'MEDICATION_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "MedicationFrequency" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'EVERY_8_HOURS', 'EVERY_12_HOURS');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Specialisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialisationId" TEXT NOT NULL,
    "qualifications" TEXT[],
    "bio" TEXT,
    "consultationDurationMin" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorWorkingHour" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DoctorWorkingHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorLeave" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "slotDate" DATE NOT NULL,
    "slotStartTime" TEXT NOT NULL,
    "slotEndTime" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "slotDate" DATE NOT NULL,
    "slotStartTime" TEXT NOT NULL,
    "slotEndTime" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomSubmission" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "symptoms" TEXT NOT NULL,
    "duration" TEXT,
    "severity" TEXT,
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymptomSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreVisitSummary" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "urgencyLevel" "UrgencyLevel",
    "chiefComplaint" TEXT,
    "suggestedQuestions" TEXT[],
    "rawLlmResponse" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llmProvider" TEXT,
    "isFailure" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,

    CONSTRAINT "PreVisitSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitNote" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorNotes" TEXT NOT NULL,
    "diagnosis" TEXT,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "visitNoteId" TEXT NOT NULL,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" "MedicationFrequency" NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationReminder" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostVisitSummary" (
    "id" TEXT NOT NULL,
    "visitNoteId" TEXT NOT NULL,
    "patientExplanation" TEXT,
    "medicationSchedule" TEXT,
    "followUpSteps" TEXT,
    "rawLlmResponse" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llmProvider" TEXT,
    "isFailure" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,

    CONSTRAINT "PostVisitSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "disconnectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Specialisation_name_key" ON "Specialisation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE INDEX "DoctorProfile_specialisationId_idx" ON "DoctorProfile"("specialisationId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorWorkingHour_doctorProfileId_dayOfWeek_key" ON "DoctorWorkingHour"("doctorProfileId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DoctorLeave_doctorProfileId_startDate_endDate_idx" ON "DoctorLeave"("doctorProfileId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "SlotHold_expiresAt_idx" ON "SlotHold"("expiresAt");

-- CreateIndex
CREATE INDEX "SlotHold_patientId_idx" ON "SlotHold"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotHold_doctorProfileId_slotDate_slotStartTime_key" ON "SlotHold"("doctorProfileId", "slotDate", "slotStartTime");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_doctorProfileId_slotDate_idx" ON "Appointment"("doctorProfileId", "slotDate");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomSubmission_appointmentId_key" ON "SymptomSubmission"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PreVisitSummary_appointmentId_key" ON "PreVisitSummary"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitNote_appointmentId_key" ON "VisitNote"("appointmentId");

-- CreateIndex
CREATE INDEX "Medication_isActive_endDate_idx" ON "Medication"("isActive", "endDate");

-- CreateIndex
CREATE INDEX "MedicationReminder_scheduledDate_scheduledTime_idx" ON "MedicationReminder"("scheduledDate", "scheduledTime");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationReminder_medicationId_scheduledDate_scheduledTime_key" ON "MedicationReminder"("medicationId", "scheduledDate", "scheduledTime");

-- CreateIndex
CREATE UNIQUE INDEX "PostVisitSummary_visitNoteId_key" ON "PostVisitSummary"("visitNoteId");

-- CreateIndex
CREATE INDEX "Notification_status_lastAttemptAt_idx" ON "Notification"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_referenceId_referenceType_idx" ON "Notification"("referenceId", "referenceType");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection"("userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_syncStatus_idx" ON "CalendarEvent"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_appointmentId_userId_key" ON "CalendarEvent"("appointmentId", "userId");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_specialisationId_fkey" FOREIGN KEY ("specialisationId") REFERENCES "Specialisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorWorkingHour" ADD CONSTRAINT "DoctorWorkingHour_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorLeave" ADD CONSTRAINT "DoctorLeave_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomSubmission" ADD CONSTRAINT "SymptomSubmission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomSubmission" ADD CONSTRAINT "SymptomSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreVisitSummary" ADD CONSTRAINT "PreVisitSummary_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_visitNoteId_fkey" FOREIGN KEY ("visitNoteId") REFERENCES "VisitNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationReminder" ADD CONSTRAINT "MedicationReminder_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVisitSummary" ADD CONSTRAINT "PostVisitSummary_visitNoteId_fkey" FOREIGN KEY ("visitNoteId") REFERENCES "VisitNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
