import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

import LemonadeDiscoveryPlugin, {
  deepMerge,
  filterModel,
  matchesPattern,
  resolveValue,
  type LemonadeModel,
} from "../src/lemonade-discovery.ts";

function model(overrides: Partial<LemonadeModel> = {}): LemonadeModel {
  return {
    id: "Qwen2.5-VL-7B-Instruct",
    name: "Qwen2.5 VL 7B",
    downloaded: true,
    recipe: "local",
    labels: ["vision"],
    recipe_options: { ctx_size: 128000 },
    ...overrides,
  };
}

interface ProviderEntry {
  name?: string;
  npm?: string;
  options?: Record<string, unknown>;
  models?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PluginConfig {
  provider: Record<string, ProviderEntry>;
  [key: string]: unknown;
}

function modelEntry(config: PluginConfig, id: string): Record<string, any> {
  const entry = config.provider.lemonade?.models?.[id];
  assert.ok(entry, `model ${id} not registered`);
  return entry as Record<string, unknown>;
}

test("matchesPattern: glob wildcards", () => {
  assert.equal(matchesPattern("Qwen2.5-VL-7B-Instruct", "Qwen*VL*"), true);
  assert.equal(matchesPattern("qwen2.5-vl-7b", "Qwen*VL*"), true);
  assert.equal(matchesPattern("llama3", "llama?"), true);
  assert.equal(matchesPattern("llama3.2", "llama?"), false);
  assert.equal(matchesPattern("tinyllama", "Qwen*"), false);
});

test("matchesPattern: glob special chars are escaped", () => {
  assert.equal(matchesPattern("insecure.anything", "insecure.*"), true);
  assert.equal(matchesPattern("secure.anything", "insecure.*"), false);
  assert.equal(matchesPattern("a+b", "a+b"), true);
});

test("matchesPattern: regex patterns", () => {
  assert.equal(matchesPattern("tinyllama", "/tiny.*/i"), true);
  assert.equal(matchesPattern("TinyLlama", "/tiny.*/i"), true);
  assert.equal(matchesPattern("small", "/tiny.*/i"), false);
  assert.equal(matchesPattern("any", "/[/"), false);
});

test("resolveValue: passthrough and empty", () => {
  assert.equal(resolveValue(undefined), undefined);
  assert.equal(resolveValue(""), undefined);
  assert.equal(
    resolveValue("http://127.0.0.1:13305"),
    "http://127.0.0.1:13305",
  );
});

test("resolveValue: env templates", () => {
  process.env.LEMONADE_TEST_HOST = "http://localhost:13305";
  assert.equal(
    resolveValue("{env:LEMONADE_TEST_HOST}"),
    "http://localhost:13305",
  );
  assert.equal(resolveValue("{env:LEMONADE_TEST_UNSET_VAR}"), undefined);
  delete process.env.LEMONADE_TEST_HOST;
});

test("resolveValue: file templates", () => {
  const dir = mkdtempSync(join(tmpdir(), "lemonade-test-"));
  try {
    const secret = join(dir, "secret");
    writeFileSync(secret, "  super-secret\n");
    assert.equal(resolveValue(`{file:${secret}}`), "super-secret");
    assert.equal(resolveValue("{file:/nonexistent/secret}"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveValue: embedded templates in a string", () => {
  process.env.LEMONADE_TEST_EMBEDDED = "10.0.0.1";
  assert.equal(resolveValue("{env:LEMONADE_TEST_EMBEDDED}/v1"), "10.0.0.1/v1");
  assert.equal(
    resolveValue("https://{env:LEMONADE_TEST_EMBEDDED}:9000"),
    "https://10.0.0.1:9000",
  );
  assert.equal(resolveValue("{env:LEMONADE_TEST_UNSET_VAR}/v1"), "/v1");
  delete process.env.LEMONADE_TEST_EMBEDDED;
});

test("filterModel: downloaded-only default for local models", () => {
  assert.equal(filterModel(model({ downloaded: true }), {}), true);
  assert.equal(filterModel(model({ downloaded: false }), {}), false);
  assert.equal(
    filterModel(model({ downloaded: false }), { downloaded_only: false }),
    true,
  );
});

test("filterModel: cloud models bypass downloaded check", () => {
  const cloud = model({
    recipe: "cloud",
    cloud_provider: "openrouter",
    downloaded: false,
  });
  assert.equal(filterModel(cloud, {}), true);
  assert.equal(filterModel(cloud, { cloud_models: "exclude" }), false);
  assert.equal(filterModel(model({}), { cloud_models: "only" }), false);
  assert.equal(filterModel(cloud, { cloud_models: "only" }), true);
});

test("filterModel: cloud provider allowlist", () => {
  const cloud = model({ recipe: "cloud", cloud_provider: "openrouter" });
  assert.equal(filterModel(cloud, { cloud_providers: ["openrouter"] }), true);
  assert.equal(filterModel(cloud, { cloud_providers: ["google"] }), false);
});

test("filterModel: label filters", () => {
  assert.equal(
    filterModel(model({ labels: ["embedding"] }), {
      exclude_labels: ["embedding"],
    }),
    false,
  );
  assert.equal(
    filterModel(model({ labels: ["text"] }), { exclude_labels: ["embedding"] }),
    true,
  );
  assert.equal(
    filterModel(model({ labels: ["vision"] }), { include_labels: ["vision"] }),
    true,
  );
  assert.equal(
    filterModel(model({ labels: ["text"] }), { include_labels: ["vision"] }),
    false,
  );
});

test("filterModel: id include/exclude patterns", () => {
  assert.equal(
    filterModel(model({ id: "insecure.Qwen" }), { exclude: ["insecure.*"] }),
    false,
  );
  assert.equal(filterModel(model({}), { exclude: ["insecure.*"] }), true);
  assert.equal(
    filterModel(model({ id: "Qwen2.5" }), { include: ["Qwen*"] }),
    true,
  );
  assert.equal(
    filterModel(model({ id: "llama3" }), { include: ["Qwen*"] }),
    false,
  );
});

test("plugin: registers provider and models from fetch", async () => {
  const response = {
    data: [model(), model({ id: "embed", labels: ["embedding"] })],
  };
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => response,
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.ok(config.provider.lemonade);
    assert.equal(config.provider.lemonade.npm, "@ai-sdk/openai-compatible");
    const options = config.provider.lemonade.options as Record<string, unknown>;
    assert.equal(options.baseURL, "http://127.0.0.1:13305/v1");
    assert.ok(modelEntry(config, "Qwen2.5-VL-7B-Instruct"));
    assert.equal(config.provider.lemonade.models?.["embed"], undefined);
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      "http://127.0.0.1:13305/v1/models",
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: vision model gets attachment and modalities", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.attachment, true);
    assert.deepEqual(entry.modalities, {
      input: ["text", "image"],
      output: ["text"],
    });
    assert.equal(entry.limit.context, 128000);
    assert.equal(entry.limit.output, 8192);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: tool-calling and reasoning labels map to capabilities", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [
        model({ id: "DeepSeek-R1", labels: ["tool-calling", "reasoning"] }),
      ],
    }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "DeepSeek-R1");
    assert.equal(entry.tool_call, true);
    assert.equal(entry.reasoning, true);
    assert.equal(entry.attachment, undefined);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: models without capability labels stay bare", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [model({ id: "plain", labels: [] })],
    }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "plain");
    assert.equal(entry.tool_call, undefined);
    assert.equal(entry.reasoning, undefined);
    assert.equal(entry.attachment, undefined);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: overrides can clear auto-detected capabilities", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      overrides: {
        "Qwen2.5-VL-7B-Instruct": { reasoning: false },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.reasoning, false);
    assert.equal(entry.attachment, true);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: offline server falls back gracefully", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.ok(config.provider.lemonade);
    assert.deepEqual(config.provider.lemonade.models, {});
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: derives host and api key from provider options and env", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));
  process.env.LEMONADE_TEST_HOST = "http://10.0.0.1:9000";

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = {
      provider: {
        lemonade: {
          options: {
            baseURL: "{env:LEMONADE_TEST_HOST}/v1",
            apiKey: "{env:LEMONADE_TEST_ADMIN_KEY}",
          },
        },
      },
    };
    process.env.LEMONADE_TEST_ADMIN_KEY = "admin-secret";
    await plugin.config(config);

    const call = fetchMock.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], "http://10.0.0.1:9000/v1/models");
    const init = call.arguments[1] as
      { headers?: Record<string, string> } | undefined;
    assert.equal(init?.headers?.Authorization, "Bearer admin-secret");
  } finally {
    fetchMock.mock.restore();
    delete process.env.LEMONADE_TEST_HOST;
    delete process.env.LEMONADE_TEST_ADMIN_KEY;
  }
});

