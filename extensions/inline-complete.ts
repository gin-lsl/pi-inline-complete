import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installInlineCompletion } from "../src/inline-editor.ts";

export default function inlineCompleteExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    installInlineCompletion(ctx);
  });
}
