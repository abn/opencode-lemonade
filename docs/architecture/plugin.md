---
type: Architecture
title: Plugin architecture
description: How the plugin fits into OpenCode's v2 plugin lifecycle.
status: active
---

# Plugin architecture

The plugin default-exports a v2 plugin definition, `Plugin.define({ id: "opencode-lemonade", setup })`. OpenCode calls
`setup(ctx)` when the plugin loads. Because the v2 transform callbacks are synchronous and replayable, discovery runs
first and the results are captured, then a single `ctx.provider.transform` registers everything:

1. Resolves each server's host and API key through the layered resolution order.
2. Fetches `/v1/models` from the server, adding `?show_all=true` when the full catalog is requested.
3. Filters the catalog using the merged options.
4. Registers each model as a `Model.Info` with its context and output limits plus label-derived capabilities, and deep-merges any per-model overrides (`models`, `overrides`) over the discovered metadata.
5. Adds the provider (with `package: "@opencode/ai/providers/openai-compatible"` and `activation: "enabled"`) when absent. When the provider already exists in config, the plugin preserves it and only adds discovered models whose ids are not already defined.

If the server is offline or slow, the provider is still registered with no models, so startup never blocks on the server.

The v2 context is both the OpenCode client and the plugin extension API. The plugin reads `ctx.options`, optionally reads
existing provider settings through `ctx.provider.get`, and registers providers and models through
`ctx.provider.transform`.

## Capability mapping

Lemonade model labels map to v2 `Model.Info` fields:

| Lemonade label                             | v2 model field                          |
| :----------------------------------------- | :-------------------------------------- |
| `vision` / `vlm` (or `vl` in the model id) | `capabilities.input: ["text", "image"]` |
| `tool-calling`                             | `capabilities.tools: true`              |

The v2 model schema has no `reasoning` capability, so the plugin no longer maps the Lemonade `reasoning` label. Any of
these can be overridden or extended per model through the overrides mechanism; see the [options reference](../reference/options.md).

## Lemonade MCP gateway

Lemonade also ships an MCP server at `POST {host}/mcp` (Streamable HTTP,
tools-only) for MCP-native clients. It exposes the model catalog as tools
(`lemonade_list_models`, `lemonade_chat`, `lemonade_transcribe_audio`,
`lemonade_generate_image`, `lemonade_omni`, `lemonade_docs`) and authenticates
with `LEMONADE_API_KEY`.

Clients that cannot use Lemonade's OpenAI-compatible API directly can register
it as a remote MCP server:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "lemonade": {
      "type": "remote",
      "url": "http://127.0.0.1:13305/mcp",
      "headers": {
        "Authorization": "Bearer {env:LEMONADE_API_KEY}",
      },
    },
  },
}
```

This project does not configure the gateway, because OpenCode integrates with
Lemonade natively through the provider this plugin wires up; see the [design
rationale](../design/rationale.md).

Source layout:

- `src/lemonade-discovery.ts` plugin source and exports
- `test/lemonade-discovery.test.ts` unit tests for filtering, resolution, and discovery
- `dist/` compiled output (built, not committed)
