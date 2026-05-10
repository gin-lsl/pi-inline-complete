import { DEFAULT_MAX_COMPLETION_CHARS } from "./config.ts";
import type { CursorPosition, EditorSnapshot } from "./types.ts";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function snapshotKey(text: string, cursor: CursorPosition): string {
  return `${cursor.line}:${cursor.col}:${text}`;
}

export function splitAtCursor(lines: string[], cursor: CursorPosition): EditorSnapshot {
  const normalizedLines = lines.length > 0 ? lines : [""];
  const line = clamp(cursor.line, 0, normalizedLines.length - 1);
  const currentLine = normalizedLines[line] ?? "";
  const col = clamp(cursor.col, 0, currentLine.length);
  const text = normalizedLines.join("\n");
  const offset = normalizedLines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0) + col;
  const normalizedCursor = { line, col };

  return {
    text,
    cursor: normalizedCursor,
    beforeCursor: text.slice(0, offset),
    afterCursor: text.slice(offset),
    key: snapshotKey(text, normalizedCursor),
  };
}

export function hasEnoughInput(text: string, minNonWhitespace = 3): boolean {
  return text.replace(/\s/g, "").length >= minNonWhitespace;
}

export function removeSuffixOverlap(completion: string, suffix: string): string {
  if (!completion || !suffix) return completion;

  const suffixPrefix = suffix.slice(0, Math.min(suffix.length, 200));
  if (suffixPrefix.startsWith(completion)) return "";

  const maxOverlap = Math.min(completion.length, suffixPrefix.length);
  for (let length = maxOverlap; length > 0; length--) {
    if (completion.endsWith(suffixPrefix.slice(0, length))) {
      return completion.slice(0, completion.length - length);
    }
  }

  return completion;
}

function removeMarkdownFence(text: string): string {
  return text.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```$/, "");
}

function removeExplanatoryPrefix(text: string): string {
  return text.replace(/^(?:Sure[:,]?|Here(?:'s| is)\s+[^:\n]{0,40}:)\s*/i, "");
}

export function cleanCompletion(
  rawCompletion: string,
  suffix: string,
  maxChars = DEFAULT_MAX_COMPLETION_CHARS,
): string | undefined {
  let text = rawCompletion.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = removeMarkdownFence(text);
  text = removeExplanatoryPrefix(text);
  text = text.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  text = removeSuffixOverlap(text, suffix);

  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }

  return text.trim().length > 0 ? text : undefined;
}
