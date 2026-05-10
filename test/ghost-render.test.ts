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
