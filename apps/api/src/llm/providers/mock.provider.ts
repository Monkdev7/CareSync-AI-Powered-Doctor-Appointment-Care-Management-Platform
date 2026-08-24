import type { LLMProvider, LLMOptions, LLMResponse } from "../llm.provider.js";

/**
 * Mock LLM provider for development/testing.
 * Returns deterministic structured JSON output.
 */
export class MockLLMProvider implements LLMProvider {
  name = "mock";

  async generate(prompt: string, _options?: LLMOptions): Promise<LLMResponse> {
    // Detect which type of summary is being requested based on prompt content
    const isPostVisit = prompt.includes("patient-friendly summary") || prompt.includes("patient communication");

    const mockOutput = isPostVisit
      ? JSON.stringify({
          patientExplanation: "Your doctor examined you and found that your condition is manageable with medication and rest. Follow the prescribed treatment plan.",
          medicationSchedule: "Take your medications as prescribed - follow the dosage and timing instructions provided with each medication.",
          followUpSteps: "Rest for the recommended period, take all medications as prescribed, and schedule a follow-up appointment if symptoms persist.",
        })
      : JSON.stringify({
          urgencyLevel: "MEDIUM",
          chiefComplaint: "Patient reports symptoms requiring medical evaluation",
          suggestedQuestions: [
            "When did the symptoms first appear?",
            "Have you experienced these symptoms before?",
            "Are you currently taking any medications?",
          ],
        });

    return {
      content: mockOutput,
      provider: "mock",
      model: "mock-v1",
    };
  }
}
