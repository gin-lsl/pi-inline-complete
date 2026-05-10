import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_MODEL } from "../src/config.ts";

test("test harness loads TypeScript modules", () => {
  assert.equal(DEEPSEEK_MODEL, "deepseek-v4-flash");
});
