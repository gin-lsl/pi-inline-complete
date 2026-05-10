import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const REVERSE_VIDEO_START = "\x1b[7m";
const SGR_RESET = "\x1b[0m";
const ANSI_SEQUENCE_PATTERN = /(?:\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)|\x1B[@-Z\\-_])/g;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1F\x7F-\x9F]/g;

export type GhostStyle = (text: string) => string;

function firstDisplayLine(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "";
}

function stripAnsiAndControl(text: string): string {
  return text.replace(ANSI_SEQUENCE_PATTERN, "").replace(CONTROL_CHARACTER_PATTERN, "");
}

export function insertGhostText(
  renderedLines: string[],
  prediction: string,
  width: number,
  style: GhostStyle,
): string[] {
  const displayText = stripAnsiAndControl(firstDisplayLine(prediction));
  if (!displayText) return renderedLines;

  const lineIndex = renderedLines.findIndex((line) => line.includes(REVERSE_VIDEO_START));
  if (lineIndex < 0) return renderedLines;

  const line = renderedLines[lineIndex] ?? "";
  const cursorStart = line.indexOf(REVERSE_VIDEO_START);
  const cursorReset = line.indexOf(SGR_RESET, cursorStart);
  if (cursorStart < 0 || cursorReset < 0) return renderedLines;

  const insertAt = cursorReset + SGR_RESET.length;
  const beforeInsert = line.slice(0, insertAt);
  const afterInsert = line.slice(insertAt);
  const trailingPadding = afterInsert.match(/ *$/)?.[0] ?? "";
  const preservedAfterInsert = afterInsert.slice(0, afterInsert.length - trailingPadding.length);
  const preservedVisibleWidth = visibleWidth(`${beforeInsert}${preservedAfterInsert}`);
  const roomAfterPreservedContent = Math.max(0, width - preservedVisibleWidth);
  const available = preservedAfterInsert
    ? Math.min(trailingPadding.length, roomAfterPreservedContent)
    : roomAfterPreservedContent;
  if (available <= 0) return renderedLines;

  const visibleGhost = stripAnsiAndControl(truncateToWidth(displayText, available, "", false));
  if (visibleWidth(visibleGhost) <= 0) return renderedLines;

  const ghostWidth = visibleWidth(visibleGhost);
  const paddingToRemove = Math.min(
    trailingPadding.length,
    Math.max(0, preservedVisibleWidth + ghostWidth + trailingPadding.length - width),
  );
  const remainingPadding = trailingPadding.slice(0, trailingPadding.length - paddingToRemove);
  const withGhost = `${beforeInsert}${style(visibleGhost)}${preservedAfterInsert}${remainingPadding}`;
  const nextLines = [...renderedLines];
  nextLines[lineIndex] = withGhost;
  return nextLines;
}
