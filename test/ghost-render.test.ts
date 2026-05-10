import assert from "node:assert/strict";
import { test } from "node:test";

import { visibleWidth } from "@mariozechner/pi-tui";

import { insertGhostText } from "../src/ghost-render.ts";

const cursor = "\x1b[7m \x1b[0m";
const cursorOverT = "\x1b[7mt\x1b[0m";
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;
const ansiSequencePattern = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const stripAnsi = (text: string) => text.replace(ansiSequencePattern, "");

test("insertGhostText inserts ghost text after the fake cursor block", () => {
  const lines = [`hello${cursor}       `];
  const original = [...lines];

  const result = insertGhostText(lines, " world", 20, dim);

  assert.notStrictEqual(result, lines);
  assert.deepEqual(lines, original);
  assert.match(result[0] ?? "", /\x1b\[2m world\x1b\[22m/);
  assert.ok(visibleWidth(result[0] ?? "") <= 20);
});

test("insertGhostText returns original lines when no cursor block exists", () => {
  const lines = ["hello world"];
  const result = insertGhostText(lines, " ghost", 20, dim);

  assert.deepEqual(result, lines);
});

test("insertGhostText returns original lines when cursor start has no reset", () => {
  const lines = ["hello\x1b[7m "];
  const result = insertGhostText(lines, " ghost", 20, dim);

  assert.strictEqual(result, lines);
  assert.deepEqual(result, ["hello\x1b[7m "]);
});

test("insertGhostText only displays the first prediction line", () => {
  const lines = [`hello${cursor}       `];
  const result = insertGhostText(lines, " first\nsecond", 30, dim);

  assert.match(result[0] ?? "", / first/);
  assert.doesNotMatch(result[0] ?? "", /second/);
});

test("insertGhostText truncates long ghost text to the available width", () => {
  const lines = [`hello${cursor}`];
  const result = insertGhostText(lines, " very long prediction", 10, dim);

  assert.match(result[0] ?? "", /\x1b\[2m ver\x1b\[22m/);
  assert.doesNotMatch(result[0] ?? "", /\x1b\[2m very/);
  assert.ok(visibleWidth(result[0] ?? "") <= 10);
});

test("insertGhostText preserves suffix text by returning the original line when no padding can be reused", () => {
  const lines = [`hello${cursor}tail`];
  const result = insertGhostText(lines, " ghost", visibleWidth(lines[0] ?? "") + 5, dim);

  assert.strictEqual(result, lines);
  assert.deepEqual(result, [`hello${cursor}tail`]);
});

test("insertGhostText inserts ghost text before suffix text using trailing padding", () => {
  const lines = [`hello${cursor}tail      `];
  const result = insertGhostText(lines, " ++", visibleWidth(lines[0] ?? ""), dim);

  assert.notStrictEqual(result, lines);
  assert.match(result[0] ?? "", /\x1b\[2m \+\+\x1b\[22mtail/);
  assert.match(result[0] ?? "", /tail/);
  assert.ok(visibleWidth(result[0] ?? "") <= visibleWidth(lines[0] ?? ""));
});

test("insertGhostText inserts ghost text before a highlighted suffix character", () => {
  const lines = [`hello${cursorOverT}ail       `];
  const result = insertGhostText(lines, " ghost", visibleWidth(lines[0] ?? ""), dim);
  const rendered = result[0] ?? "";

  assert.notStrictEqual(result, lines);
  assert.match(rendered, /\x1b\[2m ghost\x1b\[22m\x1b\[7mt\x1b\[0mail/);
  assert.ok(rendered.indexOf(dim(" ghost")) < rendered.indexOf(cursorOverT));
  assert.ok(visibleWidth(rendered) <= visibleWidth(lines[0] ?? ""));
});

test("insertGhostText returns original lines when highlighted suffix character has no trailing padding", () => {
  const lines = [`hello${cursorOverT}ail`];
  const result = insertGhostText(lines, " ghost", visibleWidth(lines[0] ?? "") + 10, dim);

  assert.strictEqual(result, lines);
  assert.deepEqual(result, [`hello${cursorOverT}ail`]);
});

test("insertGhostText does not drop suffix content when prediction exceeds trailing padding", () => {
  const lines = [`hello${cursorOverT}ail  `];
  const result = insertGhostText(lines, " ghost", visibleWidth(lines[0] ?? ""), dim);
  const rendered = result[0] ?? "";

  assert.match(stripAnsi(rendered), /tail/);
  assert.ok(visibleWidth(rendered) <= visibleWidth(lines[0] ?? ""));
});

test("insertGhostText strips ANSI and control sequences from prediction text", () => {
  const lines = [`hello${cursor}          `];
  const result = insertGhostText(lines, "ok\x1b[2J!\x07", visibleWidth(lines[0] ?? ""), dim);

  assert.match(result[0] ?? "", /\x1b\[2mok!\x1b\[22m/);
  assert.doesNotMatch(result[0] ?? "", /\x1b\[2J/);
  assert.doesNotMatch(result[0] ?? "", /\x07/);
});

test("insertGhostText returns original lines when a wide character has only one available column", () => {
  const lines = [`ab${cursor} `];
  const result = insertGhostText(lines, "界", visibleWidth(lines[0] ?? ""), dim);

  assert.strictEqual(result, lines);
  assert.deepEqual(result, [`ab${cursor} `]);
});
