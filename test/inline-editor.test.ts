import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import type { ExtensionContext, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
  EditorTheme,
  TUI,
} from "@mariozechner/pi-tui";

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

function createDropdownTheme(): EditorTheme {
  const identity = (text: string) => text;
  return {
    borderColor: identity,
    selectList: {
      selectedPrefix: identity,
      selectedText: identity,
      description: identity,
      scrollInfo: identity,
      noMatch: identity,
    },
  };
}

class FakeSlashAutocompleteProvider implements AutocompleteProvider {
  async getSuggestions(): Promise<AutocompleteSuggestions | null> {
    return { items: [{ value: "/settings", label: "/settings" }], prefix: "/sett" };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ) {
    const line = lines[cursorLine] ?? "";
    lines[cursorLine] = line.slice(0, cursorCol - prefix.length) + item.value + line.slice(cursorCol);
    return { lines, cursorLine, cursorCol: cursorCol - prefix.length + item.value.length };
  }
}

function createEditorWithSlashDropdown(
  theme: EditorTheme,
): InlineCompletionEditor {
  const editor = new InlineCompletionEditor(
    createTui(),
    theme,
    createKeybindings(),
    createContext(),
    new FakePredictionService(),
    { autoRequest: false },
  );
  editor.setAutocompleteProvider(new FakeSlashAutocompleteProvider());
  return editor;
}

async function openSlashDropdown(editor: InlineCompletionEditor): Promise<void> {
  for (const ch of "/sett") {
    editor.handleInput(ch);
  }
  await delay(5);
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

test("Tab confirms the native autocomplete selection instead of accepting ghost text while the dropdown is showing", async () => {
  const editor = createEditorWithSlashDropdown(createDropdownTheme());
  await openSlashDropdown(editor);

  assert.equal(editor.isShowingAutocomplete(), true);

  editor.setPredictionForTest("up");
  editor.render(40);
  editor.handleInput("\t");

  // The ghost "up" must NOT be accepted; pi's dropdown selection wins.
  assert.equal(editor.getText(), "/settings");
});

test("render hides ghost text while the native autocomplete dropdown is showing", async () => {
  const editor = createEditorWithSlashDropdown(createDropdownTheme());
  await openSlashDropdown(editor);

  editor.setPredictionForTest("up");
  const rendered = editor.render(40).join("\n");

  assert.doesNotMatch(rendered, /\x1b\[2mup\x1b\[22m/);
});

test("ghost text is hidden while the dropdown shows and reappears after it is dismissed without a text change", async () => {
  const editor = createEditorWithSlashDropdown(createDropdownTheme());
  await openSlashDropdown(editor);

  editor.setPredictionForTest("up");

  // Hidden while the native dropdown owns the Tab key.
  assert.doesNotMatch(editor.render(40).join("\n"), /\x1b\[2mup\x1b\[22m/);

  // Escape cancels the dropdown without changing the text; the still-valid
  // prediction becomes visible again.
  editor.handleInput("\x1b");
  const rendered = editor.render(40).join("\n");

  assert.match(rendered, /\x1b\[2mup\x1b\[22m/);
});


