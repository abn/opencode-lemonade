---
type: Architecture
title: Plugin architecture
description: How the plugin fits into OpenCode's startup lifecycle.
status: active
---

# Plugin architecture

The plugin exposes a single hook, `config`, that OpenCode calls during startup. The hook:

1. Merges plugin options with the existing provider configuration.
2. Resolves the host and API key through the layered resolution order.
3. Fetches `/v1/models` from the server, adding `?show_all=true` when the full catalog is requested.
4. Filters the catalog using the merged options.
5. Creates the provider entry (with `@ai-sdk/openai-compatible`) if absent.
6. Registers each model with its context and output limits, mapping capability labels (vision, tool-calling, reasoning), and deep-merges any per-model overrides (`discovery.models`, `discovery.overrides`) and pre-configured `provider.<id>.models` entries over the discovered metadata.

If the server is offline or slow, the hook returns the provider entry unchanged, so startup never blocks on the server.

## Capability mapping

Lemonade model labels map to OpenCode model capabilities:

| Lemonade label                             | OpenCode fields                                           |
| :----------------------------------------- | :-------------------------------------------------------- |
| `vision` / `vlm` (or `vl` in the model id) | `attachment: true`, `modalities.input: ["text", "image"]` |
| `tool-calling`                             | `tool_call: true`                                         |
| `reasoning`                                | `reasoning: true`                                         |

Any of these can be overridden or extended per model through the overrides mechanism; see the [options reference](../reference/options.md).

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
- `test/lemonade-discovery.test.ts` unit tests for filtering, resolution, and the hook
- `dist/` compiled output (built, not committed)
