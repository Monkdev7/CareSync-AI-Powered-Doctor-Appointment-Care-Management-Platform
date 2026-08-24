import type { LLMProvider } from "./llm.provider.js";
import { MockLLMProvider } from "./providers/mock.provider.js";
import { OpenAIProvider } from "./providers/openai.provider.js";

let provider: LLMProvider | null = null;

/**
 * Get the configured LLM provider (singleton).
 * Selected via LLM_PROVIDER env var.
 */
export function getLLMProvider(): LLMProvider {
  if (provider) return provider;

  const providerName = process.env.LLM_PROVIDER || "mock";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const apiKey = process.env.LLM_API_KEY || "";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 30000;

  switch (providerName) {
    case "openai":
      provider = new OpenAIProvider(apiKey, model, timeoutMs);
      break;
    case "mock":
    default:
      provider = new MockLLMProvider();
      break;
  }

  return provider;
}

/** Reset provider (for testing) */
export function resetLLMProvider(): void {
  provider = null;
}
