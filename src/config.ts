export const DEEPSEEK_FIM_ENDPOINT = "https://api.deepseek.com/beta/completions";
export const DEEPSEEK_CHAT_PREFIX_ENDPOINT = "https://api.deepseek.com/beta/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_DEBOUNCE_MS = 600;
export const DEFAULT_MAX_TOKENS = 64;
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
export const DEFAULT_BACKOFF_MS = 30_000;
export const DEFAULT_MIN_NON_WHITESPACE = 3;
export const DEFAULT_RECENT_CONTEXT_CHARS = 4_000;
export const DEFAULT_RECENT_CONTEXT_MESSAGES = 8;
export const DEFAULT_MAX_COMPLETION_CHARS = 600;

export type CompletionMode = "fim" | "chat_prefix";

export const SUPPORTED_MODES: CompletionMode[] = ["fim", "chat_prefix"];

export function resolveCompletionMode(env?: string): CompletionMode {
  if (env && (env === "fim" || env === "chat_prefix")) {
    return env;
  }
  return "fim";
}
