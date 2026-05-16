import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installInlineCompletion } from "../src/inline-editor.ts";

export default function inlineCompleteExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    await installInlineCompletion(ctx, undefined, process.env.DEEPSEEK_COMPLETION_MODE as "fim" | "chat_prefix" | undefined);
  });
}
