import { DEFAULT_RECENT_CONTEXT_CHARS, DEFAULT_RECENT_CONTEXT_MESSAGES } from "./config.ts";

type TextBlock = { type?: unknown; text?: unknown };
type MessageLike = { role?: unknown; content?: unknown };
type BranchEntryLike = { type?: unknown; message?: MessageLike };

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

function labelForRole(role: string): string {
  return role === "assistant" ? "Assistant" : "User";
}

export function buildRecentConversationContext(
  branchEntries: readonly unknown[],
  options: RecentContextOptions = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_RECENT_CONTEXT_CHARS;
  const maxMessages = options.maxMessages ?? DEFAULT_RECENT_CONTEXT_MESSAGES;
  const messages: Array<{ role: string; text: string }> = [];

  for (const rawEntry of branchEntries) {
    const entry = rawEntry as BranchEntryLike;
    if (entry.type !== "message") continue;

    const role = typeof entry.message?.role === "string" ? entry.message.role : "";
    if (role !== "user" && role !== "assistant") continue;

    const text = contentToText(entry.message?.content).trim();
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
