# Pi 输入框 Inline Completion 实现计划

> **给 agentic workers：** 必须使用子技能：执行本计划时请使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。每个步骤都使用 checkbox（`- [ ]`）语法，便于逐项跟踪。

**目标：** 构建一个可分发的 pi package，为 pi 的交互式输入框加入基于 DeepSeek 的 inline ghost-text 预测补全能力。

**架构：** 这个 package 暴露一个 pi extension，在 `session_start` 时安装一个 `CustomEditor` 子类。纯 helper 模块负责光标拆分、上下文构造、DeepSeek FIM 调用和 ghost-text 渲染；editor 模块负责编排 debounce、请求取消、过期结果丢弃和 `Tab` 接受预测。

**技术栈：** TypeScript 源码由 pi 通过 jiti 加载，pi extension API，`@mariozechner/pi-coding-agent`，`@mariozechner/pi-tui`，DeepSeek beta FIM completions API，Node 内置 test runner，通过 `tsx` 运行测试。

---

## 范围检查

已批准的 spec 只覆盖一个子系统：inline completion pi package。不需要拆成多个相互独立的实现计划。

## 文件结构

- 创建 `package.json`：package 元数据、pi manifest、peer dependencies 和开发脚本。
- 创建 `tsconfig.json`：用于直接加载 `.ts` 源码 import 的严格 TypeScript 配置。
- 创建 `.gitignore`：忽略 package 安装/构建产物和环境文件。
- 创建 `extensions/inline-complete.ts`：pi extension 入口；在 `session_start` 时注册 editor 安装逻辑。
- 创建 `src/config.ts`：DeepSeek endpoint、模型、debounce、timeout、token 限制等常量。
- 创建 `src/types.ts`：光标快照和预测服务的小型共享类型。
- 创建 `src/text.ts`：光标拆分、snapshot key、输入阈值判断、suffix 去重、响应清洗等纯 helper。
- 创建 `src/context.ts`：从最近 pi 对话中提取文本并构造 FIM prompt 的纯 helper。
- 创建 `src/deepseek.ts`：DeepSeek FIM client，包含明确的鉴权错误和瞬时错误类型。
- 创建 `src/ghost-render.ts`：保守的渲染 helper，把 dim ghost text 插入 pi editor 渲染行。
- 创建 `src/inline-editor.ts`：`InlineCompletionEditor` 和 `installInlineCompletion()` 编排逻辑。
- 创建 `test/*.test.ts`：纯 helper、DeepSeek client、ghost renderer、editor `Tab` 接受行为的单元测试。
- 创建 `README.md`：安装、环境变量、行为说明、隐私边界和验证说明。

---

### 任务 1：搭建 package 元数据和测试框架

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`.gitignore`
- 创建：`src/config.ts`
- 创建：`test/smoke.test.ts`

- [ ] **步骤 1：创建 package 元数据**

创建 `package.json`，内容如下：

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

- [ ] **步骤 2：创建 TypeScript 配置**

创建 `tsconfig.json`，内容如下：

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

- [ ] **步骤 3：创建忽略规则**

创建 `.gitignore`，内容如下：

```gitignore
node_modules/
package-lock.json
.DS_Store
.env
*.log
dist/
coverage/
```

- [ ] **步骤 4：创建运行时常量**

创建 `src/config.ts`，内容如下：

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

- [ ] **步骤 5：创建 smoke test**

创建 `test/smoke.test.ts`，内容如下：

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_MODEL } from "../src/config.ts";

test("test harness loads TypeScript modules", () => {
  assert.equal(DEEPSEEK_MODEL, "deepseek-v4-flash");
});
```

- [ ] **步骤 6：安装开发依赖**

运行：

```bash
npm install
```

预期：命令以 code 0 退出并创建 `node_modules/`。如果生成了 `package-lock.json`，保持不跟踪，因为 `.gitignore` 会排除它。

- [ ] **步骤 7：运行 smoke 验证**

运行：

```bash
npm run check
```

预期：`tsc --noEmit` 退出码为 0，smoke test 通过。

- [ ] **步骤 8：提交 scaffold**

运行：

```bash
git add package.json tsconfig.json .gitignore src/config.ts test/smoke.test.ts
git commit -m "chore: scaffold inline completion package"
```

预期：提交成功。

---

### 任务 2：用 TDD 实现光标和补全文本 helper

**文件：**
- 创建：`src/types.ts`
- 创建：`src/text.ts`
- 创建：`test/text.test.ts`

- [ ] **步骤 1：编写失败的文本 helper 测试**

创建 `test/text.test.ts`，内容如下：

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

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- test/text.test.ts
```

