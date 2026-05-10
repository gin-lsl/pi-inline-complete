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

test("buildRecentConversationContext ignores malformed branch entries", () => {
  const entries = [
    null,
    undefined,
    42,
    "not an entry",
    { type: "message" },
    { type: "message", message: null },
    { type: "message", message: { role: "user" } },
    { type: "message", message: { role: "assistant", content: [{ type: "text" }] } },
    { type: "message", message: { role: "user", content: "valid request" } },
  ];
  let context = "";

  assert.doesNotThrow(() => {
    context = buildRecentConversationContext(entries);
  });
  assert.match(context, /User: valid request/);
});

test("buildRecentConversationContext returns empty context for zero limits", () => {
  assert.equal(buildRecentConversationContext(branch, { maxMessages: 0 }), "");
  assert.equal(buildRecentConversationContext(branch, { maxChars: 0 }), "");
});

test("buildRecentConversationContext returns empty context for invalid limits", () => {
  assert.equal(buildRecentConversationContext(branch, { maxMessages: -1 }), "");
  assert.equal(buildRecentConversationContext(branch, { maxChars: -1 }), "");
  assert.equal(buildRecentConversationContext(branch, { maxMessages: Number.NaN }), "");
  assert.equal(buildRecentConversationContext(branch, { maxChars: Number.NaN }), "");
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
