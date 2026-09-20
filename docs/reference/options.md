---
type: Reference
title: Options reference
description: Every plugin option, its type, default, and meaning.
status: active
---

# Options reference

Options are passed as plugin options, using the `{ "package", "options" }`
object form of the `plugins` config key.

| Option                 | Type                               | Default                                         | Description                                                                                                                                            |
| :--------------------- | :--------------------------------- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                 | `string`                           | `$LEMONADE_HOST` or `http://127.0.0.1:13305`    | Lemonade server host URL.                                                                                                                              |
| `apiKey`               | `string`                           | `$LEMONADE_API_KEY` / `$LEMONADE_ADMIN_API_KEY` | API key for authenticated servers.                                                                                                                     |
| `provider_id`          | `string`                           | `"lemonade"`                                    | OpenCode provider identifier to inject models into.                                                                                                    |
| `downloaded_only`      | `boolean`                          | `true`                                          | Filters out local models whose weights are not on disk. Cloud models are unaffected. When `false`, the full catalog is requested with `show_all=true`. |
| `cloud_models`         | `"include" \| "exclude" \| "only"` | `"include"`                                     | Controls whether cloud backends are discovered.                                                                                                        |
| `cloud_providers`      | `string[]`                         | `undefined`                                     | Allowlist of cloud provider IDs to include.                                                                                                            |
| `include`              | `string[]`                         | `undefined`                                     | Glob or regex patterns of model IDs to include.                                                                                                        |
| `exclude`              | `string[]`                         | `[]`                                            | Glob or regex patterns of model IDs to exclude.                                                                                                        |
| `include_labels`       | `string[]`                         | `undefined`                                     | Only include models matching one or more of these labels.                                                                                              |
| `exclude_labels`       | `string[]`                         | `["embedding", "tts", "stt"]`                   | Exclude models matching any of these labels.                                                                                                           |
| `default_output_limit` | `number`                           | `8192`                                          | Default output limit when the model does not report one.                                                                                               |
| `max_context_limit`    | `number`                           | `undefined`                                     | Upper bound clamp for model context limits.                                                                                                            |
| `timeout_ms`           | `number`                           | `3000`                                          | Fetch timeout. If the server is slow, startup continues.                                                                                               |
| `name`                 | `string`                           | `"Lemonade"`                                    | Provider display name; named servers default to `Lemonade (<id>)`.                                                                                     |
| `models`               | `Record<string, object>`           | `undefined`                                     | Per-model overrides keyed by model id, deep-merged over discovered metadata.                                                                           |
| `overrides`            | `Record<string, object>`           | `undefined`                                     | Same shape as `models`; wins when both set the same model.                                                                                             |
| `headers`              | `Record<string, string>`           | `undefined`                                     | Custom headers sent on discovery and copied into the provider settings.                                                                                |
| `servers`              | `Record<string, object>`           | `undefined`                                     | Additional named Lemonade servers to register as providers; each entry is a full options object merged over the top-level options.                     |

## Filtering behavior

Models are kept when every active filter passes:

- `downloaded_only` applies to local models only; cloud models bypass it.
- `cloud_models` and `cloud_providers` gate cloud backends.
- `include_labels` and `exclude_labels` match against the model label list.
- `include` and `exclude` match against the model id using glob wildcards (`*`, `?`) or regex patterns (`/pattern/flags`).

## Per-model overrides

Discovered metadata can be tuned per model id through two layers, merged in
increasing precedence:

1. Discovered metadata from the server catalog.
2. `models` and `overrides` entries in the plugin options.

Overrides use v2 `Model.Info` field names, the same shape OpenCode stores for a
model: `name`, `limit.context`, `limit.output`, `capabilities.tools`,
`capabilities.input`, `capabilities.output`, `compatibility.reasoningField`,
`variants`, `modelID`, `status`, and so on. `modelID` maps the entry to a
different API model id, for example an Azure-style deployment name where the
server model id differs from the id sent in requests.

Merging is recursive: nested objects merge field by field, while scalar values
and arrays replace the discovered value. `undefined` values are ignored, so an
override can never clear a field by setting it to `undefined`. This lets a
config tune a single field, such as `name` or `limit.output`, without losing
the rest of the discovered entry.

When a provider already exists in the OpenCode config, the plugin preserves its
settings and any models it defines. A discovered model whose id is already
defined by the provider is left untouched; only new ids are added.

Models the server labels `reasoning` are registered with
`compatibility.reasoningField: "reasoning_content"`, which is how v2 marks a
model as reasoning-capable and selects the response field that carries
reasoning. Override `compatibility.reasoningField` per model when a backend uses
a different field, such as `reasoning`.

Thinking effort is controlled through model `variants`. See the
[reasoning guide](../usage/reasoning.md) for the mechanism and the support
caveats.
