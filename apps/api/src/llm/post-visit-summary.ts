import { z } from "zod";
import { prisma } from "../db.js";
import { getLLMProvider } from "./llm.service.js";

const PostVisitSummarySchema = z.object({
  patientExplanation: z.string().min(10).max(1000),
  medicationSchedule: z.string().min(5).max(500),
  followUpSteps: z.string().min(5).max(500),
});

function buildPrompt(doctorNotes: string, diagnosis: string | null, medications: Array<{ name: string; dosage: string; frequency: string; duration: string }>): string {
  const medList = medications.map((m) => `- ${m.name} ${m.dosage}, ${m.frequency}, for ${m.duration}`).join("\n");
  return `You are a patient communication assistant. Given the following doctor's visit notes, create a patient-friendly summary.

Doctor's notes: ${doctorNotes}
${diagnosis ? `Diagnosis: ${diagnosis}` : ""}
${medList ? `Medications:\n${medList}` : "No medications prescribed."}

Respond in JSON format with:
- patientExplanation: A clear, simple explanation of what the doctor found and recommended (patient-friendly language, max 1000 chars)
- medicationSchedule: When and how to take prescribed medications (max 500 chars)
- followUpSteps: What the patient should do next (max 500 chars)

Return only valid JSON, no explanation.`;
}

/**
 * Generate post-visit summary. Called async after prescription creation.
 * Idempotent — won't regenerate if already exists.
 */
export async function generatePostVisitSummary(visitNoteId: string): Promise<void> {
  const existing = await prisma.postVisitSummary.findUnique({ where: { visitNoteId } });
  if (existing) return;

  const visitNote = await prisma.visitNote.findUnique({
    where: { id: visitNoteId },
    include: { prescriptions: { include: { medications: true } } },
  });

  if (!visitNote) {
    await prisma.postVisitSummary.create({
      data: { visitNoteId, isFailure: true, errorMessage: "Visit note not found" },
    });
    return;
  }

  const allMeds = visitNote.prescriptions.flatMap((p) => p.medications);
  const provider = getLLMProvider();
  const prompt = buildPrompt(visitNote.doctorNotes, visitNote.diagnosis, allMeds);

  try {
    const response = await provider.generate(prompt, { temperature: 0.3, maxTokens: 800 });
    const parsed = PostVisitSummarySchema.safeParse(JSON.parse(response.content));

    if (!parsed.success) {
      await prisma.postVisitSummary.create({
        data: {
          visitNoteId,
          isFailure: true,
          errorMessage: `Output validation failed: ${parsed.error.message}`,
          rawLlmResponse: response.content,
          llmProvider: response.provider,
        },
      });
      return;
    }

    await prisma.postVisitSummary.create({
      data: {
        visitNoteId,
        patientExplanation: parsed.data.patientExplanation,
        medicationSchedule: parsed.data.medicationSchedule,
        followUpSteps: parsed.data.followUpSteps,
        rawLlmResponse: response.content,
        llmProvider: response.provider,
        isFailure: false,
      },
    });
  } catch (error: any) {
    await prisma.postVisitSummary.create({
      data: {
        visitNoteId,
        isFailure: true,
        errorMessage: error.message || "LLM provider error",
        llmProvider: provider.name,
      },
    });
  }
}
