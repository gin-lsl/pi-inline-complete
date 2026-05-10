import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtensionContext, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

import { InlineCompletionEditor } from "../src/inline-editor.ts";
import type { PredictionRequest, PredictionService } from "../src/types.ts";

class FakePredictionService implements PredictionService {
  requests: PredictionRequest[] = [];

  async complete(request: PredictionRequest): Promise<string | undefined> {
    this.requests.push(request);
    return " predicted";
  }
}

function createTui(): TUI {
  return {
    terminal: { rows: 24, cols: 80 },
    requestRender() {},
  } as unknown as TUI;
}

function createTheme(): EditorTheme {
  return {
    borderColor: (text: string) => text,
    selectList: {} as EditorTheme["selectList"],
  };
}

function createKeybindings(): KeybindingsManager {
  return {
    matches(data: string, action: string) {
      return action === "tui.input.tab" && data === "\t";
    },
    getKeys(action: string) {
      return action === "tui.input.submit" ? ["enter"] : [];
    },
  } as unknown as KeybindingsManager;
}

function createContext(): ExtensionContext {
  return {
    hasUI: true,
    cwd: process.cwd(),
    isIdle: () => true,
    sessionManager: { getBranch: () => [] },
    ui: {
      notify() {},
      theme: { fg: (_color: string, text: string) => `\x1b[2m${text}\x1b[22m` },
    },
  } as unknown as ExtensionContext;
}

test("Tab accepts a valid prediction before native autocomplete", () => {
  const editor = new InlineCompletionEditor(
    createTui(),
    createTheme(),
    createKeybindings(),
    createContext(),
    new FakePredictionService(),
    { autoRequest: false },
  );

  editor.setText("hello");
  editor.setPredictionForTest(" world");
  editor.handleInput("\t");

  assert.equal(editor.getText(), "hello world");
});

test("render includes dim ghost text for a valid prediction", () => {
  const editor = new InlineCompletionEditor(
    createTui(),
    createTheme(),
    createKeybindings(),
    createContext(),
    new FakePredictionService(),
    { autoRequest: false },
  );

  editor.setText("hello");
  editor.setPredictionForTest(" world");
  const rendered = editor.render(40).join("\n");

  assert.match(rendered, /\x1b\[2m world\x1b\[22m/);
});
