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

test("cleanCompletion removes markdown fences with trailing whitespace", () => {
  assert.equal(cleanCompletion("```text\nhello\n```\n", ""), "hello");
  assert.equal(cleanCompletion("```text\nhello\n```  \n", ""), "hello");
});

test("cleanCompletion removes Sure prefix without stripping indentation", () => {
  assert.equal(cleanCompletion("Sure:\n  hello", ""), "  hello");
});

test("cleanCompletion removes Here is prefix without stripping indentation", () => {
  assert.equal(cleanCompletion("Here is the completion:\n  hello", ""), "  hello");
});

test("cleanCompletion drops whitespace-only responses", () => {
  assert.equal(cleanCompletion("\n   \n", ""), undefined);
});

test("removeSuffixOverlap removes text already present after cursor", () => {
  assert.equal(removeSuffixOverlap(" world", " world and more"), "");
  assert.equal(removeSuffixOverlap(" brave new", " new prompt"), " brave");
});

test("removeSuffixOverlap removes overlaps longer than 200 characters", () => {
  const overlap = "x".repeat(250);

  assert.equal(removeSuffixOverlap(`prefix-${overlap}`, `${overlap}-suffix`), "prefix-");
});

test("cleanCompletion applies suffix overlap removal", () => {
  assert.equal(cleanCompletion(" world", " world"), undefined);
});
