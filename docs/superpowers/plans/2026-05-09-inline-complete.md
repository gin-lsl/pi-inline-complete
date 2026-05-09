# Inline Completion Pi Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a distributable pi package that adds DeepSeek-powered inline ghost-text predictions to pi's interactive input editor.

**Architecture:** The package exposes one pi extension that installs a `CustomEditor` subclass on `session_start`. Pure helper modules handle cursor splitting, context construction, DeepSeek FIM calls, and ghost-text rendering; the editor module orchestrates debounce, request cancellation, stale result rejection, and `Tab` acceptance.

**Tech Stack:** TypeScript source loaded by pi via jiti, pi extension API, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, DeepSeek beta FIM completions API, Node built-in test runner through `tsx`.

---

## Scope Check

The approved spec covers one subsystem: an inline completion pi package. It does not require separate plans for independent subsystems.

## File Structure

- Create `package.json`: package metadata, pi manifest, peer dependencies, and dev scripts.
- Create `tsconfig.json`: strict TypeScript config for source-loaded `.ts` imports.
- Create `.gitignore`: ignores package install/build artifacts and environment files.
- Create `extensions/inline-complete.ts`: pi extension entrypoint; registers editor installation on `session_start`.
- Create `src/config.ts`: constants for DeepSeek endpoint, model, debounce, timeout, and token limits.
- Create `src/types.ts`: small shared types for cursor snapshots and prediction services.
- Create `src/text.ts`: pure helpers for cursor splitting, snapshot keys, input threshold checks, suffix deduplication, and response cleaning.
- Create `src/context.ts`: pure helpers for extracting recent pi conversation text and building the FIM prompt.
- Create `src/deepseek.ts`: DeepSeek FIM client with explicit auth/transient error classes.
- Create `src/ghost-render.ts`: conservative renderer helper that inserts dim ghost text into pi editor render lines.
- Create `src/inline-editor.ts`: `InlineCompletionEditor` and `installInlineCompletion()` orchestration.
- Create `test/*.test.ts`: unit tests for pure helpers, DeepSeek client, ghost renderer, and editor `Tab` acceptance.
- Create `README.md`: installation, environment variable, behavior, privacy, and verification docs.

---

### Task 1: Scaffold package metadata and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/config.ts`
- Create: `test/smoke.test.ts`

- [ ] **Step 1: Create package metadata**

Create `package.json` with this content:

```json
{
  "name": "pi-inline-complete",
  "version": "0.1.0",
  "description": "DeepSeek-powered inline ghost-text completion for pi's interactive input editor.",
  "type": "module",
  "keywords": ["pi-package", "pi", "extension", "deepseek", "autocomplete"],
  "license": "MIT",
  "files": ["extensions", "src", "README.md"],
  "pi": {
    "extensions": ["./extensions/inline-complete.ts"]
  },
  "scripts": {
    "test": "tsx --test test/**/*.test.ts",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm test"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 2: Create TypeScript configuration**

Create `tsconfig.json` with this content:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["extensions/**/*.ts", "src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create ignore rules**

Create `.gitignore` with this content:

```gitignore
node_modules/
package-lock.json
.DS_Store
.env
*.log
dist/
coverage/
```

- [ ] **Step 4: Create runtime constants**

Create `src/config.ts` with this content:

```typescript
export const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";
export const DEEPSEEK_FIM_ENDPOINT = "https://api.deepseek.com/beta/completions";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_DEBOUNCE_MS = 600;
export const DEFAULT_MAX_TOKENS = 64;
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
export const DEFAULT_BACKOFF_MS = 30_000;
export const DEFAULT_MIN_NON_WHITESPACE = 3;
export const DEFAULT_RECENT_CONTEXT_CHARS = 4_000;
export const DEFAULT_RECENT_CONTEXT_MESSAGES = 8;
export const DEFAULT_MAX_COMPLETION_CHARS = 600;
```

- [ ] **Step 5: Create smoke test**

Create `test/smoke.test.ts` with this content:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_MODEL } from "../src/config.ts";

test("test harness loads TypeScript modules", () => {
  assert.equal(DEEPSEEK_MODEL, "deepseek-v4-flash");
});
```