预期：失败，因为 `src/text.ts` 和 `src/types.ts` 尚不存在。

- [ ] **步骤 3：创建共享类型**

创建 `src/types.ts`，内容如下：

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

- [ ] **步骤 4：实现文本 helper**

创建 `src/text.ts`，内容如下：

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

- [ ] **步骤 5：运行文本 helper 测试**

运行：

```bash
npm test -- test/text.test.ts
```

预期：`test/text.test.ts` 中所有测试通过。

- [ ] **步骤 6：运行完整检查**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 7：提交文本 helper**

运行：

```bash
git add src/types.ts src/text.ts test/text.test.ts
git commit -m "feat: add completion text helpers"
```

预期：提交成功。

---

### 任务 3：用 TDD 实现最近对话上下文 helper

**文件：**
- 创建：`src/context.ts`
- 创建：`test/context.test.ts`

- [ ] **步骤 1：编写失败的上下文测试**

创建 `test/context.test.ts`，内容如下：

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

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- test/context.test.ts
```

预期：失败，因为 `src/context.ts` 尚不存在。

- [ ] **步骤 3：实现上下文 helper**

创建 `src/context.ts`，内容如下：

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

- [ ] **步骤 4：运行上下文测试**

运行：

```bash
npm test -- test/context.test.ts
```

预期：`test/context.test.ts` 中所有测试通过。

- [ ] **步骤 5：运行完整检查**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 6：提交上下文 helper**

运行：

```bash
git add src/context.ts test/context.test.ts
git commit -m "feat: build inline completion context"
```

预期：提交成功。

---

### 任务 4：用 TDD 实现 DeepSeek FIM client

**文件：**
- 创建：`src/deepseek.ts`
- 创建：`test/deepseek.test.ts`

- [ ] **步骤 1：编写失败的 DeepSeek client 测试**

创建 `test/deepseek.test.ts`，内容如下：

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

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- test/deepseek.test.ts
```

预期：失败，因为 `src/deepseek.ts` 尚不存在。

- [ ] **步骤 3：实现 DeepSeek client**

创建 `src/deepseek.ts`，内容如下：

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

- [ ] **步骤 4：运行 DeepSeek 测试**

运行：

```bash
npm test -- test/deepseek.test.ts
```

预期：`test/deepseek.test.ts` 中所有测试通过。

- [ ] **步骤 5：运行完整检查**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 6：提交 DeepSeek client**

运行：

```bash
git add src/deepseek.ts test/deepseek.test.ts
git commit -m "feat: add DeepSeek FIM client"
```

预期：提交成功。

---

### 任务 5：用 TDD 实现 ghost-text 渲染 helper

**文件：**
- 创建：`src/ghost-render.ts`
- 创建：`test/ghost-render.test.ts`

- [ ] **步骤 1：编写失败的 ghost-render 测试**

创建 `test/ghost-render.test.ts`，内容如下：

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

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- test/ghost-render.test.ts
```

预期：失败，因为 `src/ghost-render.ts` 尚不存在。

- [ ] **步骤 3：实现 ghost render helper**

创建 `src/ghost-render.ts`，内容如下：

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

- [ ] **步骤 4：运行 ghost-render 测试**

运行：

```bash
npm test -- test/ghost-render.test.ts
```

预期：`test/ghost-render.test.ts` 中所有测试通过。

- [ ] **步骤 5：运行完整检查**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 6：提交 ghost renderer**

运行：

```bash
git add src/ghost-render.ts test/ghost-render.test.ts
git commit -m "feat: render inline ghost text"
```

预期：提交成功。

---

### 任务 6：实现 pi editor 集成和 extension 入口

**文件：**
- 创建：`src/inline-editor.ts`
- 创建：`extensions/inline-complete.ts`
- 创建：`test/inline-editor.test.ts`

- [ ] **步骤 1：编写失败的 editor 集成测试**

创建 `test/inline-editor.test.ts`，内容如下：

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

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- test/inline-editor.test.ts
```

预期：失败，因为 `src/inline-editor.ts` 尚不存在。

- [ ] **步骤 3：实现 editor 集成**

创建 `src/inline-editor.ts`，内容如下：

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

