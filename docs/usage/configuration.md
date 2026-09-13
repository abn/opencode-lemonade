---
type: Guide
title: Usage and configuration
description: How to install and configure the plugin.
status: active
---

# Usage and configuration

## Installation

### From npm

Add the plugin to the OpenCode config:

```jsonc
{
  "plugin": ["opencode-lemonade"],
}
```

### Local build

Build and copy the compiled plugin into the plugins directory:

```bash
npm run build
mkdir -p ~/.config/opencode/plugins
cp dist/lemonade-discovery.js ~/.config/opencode/plugins/
```

OpenCode loads any `.js` or `.ts` file found in the plugins directory.

## Zero-config use

With no provider defined, the plugin creates the `lemonade` provider backed by `@ai-sdk/openai-compatible`, pointing at the local Lemonade server. The host defaults to `LEMONADE_HOST` or `http://127.0.0.1:13305`, and the API key to `LEMONADE_ADMIN_API_KEY` followed by `LEMONADE_API_KEY`.

## Options

Discovery options are passed as plugin options, in the `["name", { options }]`
form of the `plugin` config key:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-lemonade",
      {
        "downloaded_only": true,
        "exclude_labels": ["embedding", "tts", "stt"],
        "overrides": {},
        "small_model": "Qwen3-0.6B-GGUF",
      },
    ],
  ],
}
```

See the [options reference](../reference/options.md) for the full list,
defaults, and filtering behavior.

For backward compatibility, options can also be nested under
`provider.lemonade.options.discovery`; the plugin reads both, with plugin
options taking precedence.

The examples below show the plugin options object; place it inside the
`plugin` tuple as shown above.

## Per-model overrides

Discovered metadata merges under any per-model override, so a single field can be tuned without losing the rest. Overrides come from the plugin `models` and `overrides` options, or existing `provider.lemonade.models` entries, in that order of precedence. Nested objects merge; scalars and arrays replace.

```jsonc
{
  "models": {
    "Qwen2.5-VL-7B-Instruct": {
      "name": "Qwen 2.5 VL (local)",
      "limit": { "output": 16384 },
    },
  },
}
```

## Configuration scenarios

Non-trivial setups. Each example shows the plugin options object.

### Capability overrides

Auto-detected capabilities can be forced or cleared per model. For example,
surface reasoning content from a reasoning model, and map a model id to an
API-side deployment name:

```jsonc
{
  "overrides": {
    "DeepSeek-R1-0704": {
      "reasoning": true,
      "interleaved": { "field": "reasoning_content" },
    },
    "user.My-Model": {
      "id": "my-deployment-name",
      "tool_call": false,
    },
  },
}
```

### Small model for utility tasks

Route OpenCode utility tasks (session titles, compaction) to a small local
model. Bare ids are prefixed with the provider id, so `Qwen3-0.6B-GGUF` sets
`small_model` to `lemonade/Qwen3-0.6B-GGUF`:

```jsonc
{
  "small_model": "Qwen3-0.6B-GGUF",
}
```

### Custom headers for gateway auth

Send extra headers on discovery and every provider request, for example when
the server sits behind an authenticating gateway:

```jsonc
{
  "headers": {
    "X-Gateway-Key": "replace-with-your-gateway-key",
  },
}
```

### Cloud models

Expose cloud backends alongside local models. Cloud models are always listed as
downloaded, so `downloaded_only: false` is not needed; `cloud_providers`
restricts which cloud backends appear:

```jsonc
{
  "cloud_models": "include",
  "cloud_providers": ["openrouter", "fireworks"],
}
```

### Full local catalog

Include local models whose weights are not yet on disk. This requests the full
catalog with `show_all=true`:

```jsonc
{
  "downloaded_only": false,
}
```