test("plugin: requests show_all only when downloaded_only is false", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      downloaded_only: false,
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      "http://127.0.0.1:13305/v1/models?show_all=true",
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: omits apiKey from provider options when none resolves", async () => {
  const savedAdmin = process.env.LEMONADE_ADMIN_API_KEY;
  const savedKey = process.env.LEMONADE_API_KEY;
  delete process.env.LEMONADE_ADMIN_API_KEY;
  delete process.env.LEMONADE_API_KEY;
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const options = config.provider.lemonade.options as Record<string, unknown>;
    assert.equal(options.apiKey, undefined);
    assert.equal(options.baseURL, "http://127.0.0.1:13305/v1");
  } finally {
    fetchMock.mock.restore();
    if (savedAdmin !== undefined) {
      process.env.LEMONADE_ADMIN_API_KEY = savedAdmin;
    }
    if (savedKey !== undefined) {
      process.env.LEMONADE_API_KEY = savedKey;
    }
  }
});

test("plugin: discovery headers apply to fetch and provider options", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      headers: { "X-Gateway-Key": "secret" },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const call = fetchMock.mock.calls[0];
    const init = call.arguments[1] as
      { headers?: Record<string, string> } | undefined;
    assert.equal(init?.headers?.["X-Gateway-Key"], "secret");

    const options = config.provider.lemonade.options as Record<string, unknown>;
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Gateway-Key"], "secret");
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: small_model option prefixes bare model ids", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      small_model: "Qwen3-0.6B-GGUF",
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.equal(config.small_model, "lemonade/Qwen3-0.6B-GGUF");
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: small_model keeps full references and env templates", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));
  process.env.LEMONADE_TEST_SMALL = "other/Qwen3-0.6B-GGUF";

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      small_model: "{env:LEMONADE_TEST_SMALL}",
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.equal(config.small_model, "other/Qwen3-0.6B-GGUF");
  } finally {
    fetchMock.mock.restore();
    delete process.env.LEMONADE_TEST_SMALL;
  }
});

