/**
 * Milestone 8 Tests: Notification Outbox Sender
 * Run: pnpm --filter @healthcare/api test:notifications
 */
import { PrismaClient } from "@prisma/client";
import { processPendingNotifications } from "../src/notifications/notification.sender.js";
import { setEmailSender, type EmailSender, type EmailPayload } from "../src/notifications/email.sender.js";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/healthcare_db";
process.env.NODE_ENV = "test";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(c: boolean, m: string) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.error(`  ❌ ${m}`); failed++; failures.push(m); } }

const P = "m8t_";
let userId: string;

async function cleanup() {
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: P } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

async function setup() {
  await cleanup();
  const hash = await hashPassword("ValidPass123");
  const user = await prisma.user.create({ data: { email: `${P}user@t.dev`, passwordHash: hash, firstName: "N", lastName: "U", role: "PATIENT" } });
  userId = user.id;
}

async function testSender() {
  console.log("\n🧪 NOTIFICATION OUTBOX SENDER");

  // Use a tracking mock sender
  const sentEmails: EmailPayload[] = [];
  const mockSender: EmailSender = { send: async (p) => { sentEmails.push(p); } };
  setEmailSender(mockSender);

  // 1. Create a PENDING notification and process it
  await prisma.notification.create({
    data: { userId, type: "BOOKING_CONFIRMATION", subject: "Test", body: "Hello", status: "PENDING", referenceId: "fake-ref", referenceType: "appointment" },
  });

  const r1 = await processPendingNotifications();
  assert(r1.sent === 1, "1. Pending notification is processed and sent");

  // 2. Verify it's now SENT
  const n2 = await prisma.notification.findFirst({ where: { userId, subject: "Test" } });
  assert(n2!.status === "SENT", "2. Notification status is SENT");
  assert(n2!.sentAt !== null, "2b. sentAt is set");
  assert(n2!.attempts === 1, "2c. attempts incremented to 1");

  // 3. Already SENT notifications are not reprocessed
  sentEmails.length = 0;
  const r3 = await processPendingNotifications();
  assert(r3.processed === 0, "3. Already SENT notification not reprocessed");
  assert(sentEmails.length === 0, "3b. No email sent");

  // 4. Failed delivery increments attempts
  const failSender: EmailSender = { send: async () => { throw new Error("SMTP down"); } };
  setEmailSender(failSender);

  await prisma.notification.create({
    data: { userId, type: "APPOINTMENT_REMINDER", subject: "Remind", body: "Tomorrow", status: "PENDING", referenceId: "fake-ref2", referenceType: "appointment" },
  });

  const r4 = await processPendingNotifications();
  assert(r4.failed === 1, "4. Failed delivery is handled");
  const n4 = await prisma.notification.findFirst({ where: { userId, subject: "Remind" } });
  assert(n4!.status === "FAILED", "4b. Status is FAILED");
  assert(n4!.attempts === 1, "4c. Attempts is 1");
  assert(n4!.errorMessage === "SMTP down", "4d. Error message stored");

  // 5. Retry: process again (backoff not elapsed, should NOT retry yet)
  const r5 = await processPendingNotifications();
  // The notification was just attempted (lastAttemptAt ~ now), backoff = 2^1 * 60s = 2min
  // So it should NOT be retried immediately
  assert(r5.processed === 0, "5. Retry respects backoff (not retried immediately)");

  // 6. Simulate backoff elapsed by updating lastAttemptAt to the past
  await prisma.notification.update({
    where: { id: n4!.id },
    data: { lastAttemptAt: new Date(Date.now() - 3 * 60_000) }, // 3 min ago > 2 min backoff
  });

  // Switch back to working sender
  setEmailSender(mockSender);
  const r6 = await processPendingNotifications();
  assert(r6.sent === 1, "6. Retry succeeds after backoff elapsed");
  const n6 = await prisma.notification.findFirst({ where: { id: n4!.id } });
  assert(n6!.status === "SENT", "6b. Retried notification is now SENT");

  // 7. Max attempts reached → stays FAILED permanently
  setEmailSender(failSender);
  const nMax = await prisma.notification.create({
    data: { userId, type: "CANCELLATION", subject: "Cancel", body: "X", status: "FAILED", attempts: 2, maxAttempts: 3, lastAttemptAt: new Date(Date.now() - 10 * 60_000), referenceId: "r3", referenceType: "appointment" },
  });
  const r7 = await processPendingNotifications();
  // attempts=2, maxAttempts=3 → one more try, will fail → attempts becomes 3 = maxAttempts
  const n7 = await prisma.notification.findFirst({ where: { id: nMax.id } });
  assert(n7!.attempts === 3, "7. Max attempts reached (3)");
  // Next run should NOT pick it up
  await prisma.notification.update({ where: { id: nMax.id }, data: { lastAttemptAt: new Date(Date.now() - 60 * 60_000) } });
  const r7b = await processPendingNotifications();
  // It has attempts >= maxAttempts, so it's filtered out in the eligible check
  // Actually the DB query fetches attempts < 3, but it's now 3, so it won't be fetched
  assert(r7b.processed === 0, "7b. Exhausted notification not retried");
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Milestone 8: Notification Outbox Sender Tests");
  console.log("═══════════════════════════════════════════════════════════");
  try { await setup(); await testSender(); } catch (e) { console.error("\n💥", e); failed++; } finally {
    await cleanup(); await prisma.$disconnect();
  }
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) failures.forEach((f) => console.log(`    - ${f}`));
  console.log("═══════════════════════════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}
run();
