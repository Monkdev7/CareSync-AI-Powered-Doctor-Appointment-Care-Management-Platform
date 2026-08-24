import { cleanupExpiredHolds } from "../appointments/appointment.service.js";

/**
 * Slot hold expiry cleanup job.
 * Deletes all SlotHold records where expiresAt < NOW().
 * Safe to run repeatedly (idempotent).
 *
 * In production, this would be scheduled via node-cron (every 1 minute).
 * For Milestone 4, this is exposed as a callable function for testing.
 */
export async function runSlotHoldExpiryCleanup(): Promise<number> {
  const deleted = await cleanupExpiredHolds();
  if (deleted > 0) {
    console.log(`[slot-hold-expiry] Cleaned up ${deleted} expired holds`);
  }
  return deleted;
}
