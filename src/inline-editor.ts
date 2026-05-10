import {
  CustomEditor,
  type ExtensionContext,
  type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MIN_NON_WHITESPACE,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./config.ts";
import { buildRecentConversationContext } from "./context.ts";
import { DeepSeekAuthError, DeepSeekFimClient } from "./deepseek.ts";
import { insertGhostText } from "./ghost-render.ts";
import { hasEnoughInput, splitAtCursor } from "./text.ts";
import type { EditorSnapshot, PredictionService } from "./types.ts";

interface ActivePrediction {
  text: string;
  snapshotKey: string;
}

export interface InlineCompletionEditorOptions {
  debounceMs?: number;
  requestTimeoutMs?: number;
  minNonWhitespace?: number;
  backoffMs?: number;
  autoRequest?: boolean;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class InlineCompletionEditor extends CustomEditor {
  private readonly appKeybindings: KeybindingsManager;
  private readonly ctx: ExtensionContext;
  private readonly predictionService: PredictionService;
  private readonly debounceMs: number;
  private readonly requestTimeoutMs: number;
  private readonly minNonWhitespace: number;
  private readonly backoffMs: number;
  private readonly autoRequest: boolean;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abortController: AbortController | undefined;
  private requestId = 0;
  private prediction: ActivePrediction | undefined;
  private backoffUntil = 0;
  private authDisabled = false;
  private readonly notified = new Set<string>();

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    ctx: ExtensionContext,
    predictionService: PredictionService,
    options: InlineCompletionEditorOptions = {},
  ) {
    super(tui, theme, keybindings);
    this.appKeybindings = keybindings;
    this.ctx = ctx;
    this.predictionService = predictionService;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.minNonWhitespace = options.minNonWhitespace ?? DEFAULT_MIN_NON_WHITESPACE;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.autoRequest = options.autoRequest ?? true;
  }

  setPredictionForTest(text: string): void {
    this.prediction = { text, snapshotKey: this.currentSnapshot().key };
  }

  override setText(text: string): void {
    super.setText(text);
    this.handleSnapshotChange();
  }

  override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(text);
    this.handleSnapshotChange();
  }

  override handleInput(data: string): void {
    if (this.hasValidPrediction() && this.appKeybindings.matches(data, "tui.input.tab")) {
      const accepted = this.prediction?.text ?? "";
      this.clearPrediction();
      this.abortPendingRequest();
      super.insertTextAtCursor(accepted);
      this.handleSnapshotChange();
      this.tui.requestRender();
      return;
    }

    const beforeKey = this.currentSnapshot().key;
    super.handleInput(data);
    if (this.currentSnapshot().key !== beforeKey) {
      this.handleSnapshotChange();
    }
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    if (!this.hasValidPrediction()) return lines;

    return insertGhostText(lines, this.prediction?.text ?? "", width, (text) => this.ctx.ui.theme.fg("dim", text));
  }

  private currentSnapshot(): EditorSnapshot {
    return splitAtCursor(this.getLines(), this.getCursor());
  }

  private hasValidPrediction(): boolean {
    return this.prediction !== undefined && this.prediction.snapshotKey === this.currentSnapshot().key;
  }

  private clearPrediction(): void {
    this.prediction = undefined;
  }

  private handleSnapshotChange(): void {
    this.clearPrediction();
    this.abortPendingRequest();
    this.schedulePrediction();
    this.tui.requestRender();
  }

  private schedulePrediction(): void {
    if (!this.autoRequest) return;
    if (this.timer) clearTimeout(this.timer);

    const snapshot = this.currentSnapshot();
    if (!this.shouldRequest(snapshot)) return;

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.requestPrediction(snapshot);
    }, this.debounceMs);
  }

  private shouldRequest(snapshot: EditorSnapshot): boolean {
    if (this.authDisabled) return false;
    if (Date.now() < this.backoffUntil) return false;
    if (!this.ctx.isIdle()) return false;
    if (!process.env.DEEPSEEK_API_KEY) {
      this.notifyOnce("missing-key", "inline-complete: set DEEPSEEK_API_KEY to enable predictions.", "warning");
      return false;
    }
    return hasEnoughInput(snapshot.text, this.minNonWhitespace);
  }

  private async requestPrediction(snapshot: EditorSnapshot): Promise<void> {
    const requestId = ++this.requestId;
    const controller = new AbortController();
    this.abortController = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const recentContext = buildRecentConversationContext(this.ctx.sessionManager.getBranch());
      const completion = await this.predictionService.complete(
        {
          beforeCursor: snapshot.beforeCursor,
          afterCursor: snapshot.afterCursor,
          recentContext,
        },
        controller.signal,
      );

      if (requestId !== this.requestId) return;
      if (snapshot.key !== this.currentSnapshot().key) return;
      if (!completion) return;

      this.prediction = { text: completion, snapshotKey: snapshot.key };
      this.tui.requestRender();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof DeepSeekAuthError) {
        this.authDisabled = true;
        this.notifyOnce("auth", "inline-complete: DeepSeek rejected DEEPSEEK_API_KEY; predictions paused.", "error");
        return;
      }
      this.backoffUntil = Date.now() + this.backoffMs;
    } finally {
      clearTimeout(timeout);
      if (this.abortController === controller) {
        this.abortController = undefined;
      }
    }
  }

  private abortPendingRequest(): void {
    this.requestId++;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  private notifyOnce(key: string, message: string, level: "info" | "warning" | "error"): void {
    if (this.notified.has(key)) return;
    this.notified.add(key);
    this.ctx.ui.notify(message, level);
  }
}

export function installInlineCompletion(ctx: ExtensionContext, predictionService: PredictionService = new DeepSeekFimClient()): void {
  if (!ctx.hasUI) return;

  ctx.ui.setEditorComponent((tui, theme, keybindings) =>
    new InlineCompletionEditor(tui, theme, keybindings, ctx, predictionService),
  );
}