- [ ] **Step 6: Install dev dependencies**

Run:

```bash
npm install
```

Expected: command exits with code 0 and creates `node_modules/`. If `package-lock.json` is created, leave it untracked because `.gitignore` excludes it for this source package.

- [ ] **Step 7: Run smoke verification**

Run:

```bash
npm run check
```

Expected: `tsc --noEmit` exits 0 and the smoke test passes.

- [ ] **Step 8: Commit scaffold**

Run:

```bash
git add package.json tsconfig.json .gitignore src/config.ts test/smoke.test.ts
git commit -m "chore: scaffold inline completion package"
```

Expected: commit succeeds.

---

### Task 2: Implement cursor and completion text helpers with TDD

**Files:**
- Create: `src/types.ts`
- Create: `src/text.ts`
- Create: `test/text.test.ts`

- [ ] **Step 1: Write failing text helper tests**

Create `test/text.test.ts` with this content:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanCompletion,
  hasEnoughInput,
  removeSuffixOverlap,
  snapshotKey,
  splitAtCursor,
} from "../src/text.ts";

test("splitAtCursor returns full text, before cursor, and after cursor", () => {
  const snapshot = splitAtCursor(["hello world", "next line"], { line: 0, col: 5 });

  assert.equal(snapshot.text, "hello world\nnext line");
  assert.equal(snapshot.beforeCursor, "hello");
  assert.equal(snapshot.afterCursor, " world\nnext line");
  assert.equal(snapshot.cursor.line, 0);
  assert.equal(snapshot.cursor.col, 5);
});

test("splitAtCursor clamps out-of-range cursor positions", () => {
  const snapshot = splitAtCursor(["abc"], { line: 99, col: 99 });

  assert.equal(snapshot.beforeCursor, "abc");
  assert.equal(snapshot.afterCursor, "");
  assert.equal(snapshot.cursor.line, 0);
  assert.equal(snapshot.cursor.col, 3);
});

test("snapshotKey changes when cursor changes", () => {
  assert.notEqual(snapshotKey("abc", { line: 0, col: 1 }), snapshotKey("abc", { line: 0, col: 2 }));
});

test("hasEnoughInput counts non-whitespace characters", () => {
  assert.equal(hasEnoughInput("  ab ", 3), false);
  assert.equal(hasEnoughInput("  abc ", 3), true);
});

test("cleanCompletion preserves intentional leading space", () => {
  assert.equal(cleanCompletion(" world", ""), " world");
});

test("cleanCompletion removes markdown fences", () => {
  assert.equal(cleanCompletion("```text\nhello\n```", ""), "hello");
});

test("cleanCompletion drops whitespace-only responses", () => {
  assert.equal(cleanCompletion("\n   \n", ""), undefined);
});

test("removeSuffixOverlap removes text already present after cursor", () => {
  assert.equal(removeSuffixOverlap(" world", " world and more"), "");
  assert.equal(removeSuffixOverlap(" brave new", " new prompt"), " brave");
});

