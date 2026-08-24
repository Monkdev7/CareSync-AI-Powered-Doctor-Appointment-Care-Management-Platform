import { prisma } from "../db.js";

const FREQUENCY_TIMES: Record<string, string[]> = {
  ONCE_DAILY: ["08:00"],
  TWICE_DAILY: ["08:00", "20:00"],
  THREE_TIMES_DAILY: ["08:00", "14:00", "20:00"],
  EVERY_8_HOURS: ["06:00", "14:00", "22:00"],
  EVERY_12_HOURS: ["08:00", "20:00"],
};

/**
 * Generate medication reminders for active medications.
 * Creates MedicationReminder + Notification rows.
 * Idempotent via @@unique([medicationId, scheduledDate, scheduledTime]).
 */
export async function runMedicationReminderJob(): Promise<number> {
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const activeMeds = await prisma.medication.findMany({
    where: { isActive: true, startDate: { lte: todayDate }, endDate: { gte: todayDate } },
    include: { prescription: { include: { visitNote: { include: { appointment: { select: { patientId: true } } } } } } },
  });

  let created = 0;

  for (const med of activeMeds) {
    const times = FREQUENCY_TIMES[med.frequency] || ["08:00"];
    const patientId = med.prescription.visitNote.appointment.patientId;

    for (const time of times) {
      try {
        const reminder = await prisma.medicationReminder.create({
          data: { medicationId: med.id, patientId, scheduledDate: todayDate, scheduledTime: time },
        });

        await prisma.notification.create({
          data: {
            userId: patientId,
            type: "MEDICATION_REMINDER",
            subject: `Medication Reminder: ${med.name}`,
            body: `Time to take ${med.name} ${med.dosage}. ${med.instructions || ""}`.trim(),
            status: "PENDING",
            referenceId: reminder.id,
            referenceType: "medication_reminder",
          },
        });
        created++;
      } catch (e: any) {
        // Unique constraint = already created (idempotent)
        if (e.code !== "P2002") throw e;
      }
    }
  }

  if (created > 0) console.log(`[medication-reminder] Created ${created} reminders`);
  return created;
}
