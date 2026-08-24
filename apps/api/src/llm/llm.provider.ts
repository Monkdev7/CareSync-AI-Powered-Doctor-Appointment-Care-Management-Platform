/**
 * Abstract LLM provider interface.
 * Concrete implementations: OpenAI, Anthropic, Mock.
 * Selected via LLM_PROVIDER environment variable.
 */

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
}

export interface LLMProvider {
  name: string;
  generate(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
}