test("cleanCompletion applies suffix overlap removal", () => {
  assert.equal(cleanCompletion(" world", " world"), undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- test/text.test.ts
```

Expected: FAIL because `src/text.ts` and `src/types.ts` do not exist.

- [ ] **Step 3: Create shared types**

Create `src/types.ts` with this content:

```typescript
export interface CursorPosition {
  line: number;
  col: number;
}

export interface EditorSnapshot {
  text: string;
  cursor: CursorPosition;
  beforeCursor: string;
  afterCursor: string;
  key: string;
}

export interface PredictionRequest {
  beforeCursor: string;
  afterCursor: string;
  recentContext: string;
}

export interface PredictionService {
  complete(request: PredictionRequest, signal: AbortSignal): Promise<string | undefined>;
}
```

- [ ] **Step 4: Implement text helpers**

Create `src/text.ts` with this content:

```typescript
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
```

- [ ] **Step 5: Run text helper tests**

Run:

```bash
npm test -- test/text.test.ts
```

Expected: PASS for all tests in `test/text.test.ts`.

- [ ] **Step 6: Run full check**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 7: Commit text helpers**

Run:

```bash
git add src/types.ts src/text.ts test/text.test.ts
git commit -m "feat: add completion text helpers"
```

Expected: commit succeeds.

---

### Task 3: Implement recent conversation context helpers with TDD

**Files:**
- Create: `src/context.ts`
- Create: `test/context.test.ts`

- [ ] **Step 1: Write failing context tests**

Create `test/context.test.ts` with this content:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFimPrompt, buildRecentConversationContext, contentToText } from "../src/context.ts";

const branch = [
  { type: "message", message: { role: "user", content: "请帮我写一个扩展" } },
  {
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "可以，我们先设计。" },
      ],
    },
  },
  { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "ignored" }] } },
  { type: "custom", customType: "state", data: { ignored: true } },
];

test("contentToText extracts string content", () => {
  assert.equal(contentToText("hello"), "hello");
});

test("contentToText extracts text blocks and ignores non-text blocks", () => {
  assert.equal(
    contentToText([
      { type: "thinking", thinking: "secret" },
      { type: "text", text: "visible" },
      { type: "toolCall", name: "bash" },
    ]),
    "visible",
  );
});

test("buildRecentConversationContext includes recent user and assistant text", () => {
  const context = buildRecentConversationContext(branch);

  assert.match(context, /^\[Recent conversation context\]/);
  assert.match(context, /User: 请帮我写一个扩展/);
  assert.match(context, /Assistant: 可以，我们先设计。/);
  assert.doesNotMatch(context, /ignored/);
});

test("buildRecentConversationContext respects message and character limits", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    type: "message",
    message: { role: index % 2 === 0 ? "user" : "assistant", content: `message-${index}` },
  }));

  const context = buildRecentConversationContext(entries, { maxMessages: 3, maxChars: 80 });

  assert.doesNotMatch(context, /message-0/);
  assert.match(context, /message-9/);
  assert.match(context, /message-10/);
  assert.match(context, /message-11/);
  assert.ok(context.length <= 108);
});

test("buildFimPrompt combines instruction, context, and current draft", () => {
  const prompt = buildFimPrompt("[Recent conversation context]\nUser: hi", "draft before cursor");

  assert.match(prompt, /Return only the text to insert/);
  assert.match(prompt, /\[Recent conversation context\]/);
  assert.match(prompt, /\[Current draft before cursor\]/);
  assert.match(prompt, /draft before cursor/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- test/context.test.ts
```

Expected: FAIL because `src/context.ts` does not exist.

- [ ] **Step 3: Implement context helpers**

Create `src/context.ts` with this content:

```typescript
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
```

- [ ] **Step 4: Run context tests**

Run:

```bash
npm test -- test/context.test.ts
```

Expected: PASS for all tests in `test/context.test.ts`.

- [ ] **Step 5: Run full check**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit context helpers**

Run:

```bash
git add src/context.ts test/context.test.ts
git commit -m "feat: build inline completion context"
```

Expected: commit succeeds.

---

### Task 4: Implement DeepSeek FIM client with TDD

**Files:**
- Create: `src/deepseek.ts`
- Create: `test/deepseek.test.ts`

- [ ] **Step 1: Write failing DeepSeek client tests**

Create `test/deepseek.test.ts` with this content:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_FIM_ENDPOINT, DEEPSEEK_MODEL } from "../src/config.ts";
import { DeepSeekAuthError, DeepSeekFimClient, DeepSeekTransientError, type FetchLike } from "../src/deepseek.ts";

test("DeepSeekFimClient sends an OpenAI-compatible FIM completion request", async () => {
  let capturedUrl = "";
  let capturedHeaders: Headers | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init.headers);
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ text: " world" }] }), { status: 200 });
  };

  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });
  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "[Recent conversation context]\nUser: hi" },
    new AbortController().signal,
  );

  assert.equal(capturedUrl, DEEPSEEK_FIM_ENDPOINT);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-test");
  assert.equal(capturedHeaders?.get("content-type"), "application/json");
  assert.equal(capturedBody?.model, DEEPSEEK_MODEL);
  assert.equal(capturedBody?.suffix, "");
  assert.equal(capturedBody?.max_tokens, 64);
  assert.equal(typeof capturedBody?.prompt, "string");
  assert.match(String(capturedBody?.prompt), /\[Current draft before cursor\]/);
  assert.equal(result, " world");
});

