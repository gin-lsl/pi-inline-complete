import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
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

function createContext(notifications: string[] = []): ExtensionContext {
  return {
    hasUI: true,
    cwd: process.cwd(),
    isIdle: () => true,
    sessionManager: { getBranch: () => [] },
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
      theme: { fg: (_color: string, text: string) => `\x1b[2m${text}\x1b[22m` },
    },
  } as unknown as ExtensionContext;
}

test("Tab accepts a visible valid prediction before native autocomplete", () => {
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
  editor.render(40);
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

test("Tab does not accept a prediction that was not visibly rendered", () => {
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
  editor.render(1);
  editor.handleInput("\t");

  assert.equal(editor.getText(), "hello");
});

test("injected prediction service can auto-request without DEEPSEEK_API_KEY", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    const service = new FakePredictionService();
    const editor = new InlineCompletionEditor(
      createTui(),
      createTheme(),
      createKeybindings(),
      createContext(),
      service,
      { debounceMs: 1 },
    );

    editor.setText("hello");
    await delay(20);

    assert.equal(service.requests.length, 1);
    editor.render(60);
    editor.handleInput("\t");
    assert.equal(editor.getText(), "hello predicted");
  } finally {
    if (previousKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = previousKey;
    }
  }
});

test("too-short input does not notify about missing DEEPSEEK_API_KEY", () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    const notifications: string[] = [];
    const editor = new InlineCompletionEditor(
      createTui(),
      createTheme(),
      createKeybindings(),
      createContext(notifications),
      new FakePredictionService(),
      { requireDeepSeekApiKey: true },
    );

    editor.setText("ab");

    assert.deepEqual(notifications, []);
  } finally {
    if (previousKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = previousKey;
    }
  }
});
