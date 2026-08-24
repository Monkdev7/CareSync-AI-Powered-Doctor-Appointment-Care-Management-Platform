import { prisma } from "../db.js";
import { getEmailSender } from "./email.sender.js";

/**
 * Process pending notifications (outbox sender).
 *
 * Algorithm (per ARCHITECTURE_REVISED.md):
 * 1. SELECT notifications WHERE status = 'PENDING' AND attempts = 0
 *    OR status = 'FAILED' AND retry eligible (backoff elapsed, attempts < maxAttempts)
 * 2. For each: attempt email send
 * 3. Success: status = SENT, sentAt = now
 * 4. Failure: status = FAILED, attempts++, lastAttemptAt = now, errorMessage
 *
 * Idempotent: already-SENT notifications are never reprocessed.
 * Safe for repeated execution.
 */
export async function processPendingNotifications(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();

  // Find eligible notifications
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { status: "PENDING", attempts: 0 },
        { status: "FAILED", attempts: { lt: 3 } },
      ],
    },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  // Filter retry-eligible (backoff check)
  const eligible = notifications.filter((n) => {
    if (n.status === "PENDING" && n.attempts === 0) return true;
    if (n.status !== "FAILED") return false;
    if (n.attempts >= n.maxAttempts) return false;
    if (!n.lastAttemptAt) return true;
    const backoffMs = Math.pow(2, n.attempts) * 60_000;
    const nextRetryAt = new Date(n.lastAttemptAt.getTime() + backoffMs);
    return now >= nextRetryAt;
  });

  const sender = getEmailSender();
  let sent = 0;
  let failed = 0;

  for (const notification of eligible) {
    try {
      await sender.send({
        to: notification.user.email,
        subject: notification.subject,
        body: notification.body,
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: now,
          attempts: notification.attempts + 1,
          lastAttemptAt: now,
        },
      });
      sent++;
    } catch (error: any) {
      const newAttempts = notification.attempts + 1;
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: newAttempts >= notification.maxAttempts ? "FAILED" : "FAILED",
          attempts: newAttempts,
          lastAttemptAt: now,
          errorMessage: error.message || "Delivery failed",
        },
      });
      failed++;
    }
  }

  return { processed: eligible.length, sent, failed };
}
