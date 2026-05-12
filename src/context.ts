import { DEFAULT_RECENT_CONTEXT_CHARS, DEFAULT_RECENT_CONTEXT_MESSAGES } from "./config.ts";
import type { ChatMessage } from "./types.ts";

type TextBlock = { type?: unknown; text?: unknown };
type UnknownRecord = Record<string, unknown>;

export interface RecentContextOptions {
  maxChars?: number;
  maxMessages?: number;
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block: TextBlock) => (block?.type === "text" && typeof block.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizeLimit(value: unknown, fallback: number): number {
  const limit = value === undefined ? fallback : value;
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 0;
  return Math.max(0, Math.floor(limit));
}

function labelForRole(role: string): string {
  return role === "assistant" ? "Assistant" : "User";
}

export function buildRecentConversationContext(
  branchEntries: readonly unknown[],
  options: RecentContextOptions = {},
): string {
  const maxChars = normalizeLimit(options.maxChars, DEFAULT_RECENT_CONTEXT_CHARS);
  const maxMessages = normalizeLimit(options.maxMessages, DEFAULT_RECENT_CONTEXT_MESSAGES);
  if (maxMessages === 0 || maxChars === 0) return "";

  const messages: Array<{ role: string; text: string }> = [];

  for (const rawEntry of branchEntries) {
    if (!isRecord(rawEntry) || rawEntry.type !== "message") continue;

    const message = rawEntry.message;
    if (!isRecord(message)) continue;

    const role = typeof message.role === "string" ? message.role : "";
    if (role !== "user" && role !== "assistant") continue;

    const text = contentToText(message.content).trim();
    if (!text) continue;

    messages.push({ role, text });
  }

  const recent = messages.slice(-maxMessages);
  if (recent.length === 0) return "";

  let body = recent.map((message) => `${labelForRole(message.role)}: ${message.text}`).join("\n\n");
  if (body.length > maxChars) {
    body = body.slice(body.length - maxChars);
  }

  return `[Recent conversation context]\n${body}`;
}

export function buildConversationMessages(
  branchEntries: readonly unknown[],
  options: RecentContextOptions = {},
): ChatMessage[] {
  const maxMessages = normalizeLimit(options.maxMessages, DEFAULT_RECENT_CONTEXT_MESSAGES);
  if (maxMessages === 0) return [];

  const messages: ChatMessage[] = [];

  for (const rawEntry of branchEntries) {
    if (!isRecord(rawEntry) || rawEntry.type !== "message") continue;

    const message = rawEntry.message;
    if (!isRecord(message)) continue;

    const role = typeof message.role === "string" ? message.role : "";
    if (role !== "user" && role !== "assistant") continue;

    const text = contentToText(message.content).trim();
    if (!text) continue;

    messages.push({ role, content: text });
  }

  return messages.slice(-maxMessages);
}

export function buildFimPrompt(recentContext: string, beforeCursor: string): string {
  const instruction = [
    "[Instruction]",
    "Continue the user's current draft at the cursor.",
    "Return only the text to insert. Do not explain. Do not wrap the answer in markdown fences.",
    "Do not repeat text that already appears after the cursor.",
  ].join("\n");

  const sections = [instruction];
  if (recentContext.trim()) {
    sections.push(recentContext.trim());
  }
  sections.push("[Current draft before cursor]", beforeCursor);
  return sections.join("\n\n");
}
