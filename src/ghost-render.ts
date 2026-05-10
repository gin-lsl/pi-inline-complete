import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const REVERSE_VIDEO_START = "\x1b[7m";
const SGR_RESET = "\x1b[0m";

export type GhostStyle = (text: string) => string;

function firstDisplayLine(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "";
}

export function insertGhostText(
  renderedLines: string[],
  prediction: string,
  width: number,
  style: GhostStyle,
): string[] {
  const displayText = firstDisplayLine(prediction);
  if (!displayText) return renderedLines;

  const lineIndex = renderedLines.findIndex((line) => line.includes(REVERSE_VIDEO_START));
  if (lineIndex < 0) return renderedLines;

  const line = renderedLines[lineIndex] ?? "";
  const cursorStart = line.indexOf(REVERSE_VIDEO_START);
  const cursorReset = line.indexOf(SGR_RESET, cursorStart);
  if (cursorStart < 0 || cursorReset < 0) return renderedLines;

  const insertAt = cursorReset + SGR_RESET.length;
  const visibleBeforeInsert = visibleWidth(line.slice(0, insertAt));
  const available = Math.max(0, width - visibleBeforeInsert);
  if (available <= 0) return renderedLines;

  const visibleGhost = truncateToWidth(displayText, available, "", false);
  if (!visibleGhost) return renderedLines;

  const withGhost = `${line.slice(0, insertAt)}${style(visibleGhost)}${line.slice(insertAt)}`;
  const nextLines = [...renderedLines];
  nextLines[lineIndex] = truncateToWidth(withGhost, width, "", false);
  return nextLines;
}
