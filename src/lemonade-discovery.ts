import * as fs from "node:fs";

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
  small_model?: string;
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

export const LemonadeDiscoveryPlugin = async (
  _input?: unknown,
  options?: LemonadeDiscoveryOptions,
) => {
  return {
    config: async (config: {
      provider?: Record<
        string,
        {
          name?: string;
          npm?: string;
          options?: Record<string, unknown>;
          models?: Record<string, unknown>;
          [key: string]: unknown;
        }
      >;
      [key: string]: unknown;
    }) => {
      const opts: LemonadeDiscoveryOptions = options ?? {};
      const providerId = opts.provider_id ?? "lemonade";

      if (!config.provider) {
        config.provider = {};
      }
      const provider = config.provider;

      const registerServer = async (
        id: string,
        serverOpts: LemonadeDiscoveryOptions,
      ) => {
        const mergedOpts: LemonadeDiscoveryOptions = {
          downloaded_only: true,
          exclude_labels: ["embedding", "tts", "stt"],
          ...opts,
          ...serverOpts,
        };

        const existingProvider = provider[id];
        const providerOpts = (existingProvider?.options ?? {}) as Record<
          string,
          unknown
        >;

        const host =
          resolveValue(mergedOpts.host) ||
          resolveValue(providerOpts.baseURL as string | undefined) ||
          process.env.LEMONADE_HOST ||
          "http://127.0.0.1:13305";

        const cleanHost = host.replace(/\/+$/, "").replace(/\/v1$/, "");

        const apiKey =
          resolveValue(mergedOpts.apiKey) ||
          resolveValue(providerOpts.apiKey as string | undefined) ||
          process.env.LEMONADE_API_KEY ||
          process.env.LEMONADE_ADMIN_API_KEY;

        const timeoutMs = mergedOpts.timeout_ms ?? 3000;
        const defaultOutputLimit = mergedOpts.default_output_limit ?? 8192;

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

        if (!provider[id]) {
          const providerHeaders = { ...(mergedOpts.headers ?? {}) };
          provider[id] = {
            name:
              mergedOpts.name ??
              (id === providerId ? "Lemonade" : `Lemonade (${id})`),
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: `${cleanHost}/v1`,
              ...(apiKey ? { apiKey } : {}),
              ...(Object.keys(providerHeaders).length > 0
                ? { headers: providerHeaders }
                : {}),
            },
            models: {},
          };
        }

        const prov = provider[id];
        if (!prov.models) {
          prov.models = {};
        }

        const modelOverrides = {
          ...(mergedOpts.models ?? {}),
          ...(mergedOpts.overrides ?? {}),
        };

        for (const model of discoveredModels) {
          const rawCtx =
            model.recipe_options?.ctx_size || model.context_length || 32768;
          const ctxLimit = mergedOpts.max_context_limit
            ? Math.min(rawCtx, mergedOpts.max_context_limit)
            : rawCtx;

          const outputLimit = model.max_output_tokens || defaultOutputLimit;

          const isVision =
            model.labels?.includes("vision") ||
            model.labels?.includes("vlm") ||
            model.id.toLowerCase().includes("vl");

          const isToolCalling = model.labels?.includes("tool-calling") ?? false;
          const isReasoning = model.labels?.includes("reasoning") ?? false;

          const baseEntry: Record<string, unknown> = {
            name: model.name || model.id,
            limit: {
              context: ctxLimit,
              output: outputLimit,
            },
            ...(isVision
              ? {
                  attachment: true,
                  modalities: {
                    input: ["text", "image"],
                    output: ["text"],
                  },
                }
              : {}),
            ...(isToolCalling ? { tool_call: true } : {}),
            ...(isReasoning ? { reasoning: true } : {}),
          };

          const specificOverride = modelOverrides[model.id];
          const existingEntry = prov.models[model.id] as
            Record<string, unknown> | undefined;

          const mergedEntry = deepMerge(
            deepMerge(baseEntry, specificOverride),
            existingEntry,
          );

          prov.models[model.id] = mergedEntry;
        }
      };

      await registerServer(providerId, opts.servers?.[providerId] ?? {});

      for (const [id, serverOpts] of Object.entries(opts.servers ?? {})) {
        if (id === providerId) continue;
        await registerServer(id, serverOpts);
      }

      if (opts.small_model) {
        const smallModel = resolveValue(opts.small_model);
        if (smallModel) {
          config.small_model = smallModel.includes("/")
            ? smallModel
            : `${providerId}/${smallModel}`;
        }
      }
    },
  };
};

export default LemonadeDiscoveryPlugin;
