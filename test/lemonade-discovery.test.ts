import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

import { Model, Provider } from "@opencode/plugin";

import LemonadeDiscoveryPlugin, {
  deepMerge,
  filterModel,
  matchesPattern,
  resolveModelInfo,
  resolveValue,
  type LemonadeModel,
} from "../src/lemonade-discovery.ts";

type PluginContext = Parameters<typeof LemonadeDiscoveryPlugin.setup>[0];

interface ProviderRecord {
  provider: Provider.Info;
  models: Map<string, Model.Info>;
}

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

function emptyProvider(id: string): Provider.Info {
  return {
    ...Provider.Info.empty(Provider.ID.make(id)),
    package: "@opencode/ai/providers/openai-compatible",
  };
}

function makeEditor(records: Map<string, ProviderRecord>) {
  return {
    list: () => [...records.values()],
    get: (id: string) => records.get(id),
    add: ({
      info,
      models,
    }: {
      info: Provider.Info;
      models: readonly Model.Info[];
    }) => {
      records.set(info.id, {
        provider: info,
        models: new Map(models.map((m) => [m.id, m])),
      });
    },
    update: (id: string, update: (provider: Provider.Info) => void) => {
      const record = records.get(id);
      if (record) update(record.provider);
    },
    remove: (id: string) => {
      records.delete(id);
    },
    models: {
      set: (id: string, models: readonly Model.Info[]) => {
        const record = records.get(id);
        if (record) {
          record.models = new Map(models.map((m) => [m.id, m]));
        }
      },
      update: (
        id: string,
        modelID: string,
        update: (model: Model.Info) => void,
      ) => {
        const entry = records.get(id)?.models.get(modelID);
        if (entry) update(entry);
      },
      remove: (id: string, modelID: string) => {
        records.get(id)?.models.delete(modelID);
      },
    },
  };
}

async function runPlugin(
  options: Record<string, unknown> = {},
  existing: Map<string, ProviderRecord> = new Map(),
): Promise<Map<string, ProviderRecord>> {
  const editor = makeEditor(existing);
  const ctx = {
    options,
    provider: {
      async get({ providerID }: { providerID: string }) {
        const record = existing.get(providerID);
        return record ? { data: record.provider } : undefined;
      },
      async transform(
        callback: (editor: ReturnType<typeof makeEditor>) => void,
      ) {
        callback(editor);
        return { dispose: async () => {} };
      },
    },
  };

  await LemonadeDiscoveryPlugin.setup(ctx as unknown as PluginContext);
  return existing;
}

