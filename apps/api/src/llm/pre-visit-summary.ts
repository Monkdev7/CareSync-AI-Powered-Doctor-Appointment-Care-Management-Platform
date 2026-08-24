import { z } from "zod";
import { prisma } from "../db.js";
import { getLLMProvider } from "./llm.service.js";

/**
 * Expected structured output from the LLM for pre-visit summaries.
 */
const PreVisitSummarySchema = z.object({
  urgencyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  chiefComplaint: z.string().min(5).max(500),
  suggestedQuestions: z.array(z.string()).length(3),
});

/**
 * Prompt template for pre-visit summary generation.
 */
function buildPrompt(symptoms: string, duration?: string | null, severity?: string | null, additionalNotes?: string | null): string {
  return `You are a medical triage assistant. Given the following patient symptoms, provide a structured pre-visit summary for the doctor.

Patient symptoms: ${symptoms}
${duration ? `Duration: ${duration}` : ""}
${severity ? `Severity reported: ${severity}` : ""}
${additionalNotes ? `Additional notes: ${additionalNotes}` : ""}

Respond in JSON format with:
- urgencyLevel: "LOW", "MEDIUM", or "HIGH"
- chiefComplaint: Brief summary of the main concern (max 500 chars)
- suggestedQuestions: Array of exactly 3 questions the doctor should ask

Return only valid JSON, no explanation.`;
}

/**
 * Generate a pre-visit summary for an appointment.
 * Called asynchronously AFTER appointment confirmation.
 *
 * Architecture rules:
 * - LLM failure NEVER blocks booking
 * - isFailure=true row is created on failure
 * - Output is validated with Zod before storage
 * - Raw response stored for debugging
 */
export async function generatePreVisitSummary(appointmentId: string): Promise<void> {
  // Check if summary already exists (idempotent)
  const existing = await prisma.preVisitSummary.findUnique({
    where: { appointmentId },
  });
  if (existing) return;

  // Get symptom data
  const symptomSubmission = await prisma.symptomSubmission.findUnique({
    where: { appointmentId },
  });
  if (!symptomSubmission) {
    await prisma.preVisitSummary.create({
      data: {
        appointmentId,
        isFailure: true,
        errorMessage: "No symptom submission found",
        suggestedQuestions: [],
      },
    });
    return;
  }

  const provider = getLLMProvider();
  const prompt = buildPrompt(
    symptomSubmission.symptoms,
    symptomSubmission.duration,
    symptomSubmission.severity,
    symptomSubmission.additionalNotes
  );

  try {
    const response = await provider.generate(prompt, { temperature: 0.3, maxTokens: 500 });
    const parsed = PreVisitSummarySchema.safeParse(JSON.parse(response.content));

    if (!parsed.success) {
      // Schema validation failed — store failure with raw response
      await prisma.preVisitSummary.create({
        data: {
          appointmentId,
          isFailure: true,
          errorMessage: `Output validation failed: ${parsed.error.message}`,
          rawLlmResponse: response.content,
          llmProvider: response.provider,
          suggestedQuestions: [],
        },
      });
      return;
    }

    // Success — store validated summary
    await prisma.preVisitSummary.create({
      data: {
        appointmentId,
        urgencyLevel: parsed.data.urgencyLevel,
        chiefComplaint: parsed.data.chiefComplaint,
        suggestedQuestions: parsed.data.suggestedQuestions,
        rawLlmResponse: response.content,
        llmProvider: response.provider,
        isFailure: false,
      },
    });
  } catch (error: any) {
    // LLM provider error — store failure record
    await prisma.preVisitSummary.create({
      data: {
        appointmentId,
        isFailure: true,
        errorMessage: error.message || "LLM provider error",
        llmProvider: provider.name,
        suggestedQuestions: [],
      },
    });
  }
}
