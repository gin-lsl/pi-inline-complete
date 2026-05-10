import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_FIM_ENDPOINT, DEEPSEEK_MODEL } from "../src/config.ts";
import { DeepSeekAuthError, DeepSeekFimClient, DeepSeekTransientError, type FetchLike } from "../src/deepseek.ts";

test("DeepSeekFimClient sends an OpenAI-compatible FIM completion request", async () => {
  let capturedUrl = "";
  let capturedHeaders: Headers | undefined;
  let capturedMethod: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init.headers);
    capturedMethod = init.method;
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ text: " world" }] }), { status: 200 });
  };

  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });
  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "[Recent conversation context]\nUser: hi" },
    new AbortController().signal,
  );

  assert.equal(capturedUrl, DEEPSEEK_FIM_ENDPOINT);
  assert.equal(capturedMethod, "POST");
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
  for (const status of [401, 403]) {
    const fetchImpl: FetchLike = async () => new Response("bad key", { status });
    const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

    await assert.rejects(
      () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
      DeepSeekAuthError,
    );
  }
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

test("DeepSeekFimClient throws DeepSeekTransientError for malformed successful JSON", async () => {
  const fetchImpl: FetchLike = async () => new Response("not json", { status: 200 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekFimClient throws DeepSeekTransientError for null successful JSON", async () => {
  const fetchImpl: FetchLike = async () => new Response("null", { status: 200 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekFimClient returns undefined when successful JSON has no choices", async () => {
  const fetchImpl: FetchLike = async () => new Response(JSON.stringify({}), { status: 200 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal);

  assert.equal(result, undefined);
});

test("DeepSeekFimClient returns undefined when the first choice text is not a string", async () => {
  const fetchImpl: FetchLike = async () => new Response(JSON.stringify({ choices: [{ text: 42 }] }), { status: 200 });
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal);

  assert.equal(result, undefined);
});

test("DeepSeekFimClient throws DeepSeekTransientError for network fetch failures", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekFimClient propagates fetch abort errors without wrapping", async () => {
  const abortError = new DOMException("The operation was aborted", "AbortError");
  const fetchImpl: FetchLike = async () => {
    throw abortError;
  };
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    (error: unknown) => {
      assert.equal(error, abortError);
      return true;
    },
  );
});

test("DeepSeekFimClient forwards the provided abort signal to fetch", async () => {
  const controller = new AbortController();
  let capturedSignal: AbortSignal | null | undefined;
  const fetchImpl: FetchLike = async (_url, init) => {
    capturedSignal = init.signal;
    return new Response(JSON.stringify({ choices: [{ text: " world" }] }), { status: 200 });
  };
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, controller.signal);

  assert.equal(capturedSignal, controller.signal);
});
