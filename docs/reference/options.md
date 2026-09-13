---
type: Reference
title: Options reference
description: Every plugin option, its type, default, and meaning.
status: active
---

# Options reference

Options are passed as plugin options, using the `["name", { options }]` form of
the `plugin` config key. For backward compatibility they can also be nested
under `provider.<id>.options.discovery`; plugin options take precedence.

| Option                 | Type                               | Default                                         | Description                                                                                                                                            |
| :--------------------- | :--------------------------------- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                 | `string`                           | `$LEMONADE_HOST` or `http://127.0.0.1:13305`    | Lemonade server host URL.                                                                                                                              |
| `apiKey`               | `string`                           | `$LEMONADE_ADMIN_API_KEY` / `$LEMONADE_API_KEY` | API key for authenticated servers.                                                                                                                     |
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
| `models`               | `Record<string, object>`           | `undefined`                                     | Per-model overrides keyed by model id, deep-merged over discovered metadata.                                                                           |
| `overrides`            | `Record<string, object>`           | `undefined`                                     | Same shape as `models`; wins when both set the same model.                                                                                             |
| `headers`              | `Record<string, string>`           | `undefined`                                     | Custom headers sent on discovery and copied into the provider options.                                                                                 |
| `small_model`          | `string`                           | `undefined`                                     | Model reference for OpenCode utility tasks; bare ids are prefixed with the provider id.                                                                |

## Filtering behavior

Models are kept when every active filter passes:

- `downloaded_only` applies to local models only; cloud models bypass it.
- `cloud_models` and `cloud_providers` gate cloud backends.
- `include_labels` and `exclude_labels` match against the model label list.
- `include` and `exclude` match against the model id using glob wildcards (`*`, `?`) or regex patterns (`/pattern/flags`).

## Per-model overrides

Discovered metadata can be tuned per model id through three layers, merged in
increasing precedence:

1. Discovered metadata from the server catalog.
2. `models` and `overrides` entries in the plugin options.
3. Existing entries under `provider.<id>.models` in the OpenCode config.

Merging is recursive: nested objects merge field by field, while scalar values
and arrays replace the discovered value. `undefined` values are ignored, so an
override can never clear a field by setting it to `undefined`. This lets a
config tune a single field, such as `name` or `limit.output`, without losing
the rest of the discovered entry.

The `id` field maps the entry to a different API model id, for example an
Azure-style deployment name where the server model id differs from the id sent
in requests.
