/**
 * Email delivery abstraction.
 * In production, this would use Nodemailer with SMTP config.
 * For the screening project, a mock sender is used unless SMTP is configured.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSender {
  send(payload: EmailPayload): Promise<void>;
}

/**
 * Mock email sender for development/testing.
 * Logs delivery but doesn't send real emails.
 */
export class MockEmailSender implements EmailSender {
  async send(_payload: EmailPayload): Promise<void> {
    // No-op in mock mode. Real implementation would use Nodemailer.
  }
}

let sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (!sender) {
    sender = new MockEmailSender();
  }
  return sender;
}

export function setEmailSender(s: EmailSender): void {
  sender = s;
}
