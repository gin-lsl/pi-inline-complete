import { DEFAULT_MAX_TOKENS, DEEPSEEK_FIM_ENDPOINT, DEEPSEEK_MODEL } from "./config.ts";
import { buildFimPrompt } from "./context.ts";
import { cleanCompletion } from "./text.ts";
import type { PredictionRequest, PredictionService } from "./types.ts";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class DeepSeekAuthError extends Error {
  constructor(status: number, body: string) {
    super(`DeepSeek authentication failed (${status}): ${body}`);
    this.name = "DeepSeekAuthError";
  }
}

export class DeepSeekTransientError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`DeepSeek request failed (${status}): ${body}`);
    this.name = "DeepSeekTransientError";
    this.status = status;
  }
}

export interface DeepSeekFimClientOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  fetch?: FetchLike;
}

type DeepSeekCompletionResponse = {
  choices?: Array<{ text?: unknown }>;
};

export class DeepSeekFimClient implements PredictionService {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: DeepSeekFimClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.endpoint = options.endpoint ?? DEEPSEEK_FIM_ENDPOINT;
    this.model = options.model ?? DEEPSEEK_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async complete(request: PredictionRequest, signal: AbortSignal): Promise<string | undefined> {
    if (!this.apiKey) return undefined;

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: buildFimPrompt(request.recentContext, request.beforeCursor),
        suffix: request.afterCursor,
        max_tokens: this.maxTokens,
      }),
      signal,
    });

    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new DeepSeekAuthError(response.status, body);
    }
    if (!response.ok) {
      throw new DeepSeekTransientError(response.status, body);
    }

    const parsed = JSON.parse(body) as DeepSeekCompletionResponse;
    const rawText = parsed.choices?.[0]?.text;
    if (typeof rawText !== "string") return undefined;

    return cleanCompletion(rawText, request.afterCursor);
  }
}
