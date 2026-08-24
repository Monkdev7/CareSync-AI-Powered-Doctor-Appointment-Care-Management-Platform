import { runSlotHoldExpiryCleanup } from "./slot-hold-expiry.job.js";
import { runNotificationSenderJob } from "./notification-sender.job.js";
import { runCalendarSyncJob } from "./calendar-sync.job.js";
import { runMedicationReminderJob } from "./medication-reminder.job.js";

/**
 * Start all background jobs.
 * Each job is wrapped in try/catch so a single failure doesn't crash the process.
 * In production these would be scheduled via node-cron.
 * For the screening project, they are exported as callable functions.
 */
export function startJobs(intervalMs = 30_000) {
  const run = async () => {
    try { await runSlotHoldExpiryCleanup(); } catch (e) { console.error("[jobs] slot-hold-expiry error:", e); }
    try { await runNotificationSenderJob(); } catch (e) { console.error("[jobs] notification-sender error:", e); }
    try { await runCalendarSyncJob(); } catch (e) { console.error("[jobs] calendar-sync error:", e); }
    try { await runMedicationReminderJob(); } catch (e) { console.error("[jobs] medication-reminder error:", e); }
  };

  // Run once immediately, then on interval
  run();
  const timer = setInterval(run, intervalMs);

  return { stop: () => clearInterval(timer) };
}

export { runSlotHoldExpiryCleanup, runNotificationSenderJob, runCalendarSyncJob, runMedicationReminderJob };
