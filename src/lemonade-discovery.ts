import { Model, Plugin, Provider } from "@opencode/plugin";
import * as fs from "node:fs";

export const LEMONADE_PROVIDER_PACKAGE =
  "@opencode/ai/providers/openai-compatible";

export interface LemonadeDiscoveryOptions {
  name?: string;
  host?: string;
  apiKey?: string;
  provider_id?: string;
  downloaded_only?: boolean;
  cloud_models?: "include" | "exclude" | "only";
  cloud_providers?: string[];
  include?: string[];
  exclude?: string[];
  include_labels?: string[];
  exclude_labels?: string[];
  default_output_limit?: number;
  max_context_limit?: number;
  timeout_ms?: number;
  models?: Record<string, Record<string, unknown>>;
  overrides?: Record<string, Record<string, unknown>>;
  headers?: Record<string, string>;
  servers?: Record<string, LemonadeDiscoveryOptions>;
}

export interface LemonadeModel {
  id: string;
  name?: string;
  downloaded?: boolean;
  recipe?: string;
  cloud_provider?: string;
  labels?: string[];
  context_length?: number;
  max_output_tokens?: number;
  recipe_options?: {
    ctx_size?: number;
    [key: string]: unknown;
  };
}

interface DiscoveredServer {
  id: string;
  info: Provider.Info;
  models: Model.Info[];
}

export interface ExistingProvider {
  id: string;
  name?: string;
  activation?: string;
  package?: string;
  settings?: Record<string, unknown>;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function deepMerge(
  target: Record<string, unknown>,
  source?: Record<string, unknown>,
): Record<string, unknown> {
  if (!source) return target;
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const targetVal = result[key];
    if (isObject(targetVal) && isObject(value)) {
      result[key] = deepMerge(targetVal, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function resolveFileTemplate(fileTemplate: string): string | undefined {
  const filePath = fileTemplate.replace(/^~(?=$|\/)/, process.env.HOME || "");
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return undefined;
  }
}

export function resolveValue(val?: string): string | undefined {
  if (!val) return undefined;
  const envMatch = val.match(/^\{env:(.+)\}$/);
  if (envMatch) return process.env[envMatch[1]];
  const fileMatch = val.match(/^\{file:(.+)\}$/);
  if (fileMatch) return resolveFileTemplate(fileMatch[1]);
  const resolved = val
    .replace(
      /\{env:([^}]+)\}/g,
      (_match, name: string) => process.env[name] ?? "",
    )
    .replace(
      /\{file:([^}]+)\}/g,
      (_match, fileTemplate: string) => resolveFileTemplate(fileTemplate) ?? "",
    );
  return resolved === val ? val : resolved;
}

export function matchesPattern(value: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    const regexBody = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    try {
      return new RegExp(regexBody, flags).test(value);
    } catch {
      return false;
    }
  }

  const regexStr =
    "^" +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") +
    "$";

  return new RegExp(regexStr, "i").test(value);
}

export function filterModel(
  model: LemonadeModel,
  opts: LemonadeDiscoveryOptions,
): boolean {
  const isCloud =
    model.recipe === "cloud" ||
    Boolean(model.cloud_provider) ||
    model.labels?.includes("cloud");

  const cloudMode = opts.cloud_models ?? "include";
  if (cloudMode === "exclude" && isCloud) return false;
  if (cloudMode === "only" && !isCloud) return false;

  if (isCloud && opts.cloud_providers && opts.cloud_providers.length > 0) {
    if (
      !model.cloud_provider ||
      !opts.cloud_providers.includes(model.cloud_provider)
    ) {
      return false;
    }
  }

  const downloadedOnly = opts.downloaded_only ?? true;
  if (!isCloud && downloadedOnly && !model.downloaded) {
    return false;
  }

  const labels = model.labels ?? [];
  if (opts.exclude_labels && opts.exclude_labels.length > 0) {
    if (opts.exclude_labels.some((l) => labels.includes(l))) return false;
  }
  if (opts.include_labels && opts.include_labels.length > 0) {
    if (!opts.include_labels.some((l) => labels.includes(l))) return false;
  }

  const id = model.id;
  if (opts.exclude && opts.exclude.length > 0) {
    if (opts.exclude.some((p) => matchesPattern(id, p))) return false;
  }
  if (opts.include && opts.include.length > 0) {
    if (!opts.include.some((p) => matchesPattern(id, p))) return false;
  }

  return true;
}

export function resolveModelInfo(
  providerID: Provider.ID,
  model: LemonadeModel,
  opts: LemonadeDiscoveryOptions,
  override?: Record<string, unknown>,
): Model.Info {
  const rawContext =
    model.recipe_options?.ctx_size || model.context_length || 32768;
  const contextLimit = opts.max_context_limit
    ? Math.min(rawContext, opts.max_context_limit)
    : rawContext;

  const outputLimit =
    model.max_output_tokens || opts.default_output_limit || 8192;

  const isVision =
    model.labels?.includes("vision") ||
    model.labels?.includes("vlm") ||
    model.id.toLowerCase().includes("vl");

  const isToolCalling = model.labels?.includes("tool-calling") ?? false;

  const base: Model.Info = {
    ...Model.Info.default(providerID, Model.ID.make(model.id)),
    name: model.name || model.id,
    limit: { context: contextLimit, output: outputLimit },
    capabilities: {
      tools: isToolCalling,
      input: isVision ? ["text", "image"] : ["text"],
      output: ["text"],
    },
  };

  return deepMerge(
    base as unknown as Record<string, unknown>,
    override,
  ) as unknown as Model.Info;
}

