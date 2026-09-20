---
type: Guide
title: Usage and configuration
description: How to install and configure the plugin.
status: active
---

# Usage and configuration

This is a v2 OpenCode plugin and requires OpenCode 2.x. Upgrading from v1? See the [migration guide](migration-v2.md).

## Installation

### From npm

Add the plugin with the CLI:

```bash
opencode plugin add opencode-lemonade
```

Or declare it in the OpenCode config:

```jsonc
{
  "plugins": ["opencode-lemonade"],
}
```

### Local build

Build and copy the compiled plugin into a project plugin directory:

```bash
npm run build
mkdir -p .opencode/plugins
cp dist/lemonade-discovery.js .opencode/plugins/
```

OpenCode loads `.js` and `.ts` files from `.opencode/plugins/` in a project and
from `~/.config/opencode/plugins/` globally.

## Zero-config use

With no provider defined, the plugin creates the `lemonade` provider backed by `@opencode/ai/providers/openai-compatible`, pointing at the local Lemonade server. The host defaults to `LEMONADE_HOST` or `http://127.0.0.1:13305`, and the API key to `LEMONADE_API_KEY` followed by `LEMONADE_ADMIN_API_KEY`.

## Options

Discovery options are passed as plugin options, in the v2 `plugins` object entry:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-lemonade",
      "options": {
        "downloaded_only": true,
        "exclude_labels": ["embedding", "tts", "stt"],
        "overrides": {},
      },
    },
  ],
}
```

See the [options reference](../reference/options.md) for the full list,
defaults, and filtering behavior.

The examples below show the plugin options object; place it inside the
`options` key as shown above.

## Per-model overrides

Discovered metadata merges under any per-model override, so a single field can be tuned without losing the rest. Overrides come from the plugin `models` and `overrides` options. Nested objects merge; scalars and arrays replace.

Overrides use v2 `Model.Info` field names, so capabilities live under `capabilities` and the API model id is `modelID`:

```jsonc
{
  "overrides": {
    "Qwen2.5-VL-7B-Instruct": {
      "name": "Qwen 2.5 VL (local)",
      "limit": { "output": 16384 },
      "capabilities": { "tools": true },
    },
  },
}
```

## Configuration scenarios

Non-trivial setups. Each example shows the plugin options object.

### Capability overrides and deployment names

Auto-detected capabilities can be forced or cleared per model. For example,
disable tools for a model that does not support them, and map a model id to an
API-side deployment name:

```jsonc
{
  "overrides": {
    "user.My-Model": {
      "modelID": "my-deployment-name",
      "capabilities": { "tools": false },
    },
  },
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

### Multiple servers

Register additional named Lemonade servers as their own OpenCode providers. The
top-level options act as defaults; each server entry can override any of them,
and an entry keyed by the primary provider id merges into it:

```jsonc
{
  "servers": {
    "work": {
      "host": "https://lemonade.example.com",
      "apiKey": "{env:WORK_LEMONADE_API_KEY}",
      "downloaded_only": false,
    },
  },
}
```

This registers the `work` provider alongside the default `lemonade` provider,
with models discovered from each server.
