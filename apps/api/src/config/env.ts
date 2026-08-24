import { z } from "zod";

/**
 * Environment variable schema.
 * Only DATABASE_URL and PORT are required for Milestone 1.
 * Other variables are optional until their respective milestones.
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),

  // Database (required)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Auth (optional until Milestone 2)
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().default(12),

  // Email (optional until Milestone 8)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@healthcare-app.com"),

  // LLM (optional until Milestone 5)
  LLM_PROVIDER: z.enum(["openai", "anthropic", "mock"]).default("mock"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().default(2),

  // Google Calendar (optional until Milestone 10)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  CALENDAR_TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // Booking
  SLOT_HOLD_DURATION_MINUTES: z.coerce.number().default(5),
  DEFAULT_CONSULTATION_DURATION_MIN: z.coerce.number().default(30),

  // Notifications
  NOTIFICATION_MAX_RETRIES: z.coerce.number().default(3),
  APPOINTMENT_REMINDER_HOURS_BEFORE: z.coerce.number().default(24),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌ Environment validation failed:");
    console.error(JSON.stringify(formatted, null, 2));
    process.exit(1);
  }

  return result.data;
}