test("plugin: clamps context limit with max_context_limit", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [model({ id: "big", recipe_options: { ctx_size: 128000 } })],
    }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      max_context_limit: 32768,
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.equal(modelEntry(config, "big").limit.context, 32768);
  } finally {
    fetchMock.mock.restore();
  }
});

test("deepMerge: partial nested merge", () => {
  assert.deepEqual(
    deepMerge(
      { name: "base", limit: { context: 128000, output: 8192 } },
      { name: "custom", limit: { output: 4096 } },
    ),
    { name: "custom", limit: { context: 128000, output: 4096 } },
  );
});

test("deepMerge: undefined values skipped, arrays replace", () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: undefined, c: [1, 2] }), {
    a: 1,
    b: 2,
    c: [1, 2],
  });
  assert.deepEqual(deepMerge({ c: [1, 2] }, { c: [3] }), { c: [3] });
});

test("deepMerge: no source returns target unchanged", () => {
  const target = { a: 1 };
  assert.equal(deepMerge(target, undefined), target);
  assert.deepEqual(deepMerge(target, {}), { a: 1 });
});

test("plugin: merges pre-configured entry over discovered model", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [
        model({ id: "small", recipe_options: { ctx_size: 4096 }, labels: [] }),
      ],
    }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      max_context_limit: 2048,
    });
    const config: PluginConfig = {
      provider: {
        lemonade: {
          models: { small: { name: "custom" } },
        },
      },
    };
    await plugin.config(config);

    assert.deepEqual(modelEntry(config, "small"), {
      name: "custom",
      limit: { context: 2048, output: 8192 },
    });
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: per-model override via discovery models option", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      models: {
        "Qwen2.5-VL-7B-Instruct": {
          name: "Qwen 7B (custom)",
          limit: { output: 4096 },
        },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.name, "Qwen 7B (custom)");
    assert.equal(entry.limit.output, 4096);
    assert.equal(entry.limit.context, 128000);
    assert.equal(entry.attachment, true);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: per-model override via discovery overrides option", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      overrides: {
        "Qwen2.5-VL-7B-Instruct": {
          name: "Renamed",
          attachment: false,
        },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const entry = modelEntry(config, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.name, "Renamed");
    assert.equal(entry.attachment, false);
    assert.equal(entry.limit.context, 128000);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: prefers LEMONADE_API_KEY over LEMONADE_ADMIN_API_KEY", async () => {
  const savedKey = process.env.LEMONADE_API_KEY;
  const savedAdmin = process.env.LEMONADE_ADMIN_API_KEY;
  process.env.LEMONADE_API_KEY = "api-key";
  process.env.LEMONADE_ADMIN_API_KEY = "admin-key";
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin();
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const init = fetchMock.mock.calls[0].arguments[1] as
      { headers?: Record<string, string> } | undefined;
    assert.equal(init?.headers?.Authorization, "Bearer api-key");
  } finally {
    fetchMock.mock.restore();
    if (savedKey !== undefined) process.env.LEMONADE_API_KEY = savedKey;
    if (savedAdmin !== undefined) {
      process.env.LEMONADE_ADMIN_API_KEY = savedAdmin;
    }
  }
});

