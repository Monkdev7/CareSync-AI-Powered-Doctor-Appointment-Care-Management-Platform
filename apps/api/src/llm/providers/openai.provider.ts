import type { LLMProvider, LLMOptions, LLMResponse } from "../llm.provider.js";

/**
 * OpenAI LLM provider.
 * Uses the OpenAI Chat Completions API.
 */
export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey: string, model: string, timeoutMs: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async generate(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1000,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = (await response.json()) as any;
      return {
        content: data.choices[0].message.content,
        provider: "openai",
        model: this.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