test("DeepSeekFimClient returns undefined without an API key", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new Error("fetch should not be called");
  };

  const client = new DeepSeekFimClient({ apiKey: "", fetch: fetchImpl });
  const result = await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal);

  assert.equal(result, undefined);
});

test("DeepSeekFimClient throws DeepSeekAuthError for 401 and 403", async () => {
  const fetchImpl: FetchLike = async () => new Response("bad key", { status: 401 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekAuthError,
  );
});

test("DeepSeekFimClient throws DeepSeekTransientError for rate limits", async () => {
  const fetchImpl: FetchLike = async () => new Response("rate limited", { status: 429 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekFimClient cleans suffix duplication from returned text", async () => {
  const fetchImpl: FetchLike = async () => new Response(JSON.stringify({ choices: [{ text: " world" }] }), { status: 200 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: " world", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(result, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- test/deepseek.test.ts
```

Expected: FAIL because `src/deepseek.ts` does not exist.

- [ ] **Step 3: Implement DeepSeek client**

Create `src/deepseek.ts` with this content:

```typescript
import { DEFAULT_MAX_TOKENS, DEEPSEEK_FIM_ENDPOINT, DEEPSEEK_MODEL } from "./config.ts";
import { buildFimPrompt } from "./context.ts";
import { cleanCompletion } from "./text.ts";
import type { PredictionRequest, PredictionService } from "./types.ts";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class DeepSeekAuthError extends Error {
  constructor(status: number, body: string) {
    super(`DeepSeek authentication failed (${status}): ${body}`);
    this.name = "DeepSeekAuthError";
  }
}

export class DeepSeekTransientError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`DeepSeek request failed (${status}): ${body}`);
    this.name = "DeepSeekTransientError";
    this.status = status;
  }
}

export interface DeepSeekFimClientOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  fetch?: FetchLike;
}

type DeepSeekCompletionResponse = {
  choices?: Array<{ text?: unknown }>;
};

export class DeepSeekFimClient implements PredictionService {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: DeepSeekFimClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.endpoint = options.endpoint ?? DEEPSEEK_FIM_ENDPOINT;
    this.model = options.model ?? DEEPSEEK_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async complete(request: PredictionRequest, signal: AbortSignal): Promise<string | undefined> {
    if (!this.apiKey) return undefined;

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: buildFimPrompt(request.recentContext, request.beforeCursor),
        suffix: request.afterCursor,
        max_tokens: this.maxTokens,
      }),
      signal,
    });

    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new DeepSeekAuthError(response.status, body);
    }
    if (!response.ok) {
      throw new DeepSeekTransientError(response.status, body);
    }

    const parsed = JSON.parse(body) as DeepSeekCompletionResponse;
    const rawText = parsed.choices?.[0]?.text;
    if (typeof rawText !== "string") return undefined;

    return cleanCompletion(rawText, request.afterCursor);
  }
}
```

- [ ] **Step 4: Run DeepSeek tests**

Run:

```bash
npm test -- test/deepseek.test.ts
```

Expected: PASS for all tests in `test/deepseek.test.ts`.

- [ ] **Step 5: Run full check**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit DeepSeek client**

Run:

```bash
git add src/deepseek.ts test/deepseek.test.ts
git commit -m "feat: add DeepSeek FIM client"
```

Expected: commit succeeds.

---

### Task 5: Implement ghost-text render helper with TDD

**Files:**
- Create: `src/ghost-render.ts`
- Create: `test/ghost-render.test.ts`

- [ ] **Step 1: Write failing ghost-render tests**

Create `test/ghost-render.test.ts` with this content:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { visibleWidth } from "@mariozechner/pi-tui";

import { insertGhostText } from "../src/ghost-render.ts";

const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

test("insertGhostText inserts ghost text after the fake cursor block", () => {
  const lines = ["hello\x1b[7m \x1b[0m       "];
  const result = insertGhostText(lines, " world", 20, dim);

  assert.match(result[0] ?? "", /\x1b\[2m world\x1b\[22m/);
  assert.ok(visibleWidth(result[0] ?? "") <= 20);
});

test("insertGhostText returns original lines when no cursor block exists", () => {
  const lines = ["hello world"];
  const result = insertGhostText(lines, " ghost", 20, dim);

  assert.deepEqual(result, lines);
});

test("insertGhostText only displays the first prediction line", () => {
  const lines = ["hello\x1b[7m \x1b[0m       "];
  const result = insertGhostText(lines, " first\nsecond", 30, dim);

  assert.match(result[0] ?? "", / first/);
  assert.doesNotMatch(result[0] ?? "", /second/);
});

test("insertGhostText truncates long ghost text to the available width", () => {
  const lines = ["hello\x1b[7m \x1b[0m"];
  const result = insertGhostText(lines, " very long prediction", 10, dim);

  assert.ok(visibleWidth(result[0] ?? "") <= 10);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- test/ghost-render.test.ts
```

