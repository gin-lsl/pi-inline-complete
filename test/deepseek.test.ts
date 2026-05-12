import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_FIM_ENDPOINT, DEEPSEEK_CHAT_PREFIX_ENDPOINT, DEEPSEEK_MODEL } from "../src/config.ts";
import { DeepSeekAuthError, DeepSeekChatPrefixClient, DeepSeekFimClient, DeepSeekTransientError, type FetchLike } from "../src/deepseek.ts";

function responseWithErroredBody(error: unknown): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    }),
    { status: 200 },
  );
}

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

test("DeepSeekFimClient normalizes body read failures as DeepSeekTransientError", async () => {
  const fetchImpl: FetchLike = async () => responseWithErroredBody(new TypeError("body stream failed"));
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekFimClient propagates body read abort errors without wrapping", async () => {
  const abortError = new DOMException("The body read was aborted", "AbortError");
  const fetchImpl: FetchLike = async () => responseWithErroredBody(abortError);
  const client = new DeepSeekFimClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    (error: unknown) => {
      assert.equal(error, abortError);
      return true;
    },
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

// ---------------------------------------------------------------------------
// DeepSeekChatPrefixClient tests
// ---------------------------------------------------------------------------

test("DeepSeekChatPrefixClient sends a chat completion request with prefix parameter", async () => {
  let capturedUrl = "";
  let capturedHeaders: Headers | undefined;
  let capturedMethod: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init.headers);
    capturedMethod = init.method;
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: " world" } }] }),
      { status: 200 },
    );
  };

  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });
  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(capturedUrl, DEEPSEEK_CHAT_PREFIX_ENDPOINT);
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-test");
  assert.equal(capturedHeaders?.get("content-type"), "application/json");
  assert.equal(capturedBody?.model, DEEPSEEK_MODEL);
  assert.equal(capturedBody?.max_tokens, 64);
  assert.equal(result, " world");

  // Verify messages structure: last message must be assistant with prefix=true
  const messages = capturedBody?.messages as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(messages));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[0].content, "hello");
  assert.equal(messages[0].prefix, true);
});

test("DeepSeekChatPrefixClient includes conversation messages in the request", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: " foo" } }] }),
      { status: 200 },
    );
  };

  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });
  await client.complete(
    {
      beforeCursor: "const x = 1",
      afterCursor: "",
      recentContext: "",
      conversationMessages: [
        { role: "user", content: "write some code" },
        { role: "assistant", content: "sure" },
      ],
    },
    new AbortController().signal,
  );

  const messages = capturedBody?.messages as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(messages));
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "write some code");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content, "sure");
  assert.equal(messages[2].role, "assistant");
  assert.equal(messages[2].content, "const x = 1");
  assert.equal(messages[2].prefix, true);
});

test("DeepSeekChatPrefixClient returns undefined without an API key", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new Error("fetch should not be called");
  };

  const client = new DeepSeekChatPrefixClient({ apiKey: "", fetch: fetchImpl });
  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(result, undefined);
});

test("DeepSeekChatPrefixClient throws DeepSeekAuthError for 401 and 403", async () => {
  for (const status of [401, 403]) {
    const fetchImpl: FetchLike = async () => new Response("bad key", { status });
    const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

    await assert.rejects(
      () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
      DeepSeekAuthError,
    );
  }
});

test("DeepSeekChatPrefixClient throws DeepSeekTransientError for rate limits", async () => {
  const fetchImpl: FetchLike = async () => new Response("rate limited", { status: 429 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekChatPrefixClient cleans suffix duplication from returned text", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: " world" } }] }), { status: 200 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: " world", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(result, undefined);
});

test("DeepSeekChatPrefixClient throws DeepSeekTransientError for malformed JSON", async () => {
  const fetchImpl: FetchLike = async () => new Response("not json", { status: 200 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekChatPrefixClient throws DeepSeekTransientError for null JSON", async () => {
  const fetchImpl: FetchLike = async () => new Response("null", { status: 200 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekChatPrefixClient returns undefined when JSON has no choices", async () => {
  const fetchImpl: FetchLike = async () => new Response(JSON.stringify({}), { status: 200 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(result, undefined);
});

test("DeepSeekChatPrefixClient returns undefined when message content is not a string", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 42 } }] }), { status: 200 });
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  const result = await client.complete(
    { beforeCursor: "hello", afterCursor: "", recentContext: "" },
    new AbortController().signal,
  );

  assert.equal(result, undefined);
});

test("DeepSeekChatPrefixClient throws DeepSeekTransientError for network fetch failures", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekChatPrefixClient normalizes body read failures as DeepSeekTransientError", async () => {
  const fetchImpl: FetchLike = async () => responseWithErroredBody(new TypeError("body stream failed"));
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    DeepSeekTransientError,
  );
});

test("DeepSeekChatPrefixClient propagates body read abort errors without wrapping", async () => {
  const abortError = new DOMException("The body read was aborted", "AbortError");
  const fetchImpl: FetchLike = async () => responseWithErroredBody(abortError);
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    (error: unknown) => {
      assert.equal(error, abortError);
      return true;
    },
  );
});

test("DeepSeekChatPrefixClient propagates fetch abort errors without wrapping", async () => {
  const abortError = new DOMException("The operation was aborted", "AbortError");
  const fetchImpl: FetchLike = async () => {
    throw abortError;
  };
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await assert.rejects(
    () => client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal),
    (error: unknown) => {
      assert.equal(error, abortError);
      return true;
    },
  );
});

test("DeepSeekChatPrefixClient forwards the provided abort signal to fetch", async () => {
  const controller = new AbortController();
  let capturedSignal: AbortSignal | null | undefined;
  const fetchImpl: FetchLike = async (_url, init) => {
    capturedSignal = init.signal;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: " world" } }] }),
      { status: 200 },
    );
  };
  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });

  await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, controller.signal);

  assert.equal(capturedSignal, controller.signal);
});

test("DeepSeekChatPrefixClient sends stop tokens when configured", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: " world" } }] }),
      { status: 200 },
    );
  };

  const client = new DeepSeekChatPrefixClient({
    apiKey: "sk-test",
    fetch: fetchImpl,
    stop: ["```", "\n\n"],
  });
  await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal);

  assert.deepEqual(capturedBody?.stop, ["```", "\n\n"]);
});

test("DeepSeekChatPrefixClient omits stop field when not configured", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const fetchImpl: FetchLike = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: " world" } }] }),
      { status: 200 },
    );
  };

  const client = new DeepSeekChatPrefixClient({ apiKey: "sk-test", fetch: fetchImpl });
  await client.complete({ beforeCursor: "hello", afterCursor: "", recentContext: "" }, new AbortController().signal);

  assert.equal(capturedBody?.stop, undefined);
});