test("plugin: registers additional named servers", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (url: string) => ({
    ok: true,
    json: async () => ({
      data: [
        model({
          id: url.includes("10.0.0.1") ? "remote-model" : "local-model",
          labels: [],
        }),
      ],
    }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      servers: {
        work: { host: "http://10.0.0.1:9000", apiKey: "work-key" },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.equal(config.provider.work.name, "Lemonade (work)");
    assert.equal(config.provider.lemonade.name, "Lemonade");
    assert.ok(config.provider.work.models?.["remote-model"]);
    assert.ok(config.provider.lemonade.models?.["local-model"]);

    const urls = fetchMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(urls.includes("http://10.0.0.1:9000/v1/models"));
    assert.ok(urls.includes("http://127.0.0.1:13305/v1/models"));
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: servers entry matching provider id merges into primary", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      servers: {
        lemonade: { name: "Primary Lemonade" },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    assert.equal(config.provider.lemonade.name, "Primary Lemonade");
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: named servers inherit top-level options with overrides", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const plugin = await LemonadeDiscoveryPlugin(undefined, {
      downloaded_only: false,
      servers: {
        work: { downloaded_only: true },
      },
    });
    const config: PluginConfig = { provider: {} };
    await plugin.config(config);

    const urls = fetchMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(urls.includes("http://127.0.0.1:13305/v1/models?show_all=true"));
    assert.ok(urls.includes("http://127.0.0.1:13305/v1/models"));
  } finally {
    fetchMock.mock.restore();
  }
});
