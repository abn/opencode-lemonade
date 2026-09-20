---
type: Guide
title: Migrating from v1 to v2
description: Upgrade an existing opencode-lemonade install from the v1 plugin API to v2.
status: active
---

# Migrating from v1 to v2

Version 1.0.0 of this plugin targets the OpenCode v2 plugin API. The v1 plugin implementation does not run in v2, so the upgrade is a package upgrade plus a few config changes. The discovery behavior and all filtering options are unchanged.

## Who should migrate

- On OpenCode 2.x: upgrade to `opencode-lemonade@1` (or later).
- On OpenCode 1.x: stay on the v1 line, `opencode-lemonade@0.3.0`. Version 1.0.0 and later require v2.

## Install and config key

The OpenCode config key is `plugin` in v1 and `plugins` in v2, and the v2 entry is an object with `package` and `options`.

```jsonc
// v1
{
  "plugin": [["opencode-lemonade", { "downloaded_only": true }]],
}
```

```jsonc
// v2
{
  "plugins": [
    { "package": "opencode-lemonade", "options": { "downloaded_only": true } },
  ],
}
```

With the CLI, replace the v1 install with `opencode plugin add opencode-lemonade`.

## Provider shape

The plugin still registers the `lemonade` provider automatically, so zero-config installs need no change. If you pre-defined the provider to customize it, the fields move from the v1 provider block to the v2 `providers` block:

| v1                                  | v2                                    |
| :---------------------------------- | :------------------------------------ |
| `provider.lemonade.npm`             | `providers.lemonade.package`          |
| `provider.lemonade.options.baseURL` | `providers.lemonade.settings.baseURL` |
| `provider.lemonade.options.apiKey`  | `providers.lemonade.settings.apiKey`  |
| `provider.lemonade.options.headers` | `providers.lemonade.settings.headers` |

The default package is now `@opencode/ai/providers/openai-compatible`.

## Per-model overrides

Overrides use v2 `Model.Info` field names. The v1 field names no longer apply.

| v1 model field                   | v2 model field                               |
| :------------------------------- | :------------------------------------------- |
| `attachment: true`               | `capabilities.input: ["text", "image"]`      |
| `modalities.input` / `.output`   | `capabilities.input` / `capabilities.output` |
| `tool_call`                      | `capabilities.tools`                         |
| `reasoning: true`                | `compatibility.reasoningField`               |
| `interleaved: { field: "..." }`  | `compatibility.reasoningField`               |
| `id`                             | `modelID`                                    |
| `limit.context` / `limit.output` | unchanged                                    |
| `name`                           | unchanged                                    |

```jsonc
// v1
{
  "overrides": {
    "user.My-Model": {
      "id": "my-deployment-name",
      "tool_call": false,
      "reasoning": true,
      "interleaved": { "field": "reasoning_content" },
    },
  },
}
```

```jsonc
// v2
{
  "overrides": {
    "user.My-Model": {
      "modelID": "my-deployment-name",
      "capabilities": { "tools": false },
      "compatibility": { "reasoningField": "reasoning_content" },
    },
  },
}
```

## Reasoning

The plugin still maps the Lemonade `reasoning` label, now onto v2's
`compatibility.reasoningField: "reasoning_content"` instead of the v1
`reasoning` and `interleaved` fields. Override `compatibility.reasoningField` per
model if the backend returns reasoning under a different field.

Thinking effort works differently in v2: it is a per-model `variants` setting
(`reasoningEffort`) rather than a single flag, and it is declared through
overrides because Lemonade supports it per model and template. See the
[reasoning guide](reasoning.md) for examples and the backend support caveats.

## Removed features

- `small_model`: v2 has no plugin-facing small-model setting. Remove the option; select a small model through OpenCode itself.

## Existing provider models

If a provider is already defined in config, the plugin preserves its settings and the models it defines. A discovered model whose id is already defined is left untouched; only new discovered ids are added. This differs from v1, which deep-merged config model entries field by field over discovered metadata.

## Verify the upgrade

1. Confirm the plugin id appears in the active plugin list (`opencode plugin list`).
2. Open the model picker and check that the Lemonade models appear with their context and output limits.
3. Exercise a vision model, a tool-calling model, and a reasoning model to confirm the capabilities carried over.
4. If the server is offline, confirm OpenCode still starts and registers the provider with no models.

See the [usage guide](configuration.md) for the full v2 configuration and the [options reference](../reference/options.md) for every option.
