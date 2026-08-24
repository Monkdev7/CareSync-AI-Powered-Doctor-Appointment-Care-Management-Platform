import nodemailer from "nodemailer";
import type { EmailSender, EmailPayload } from "./email.sender.js";

/**
 * Real email sender using Nodemailer SMTP.
 * Configuration via environment variables.
 */
export class NodemailerSender implements EmailSender {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    this.from = process.env.EMAIL_FROM || "noreply@healthcare-app.com";
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async send(payload: EmailPayload): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
  }
}
