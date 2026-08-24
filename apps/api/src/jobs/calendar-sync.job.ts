import { processPendingCalendarEvents } from "../calendar/calendar.sync.js";

/**
 * Calendar sync job. Processes PENDING CalendarEvent records.
 * Safe to run repeatedly (idempotent).
 * In production: scheduled via node-cron every 15 minutes.
 */
export async function runCalendarSyncJob(): Promise<void> {
  const result = await processPendingCalendarEvents();
  if (result.processed > 0) {
    console.log(`[calendar-sync] Processed ${result.processed}: ${result.synced} synced, ${result.failed} failed`);
  }
}
