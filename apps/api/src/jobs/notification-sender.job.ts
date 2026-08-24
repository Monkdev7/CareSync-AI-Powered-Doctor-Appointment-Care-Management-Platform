import { processPendingNotifications } from "../notifications/notification.sender.js";

/**
 * Notification sender job.
 * Processes pending/failed notifications from the outbox.
 * Safe to run repeatedly (idempotent).
 *
 * In production: scheduled via node-cron every 30 seconds.
 */
export async function runNotificationSenderJob(): Promise<void> {
  const result = await processPendingNotifications();
  if (result.processed > 0) {
    console.log(`[notification-sender] Processed ${result.processed}: ${result.sent} sent, ${result.failed} failed`);
  }
}