- [ ] **步骤 4：创建 extension 入口**

创建 `extensions/inline-complete.ts`，内容如下：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installInlineCompletion } from "../src/inline-editor.ts";

export default function inlineCompleteExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    installInlineCompletion(ctx);
  });
}
```

- [ ] **步骤 5：运行 editor 集成测试**

运行：

```bash
npm test -- test/inline-editor.test.ts
```

预期：`test/inline-editor.test.ts` 中所有测试通过。

- [ ] **步骤 6：运行完整检查**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 7：提交 editor 集成**

运行：

```bash
git add src/inline-editor.ts extensions/inline-complete.ts test/inline-editor.test.ts
git commit -m "feat: install inline completion editor"
```

预期：提交成功。

---

### 任务 7：补充 README 并执行 package 验证

**文件：**
- 创建：`README.md`
- 修改：`package.json`

- [ ] **步骤 1：编写 README**

创建 `README.md`，内容如下：

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

- [ ] **步骤 2：添加 Node engine 元数据**

修改 `package.json`，在 `license` 后添加稳定的 `engines` 字段，并保留任务 1 中已有的所有字段：

```json
"engines": {
  "node": ">=20"
},
```

提交前必须确保 `package.json` 是合法 JSON。

- [ ] **步骤 3：运行完整自动验证**

运行：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] **步骤 4：验证 pi 可以发现 package manifest**

运行：

```bash
node -e "const pkg=require('./package.json'); if (!pkg.pi?.extensions?.includes('./extensions/inline-complete.ts')) process.exit(1); console.log('pi manifest ok')"
```

预期输出：

```text
pi manifest ok
```

- [ ] **步骤 5：手动验证缺少 API key 时的行为**

运行：

```bash
unset DEEPSEEK_API_KEY
pi -e .
```

预期：pi 成功启动。输入至少 3 个非空白字符并暂停。输入框保持可用，extension 最多只提示一次需要 `DEEPSEEK_API_KEY`。完成后退出 pi。

- [ ] **步骤 6：使用 DeepSeek API key 手动验证**

运行：

```bash
test -n "$DEEPSEEK_API_KEY"
pi -e .
```

预期：`test -n` 命令成功，然后 pi 成功启动。输入一段 prompt，暂停约 600 ms，看到 dim 预测文本，按 `Tab`，确认预测内容插入到光标位置。把光标移动到 draft 中间，再暂停并确认 `Tab` 会把返回文本插入当前光标位置。完成后退出 pi。

- [ ] **步骤 7：提交 README 和验证元数据**

运行：

```bash
git add README.md package.json
git commit -m "docs: document inline completion package"
```

预期：提交成功。

---

## 完成前最终验证

- [ ] 运行自动检查：

```bash
npm run check
```

预期：typecheck 和所有测试通过。

- [ ] 检查 git 历史：

```bash
git log --oneline --decorate -8
```

预期：包含 scaffold、text helpers、context helpers、DeepSeek client、ghost renderer、editor integration、README 的提交。

- [ ] 检查工作区：

```bash
git status --short
```

预期：没有非预期改动。可能存在本地 `package-lock.json`，它应保持被忽略。

- [ ] 在最终回复中记录手动验证结果，包括是否运行了带 `DEEPSEEK_API_KEY` 的验证。

## Plan 自检

Spec 覆盖情况：

- 可分发 pi package：任务 1 和任务 7。
- `DEEPSEEK_API_KEY` 和 `deepseek-v4-flash`：任务 1 和任务 4。
- FIM prompt/suffix 流程：任务 3 和任务 4。
- 当前输入框文本 + 最近对话上下文：任务 2、任务 3 和任务 6。
- Debounced prediction、过期结果丢弃、abort、backoff 和鉴权处理：任务 6。
- 光标后的 ghost rendering：任务 5 和任务 6。
- 仅当存在预测时 `Tab` 优先于 autocomplete：任务 6。
- README 隐私边界和限制：任务 7。
- 自动和手动验证：任务 2-7，加上最终验证。

占位符扫描：本计划包含明确的文件路径、命令、预期结果和代码块。没有依赖未定义函数，也没有延后实现细节。

类型一致性：`PredictionService`、`PredictionRequest`、`EditorSnapshot`、`InlineCompletionEditor`、`DeepSeekFimClient` 和 helper 函数名都在后续任务使用之前已经定义。