type ProviderLookup = (id: string) => Promise<ExistingProvider | undefined>;

async function discoverServer(
  lookup: ProviderLookup,
  primaryId: string,
  id: string,
  serverOpts: LemonadeDiscoveryOptions,
  topOpts: LemonadeDiscoveryOptions,
): Promise<DiscoveredServer> {
  const providerID = Provider.ID.make(id);

  const mergedOpts: LemonadeDiscoveryOptions = {
    downloaded_only: true,
    exclude_labels: ["embedding", "tts", "stt"],
    ...topOpts,
    ...serverOpts,
  };

  const existing = await lookup(id);
  const providerSettings = (existing?.settings ?? {}) as Record<
    string,
    unknown
  >;

  const host =
    resolveValue(mergedOpts.host) ||
    resolveValue(providerSettings.baseURL as string | undefined) ||
    process.env.LEMONADE_HOST ||
    "http://127.0.0.1:13305";

  const cleanHost = host.replace(/\/+$/, "").replace(/\/v1$/, "");

  const apiKey =
    resolveValue(mergedOpts.apiKey) ||
    resolveValue(providerSettings.apiKey as string | undefined) ||
    process.env.LEMONADE_API_KEY ||
    process.env.LEMONADE_ADMIN_API_KEY;

  const timeoutMs = mergedOpts.timeout_ms ?? 3000;

  let discoveredModels: LemonadeModel[] = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const requestHeaders: Record<string, string> = {
      ...(mergedOpts.headers ?? {}),
    };
    if (apiKey && !requestHeaders["Authorization"]) {
      requestHeaders["Authorization"] = `Bearer ${apiKey}`;
    }

    try {
      const showAll = mergedOpts.downloaded_only === false;
      const modelsUrl = `${cleanHost}/v1/models${
        showAll ? "?show_all=true" : ""
      }`;
      const res = await fetch(modelsUrl, {
        headers: requestHeaders,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: LemonadeModel[] };
        if (Array.isArray(data.data)) {
          discoveredModels = data.data.filter((m) =>
            filterModel(m, mergedOpts),
          );
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Graceful offline fallback
  }

  const modelOverrides = {
    ...(mergedOpts.models ?? {}),
    ...(mergedOpts.overrides ?? {}),
  };

  const models = discoveredModels.map((model) =>
    resolveModelInfo(providerID, model, mergedOpts, modelOverrides[model.id]),
  );

  const info: Provider.Info = existing
    ? (existing as unknown as Provider.Info)
    : ({
        ...Provider.Info.empty(providerID),
        name:
          mergedOpts.name ??
          (id === primaryId ? "Lemonade" : `Lemonade (${id})`),
        activation: "enabled",
        package: LEMONADE_PROVIDER_PACKAGE,
        settings: {
          baseURL: `${cleanHost}/v1`,
          ...(apiKey ? { apiKey } : {}),
          ...(Object.keys(mergedOpts.headers ?? {}).length > 0
            ? { headers: mergedOpts.headers }
            : {}),
        },
      } as Provider.Info);

  return { id, info, models };
}

export const LemonadeDiscoveryPlugin = Plugin.define({
  id: "opencode-lemonade",
  async setup(ctx) {
    const opts = (ctx.options ?? {}) as LemonadeDiscoveryOptions;
    const primaryId = opts.provider_id ?? "lemonade";

    const lookup: ProviderLookup = async (id) => {
      try {
        const result = await ctx.provider.get({ providerID: id });
        return result?.data as unknown as ExistingProvider | undefined;
      } catch {
        return undefined;
      }
    };

    const serverIds = [
      primaryId,
      ...Object.keys(opts.servers ?? {}).filter((id) => id !== primaryId),
    ];

    const discovered: DiscoveredServer[] = [];
    for (const id of serverIds) {
      const serverOpts =
        id === primaryId
          ? (opts.servers?.[primaryId] ?? {})
          : opts.servers![id];
      discovered.push(
        await discoverServer(lookup, primaryId, id, serverOpts, opts),
      );
    }

    await ctx.provider.transform((editor) => {
      for (const server of discovered) {
        const record = editor.get(server.id);
        if (record) {
          const merged = new Map<string, Model.Info>(record.models);
          for (const model of server.models) {
            if (!merged.has(model.id)) merged.set(model.id, model);
          }
          editor.models.set(server.id, [...merged.values()]);
        } else {
          editor.add({ info: server.info, models: server.models });
        }
      }
    });
  },
});

export default LemonadeDiscoveryPlugin;