Expected: FAIL because `src/ghost-render.ts` does not exist.

- [ ] **Step 3: Implement ghost render helper**

Create `src/ghost-render.ts` with this content:

```typescript
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
```

- [ ] **Step 4: Run ghost-render tests**

Run:

```bash
npm test -- test/ghost-render.test.ts
```

Expected: PASS for all tests in `test/ghost-render.test.ts`.

- [ ] **Step 5: Run full check**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit ghost renderer**

Run:

```bash
git add src/ghost-render.ts test/ghost-render.test.ts
git commit -m "feat: render inline ghost text"
```

Expected: commit succeeds.

---

### Task 6: Implement pi editor integration and extension entrypoint

**Files:**
- Create: `src/inline-editor.ts`
- Create: `extensions/inline-complete.ts`
- Create: `test/inline-editor.test.ts`

- [ ] **Step 1: Write failing editor integration tests**

Create `test/inline-editor.test.ts` with this content:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- test/inline-editor.test.ts
```

Expected: FAIL because `src/inline-editor.ts` does not exist.

- [ ] **Step 3: Implement editor integration**

Create `src/inline-editor.ts` with this content:

```typescript
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
  private readonly keybindings: KeybindingsManager;
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
    this.keybindings = keybindings;
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
    if (this.hasValidPrediction() && this.keybindings.matches(data, "tui.input.tab")) {
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
```

- [ ] **Step 4: Create extension entrypoint**

Create `extensions/inline-complete.ts` with this content:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installInlineCompletion } from "../src/inline-editor.ts";

export default function inlineCompleteExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    installInlineCompletion(ctx);
  });
}
```

- [ ] **Step 5: Run editor integration tests**

Run:

```bash
npm test -- test/inline-editor.test.ts
```

Expected: PASS for all tests in `test/inline-editor.test.ts`.

- [ ] **Step 6: Run full check**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 7: Commit editor integration**

Run:

```bash
git add src/inline-editor.ts extensions/inline-complete.ts test/inline-editor.test.ts
git commit -m "feat: install inline completion editor"
```

Expected: commit succeeds.

---

### Task 7: Add README and perform package verification

**Files:**
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write README**

Create `README.md` with this content:

```markdown
# pi-inline-complete

DeepSeek-powered inline ghost-text completion for pi's interactive input editor.

When you pause typing in pi, this extension sends the current draft plus recent conversation context to DeepSeek's beta FIM completion API. The returned text appears after the cursor in dim ghost text. Press `Tab` to accept the prediction. If no prediction is visible, `Tab` keeps pi's normal slash/path autocomplete behavior.

## Install

From a local checkout:

```bash
pi install "$(pwd)"
```

For development without installing:

```bash
pi -e "$(pwd)"
```

After publishing to npm or pushing to git, install the npm or git package source with `pi install`.

## Configuration

Set `DEEPSEEK_API_KEY` to your actual DeepSeek API key before starting pi.

The first version uses fixed runtime settings:

- Model: `deepseek-v4-flash`
- Endpoint: `https://api.deepseek.com/beta/completions`
- Debounce: 600 ms
- Max completion length: 64 tokens
- Request timeout: 8 seconds

## Behavior

- Predictions trigger after typing, deletion, paste, newline insertion, or cursor movement, once input has at least 3 non-whitespace characters.
- Pending requests are aborted when the editor changes.
- Stale responses are discarded.
- `Tab` accepts a visible prediction before invoking native autocomplete.
- Without a visible prediction, pi's native autocomplete still handles `Tab`.
- The extension only runs in interactive UI sessions.

## Privacy

Data sent to DeepSeek:

- Current pi input editor text.
- Recent user and assistant text from the active pi session.

Data not sent to DeepSeek:

- Project files that are not already in the conversation.
- Arbitrary local files.
- Git metadata or command output unless already present in the conversation.

## Development

Install dependencies:

```bash
npm install
```

Run verification:

```bash
npm run check
```

Manual interactive verification:

```bash
test -n "$DEEPSEEK_API_KEY"
pi -e "$(pwd)"
```

Then type a prompt, pause for about 600 ms, confirm dim text appears after the cursor, and press `Tab` to accept it.
```

- [ ] **Step 2: Add Node engine metadata**

Modify `package.json` to add a stable `engines` field after `license`, preserving all existing fields from Task 1:

```json
"engines": {
  "node": ">=20"
},
```

The committed `package.json` must be valid JSON.

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] **Step 4: Verify pi can discover the package manifest**

Run:

```bash
node -e "const pkg=require('./package.json'); if (!pkg.pi?.extensions?.includes('./extensions/inline-complete.ts')) process.exit(1); console.log('pi manifest ok')"
```

Expected output:

```text
pi manifest ok
```

- [ ] **Step 5: Manual interactive verification with missing API key**

Run:

```bash
unset DEEPSEEK_API_KEY
pi -e .
```

Expected: pi starts successfully. Type at least three non-whitespace characters and pause. The editor remains usable, and the extension shows at most one warning that `DEEPSEEK_API_KEY` is required. Exit pi after this check.

- [ ] **Step 6: Manual interactive verification with DeepSeek API key**

Run:

```bash
test -n "$DEEPSEEK_API_KEY"
pi -e .
```

Expected: the `test -n` command succeeds, then pi starts successfully. Type a prompt, pause for about 600 ms, see dim prediction text, press `Tab`, and confirm the prediction is inserted at the cursor. Move the cursor into the middle of the draft, pause again, and confirm `Tab` inserts the returned text at the current cursor position. Exit pi after this check.

- [ ] **Step 7: Commit README and verification metadata**

Run:

```bash
git add README.md package.json
git commit -m "docs: document inline completion package"
```

Expected: commit succeeds.

---

## Final Verification Before Completion

- [ ] Run automated checks:

```bash
npm run check
```

Expected: typecheck and all tests pass.

- [ ] Inspect git history:

```bash
git log --oneline --decorate -8
```

Expected: includes commits for scaffold, text helpers, context helpers, DeepSeek client, ghost renderer, editor integration, and README.

- [ ] Inspect working tree:

```bash
git status --short
```

Expected: no unexpected changes. A local `package-lock.json` may exist and remain ignored.

- [ ] Record manual verification results in the final response, including whether `DEEPSEEK_API_KEY` verification was run.

## Plan Self-Review

Spec coverage:

- Distributable pi package: Tasks 1 and 7.
- `DEEPSEEK_API_KEY` and `deepseek-v4-flash`: Tasks 1 and 4.
- FIM prompt/suffix flow: Tasks 3 and 4.
- Current editor text plus recent conversation context: Tasks 2, 3, and 6.
- Debounced prediction, stale result rejection, aborts, backoff, and auth handling: Task 6.
- Ghost rendering after cursor: Task 5 and Task 6.
- `Tab` priority over autocomplete only when prediction exists: Task 6.
- README privacy boundary and limitations: Task 7.
- Automated and manual verification: Tasks 2-7 plus Final Verification.

Placeholder scan: The plan contains concrete file paths, commands, expected results, and code blocks. It does not require undefined functions or deferred implementation details.

Type consistency: `PredictionService`, `PredictionRequest`, `EditorSnapshot`, `InlineCompletionEditor`, `DeepSeekFimClient`, and helper function names are introduced before they are used by later tasks.