function modelEntry(
  records: Map<string, ProviderRecord>,
  id: string,
): Model.Info {
  const entry = records.get("lemonade")?.models.get(id);
  assert.ok(entry, `model ${id} not registered`);
  return entry;
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

test("resolveModelInfo: maps labels to v2 capabilities", () => {
  const providerID = Provider.ID.make("lemonade");

  const vision = resolveModelInfo(providerID, model(), {});
  assert.equal(vision.name, "Qwen2.5 VL 7B");
  assert.deepEqual(vision.capabilities, {
    tools: false,
    input: ["text", "image"],
    output: ["text"],
  });
  assert.deepEqual(vision.limit, { context: 128000, output: 8192 });

  const capable = resolveModelInfo(
    providerID,
    model({ id: "DeepSeek-R1", labels: ["tool-calling"] }),
    {},
  );
  assert.deepEqual(capable.capabilities, {
    tools: true,
    input: ["text"],
    output: ["text"],
  });

  const plain = resolveModelInfo(
    providerID,
    model({ id: "plain", labels: [] }),
    {},
  );
  assert.deepEqual(plain.capabilities, {
    tools: false,
    input: ["text"],
    output: ["text"],
  });
});

test("resolveModelInfo: override deep-merges over discovered metadata", () => {
  const providerID = Provider.ID.make("lemonade");
  const info = resolveModelInfo(
    providerID,
    model(),
    {},
    {
      name: "Custom",
      limit: { output: 4096 },
      capabilities: { tools: true },
    },
  );

  assert.equal(info.name, "Custom");
  assert.deepEqual(info.limit, { context: 128000, output: 4096 });
  assert.deepEqual(info.capabilities, {
    tools: true,
    input: ["text", "image"],
    output: ["text"],
  });
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
    const records = await runPlugin();
    const provider = records.get("lemonade")?.provider;
    assert.ok(provider);
    assert.equal(provider.name, "Lemonade");
    assert.equal(provider.package, "@opencode/ai/providers/openai-compatible");
    assert.equal(provider.activation, "enabled");
    const settings = provider.settings as Record<string, unknown>;
    assert.equal(settings.baseURL, "http://127.0.0.1:13305/v1");
    assert.ok(modelEntry(records, "Qwen2.5-VL-7B-Instruct"));
    assert.equal(records.get("lemonade")?.models.get("embed"), undefined);
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      "http://127.0.0.1:13305/v1/models",
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: vision model gets image input modality", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const records = await runPlugin();
    const entry = modelEntry(records, "Qwen2.5-VL-7B-Instruct");
    assert.deepEqual(entry.capabilities.input, ["text", "image"]);
    assert.deepEqual(entry.capabilities.output, ["text"]);
    assert.equal(entry.limit.context, 128000);
    assert.equal(entry.limit.output, 8192);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: tool-calling label enables tools capability", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [model({ id: "DeepSeek-R1", labels: ["tool-calling"] })],
    }),
  }));

  try {
    const records = await runPlugin();
    const entry = modelEntry(records, "DeepSeek-R1");
    assert.equal(entry.capabilities.tools, true);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: models without capability labels expose no tools", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [model({ id: "plain", labels: [] })],
    }),
  }));

  try {
    const records = await runPlugin();
    const entry = modelEntry(records, "plain");
    assert.equal(entry.capabilities.tools, false);
    assert.deepEqual(entry.capabilities.input, ["text"]);
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
    const records = await runPlugin({
      overrides: {
        "Qwen2.5-VL-7B-Instruct": { capabilities: { tools: true } },
      },
    });
    const entry = modelEntry(records, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.capabilities.tools, true);
    assert.deepEqual(entry.capabilities.input, ["text", "image"]);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: offline server falls back gracefully", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });

  try {
    const records = await runPlugin();
    assert.ok(records.get("lemonade")?.provider);
    assert.equal(records.get("lemonade")?.models.size, 0);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: derives host and api key from provider settings and env", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));
  process.env.LEMONADE_TEST_HOST = "http://10.0.0.1:9000";
  process.env.LEMONADE_TEST_ADMIN_KEY = "admin-secret";

  const existing = new Map<string, ProviderRecord>();
  existing.set("lemonade", {
    provider: {
      ...emptyProvider("lemonade"),
      settings: {
        baseURL: "{env:LEMONADE_TEST_HOST}/v1",
        apiKey: "{env:LEMONADE_TEST_ADMIN_KEY}",
      },
    },
    models: new Map(),
  });

  try {
    await runPlugin({}, existing);

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
    await runPlugin({ downloaded_only: false });
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      "http://127.0.0.1:13305/v1/models?show_all=true",
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: omits apiKey from provider settings when none resolves", async () => {
  const savedAdmin = process.env.LEMONADE_ADMIN_API_KEY;
  const savedKey = process.env.LEMONADE_API_KEY;
  delete process.env.LEMONADE_ADMIN_API_KEY;
  delete process.env.LEMONADE_API_KEY;
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const records = await runPlugin();
    const settings = records.get("lemonade")?.provider.settings as Record<
      string,
      unknown
    >;
    assert.equal(settings.apiKey, undefined);
    assert.equal(settings.baseURL, "http://127.0.0.1:13305/v1");
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

test("plugin: discovery headers apply to fetch and provider settings", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));

  try {
    const records = await runPlugin({
      headers: { "X-Gateway-Key": "secret" },
    });

    const call = fetchMock.mock.calls[0];
    const init = call.arguments[1] as
      { headers?: Record<string, string> } | undefined;
    assert.equal(init?.headers?.["X-Gateway-Key"], "secret");

    const settings = records.get("lemonade")?.provider.settings as Record<
      string,
      unknown
    >;
    const headers = settings.headers as Record<string, string>;
    assert.equal(headers["X-Gateway-Key"], "secret");
  } finally {
    fetchMock.mock.restore();
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
    const records = await runPlugin({ max_context_limit: 32768 });
    assert.equal(modelEntry(records, "big").limit.context, 32768);
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

test("plugin: keeps existing provider models over discovered ones", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [
        model({ id: "small", recipe_options: { ctx_size: 4096 }, labels: [] }),
      ],
    }),
  }));

  const existing = new Map<string, ProviderRecord>();
  existing.set("lemonade", {
    provider: emptyProvider("lemonade"),
    models: new Map([
      [
        "small",
        {
          ...Model.Info.default(
            Provider.ID.make("lemonade"),
            Model.ID.make("small"),
          ),
          name: "custom",
        },
      ],
    ]),
  });

  try {
    await runPlugin({ max_context_limit: 2048 }, existing);
    const entry = existing.get("lemonade")?.models.get("small");
    assert.equal(entry?.name, "custom");
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: per-model override via models option", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const records = await runPlugin({
      models: {
        "Qwen2.5-VL-7B-Instruct": {
          name: "Qwen 7B (custom)",
          limit: { output: 4096 },
        },
      },
    });

    const entry = modelEntry(records, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.name, "Qwen 7B (custom)");
    assert.equal(entry.limit.output, 4096);
    assert.equal(entry.limit.context, 128000);
    assert.deepEqual(entry.capabilities.input, ["text", "image"]);
  } finally {
    fetchMock.mock.restore();
  }
});

test("plugin: per-model override via overrides option", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: [model()] }),
  }));

  try {
    const records = await runPlugin({
      overrides: {
        "Qwen2.5-VL-7B-Instruct": {
          name: "Renamed",
          modelID: "deployment-name",
        },
      },
    });

    const entry = modelEntry(records, "Qwen2.5-VL-7B-Instruct");
    assert.equal(entry.name, "Renamed");
    assert.equal(entry.modelID, "deployment-name");
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
    await runPlugin();

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
    const records = await runPlugin({
      servers: {
        work: { host: "http://10.0.0.1:9000", apiKey: "work-key" },
      },
    });

    assert.equal(records.get("work")?.provider.name, "Lemonade (work)");
    assert.equal(records.get("lemonade")?.provider.name, "Lemonade");
    assert.ok(records.get("work")?.models.get("remote-model"));
    assert.ok(records.get("lemonade")?.models.get("local-model"));

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
    const records = await runPlugin({
      servers: {
        lemonade: { name: "Primary Lemonade" },
      },
    });

    assert.equal(records.get("lemonade")?.provider.name, "Primary Lemonade");
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
    await runPlugin({
      downloaded_only: false,
      servers: {
        work: { downloaded_only: true },
      },
    });

    const urls = fetchMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(urls.includes("http://127.0.0.1:13305/v1/models?show_all=true"));
    assert.ok(urls.includes("http://127.0.0.1:13305/v1/models"));
  } finally {
    fetchMock.mock.restore();
  }
});
