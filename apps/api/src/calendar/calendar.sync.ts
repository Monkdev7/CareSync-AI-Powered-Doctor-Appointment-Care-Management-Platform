import { prisma } from "../db.js";
import { getCalendarProvider } from "./calendar.provider.js";

/**
 * Process pending CalendarEvent records.
 * Creates Google Calendar events and updates sync status.
 * Idempotent: SYNCED events are never reprocessed.
 */
export async function processPendingCalendarEvents(): Promise<{
  processed: number;
  synced: number;
  failed: number;
}> {
  const pending = await prisma.calendarEvent.findMany({
    where: { syncStatus: "PENDING" },
    include: {
      appointment: {
        select: {
          slotDate: true,
          slotStartTime: true,
          slotEndTime: true,
          doctorProfile: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    take: 50,
  });

  if (pending.length === 0) return { processed: 0, synced: 0, failed: 0 };

  const provider = getCalendarProvider();
  const now = new Date();
  let synced = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      const dateStr = event.appointment.slotDate.toISOString().split("T")[0];
      const doctorName = `Dr. ${event.appointment.doctorProfile.user.lastName}`;

      const googleEventId = await provider.createEvent({
        summary: `Medical Appointment - ${doctorName}`,
        startDateTime: `${dateStr}T${event.appointment.slotStartTime}:00`,
        endDateTime: `${dateStr}T${event.appointment.slotEndTime}:00`,
        description: "Healthcare appointment",
      });

      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          googleEventId,
          syncStatus: "SYNCED",
          lastSyncAt: now,
          errorMessage: null,
        },
      });
      synced++;
    } catch (error: any) {
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          syncStatus: "FAILED",
          errorMessage: error.message || "Calendar sync failed",
          retryCount: event.retryCount + 1,
          lastSyncAt: now,
        },
      });
      failed++;
    }
  }

  return { processed: pending.length, synced, failed };
}
