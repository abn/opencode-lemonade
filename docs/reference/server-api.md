---
type: Reference
title: Lemonade server API contract
description: The /v1/models response shape the plugin depends on.
status: active
---

# Lemonade server API contract

The plugin reads the model catalog from `GET {host}/v1/models`, the canonical
path. The server also serves the same catalog under the `/api/v1` prefix as a
compatibility alias.

## Query parameters

| Parameter  | Type    | Meaning                                                                              |
| :--------- | :------ | :----------------------------------------------------------------------------------- |
| `show_all` | boolean | Return the full catalog including models without local weights. Defaults to `false`. |

The plugin sends `show_all=true` only when `downloaded_only` is `false`.
Otherwise it relies on the server default of downloaded-only models.

## Response

The response is OpenAI-compatible: `{ "object": "list", "data": [ ... ] }`.
Fields the plugin consumes:

| Field                     | Type       | Used for                                                                                                  |
| :------------------------ | :--------- | :-------------------------------------------------------------------------------------------------------- |
| `id`                      | `string`   | Model id; the key under `provider.<id>.models`.                                                           |
| `name`                    | `string`   | Display name fallback. Not currently sent by the server.                                                  |
| `labels`                  | `string[]` | Capability and modality labels (`vision`, `vlm`, `tool-calling`, `reasoning`, `embedding`, `tts`, `stt`). |
| `recipe`                  | `string`   | `"cloud"` for cloud-routed models.                                                                        |
| `downloaded`              | `boolean`  | Whether local weights are on disk.                                                                        |
| `cloud_provider`          | `string`   | Cloud provider id on cloud entries.                                                                       |
| `context_length`          | `number`   | Resolved context window.                                                                                  |
| `max_output_tokens`       | `number`   | Maximum output tokens, provided by Lemonade since lemonade-sdk/lemonade PR 3568.                          |
| `recipe_options.ctx_size` | `number`   | Saved per-model context size.                                                                             |

## Resolution chains

- Context: `recipe_options.ctx_size`, then `context_length`, then `32768`,
  clamped by `max_context_limit` when set.
- Output: `max_output_tokens`, then `default_output_limit` (`8192`).
- Name: `name`, then `id`.

## Model entry mapping

Each catalog entry becomes an OpenCode provider model entry:

| OpenCode field  | Source                                 |
| :-------------- | :------------------------------------- |
| `limit.context` | context resolution chain               |
| `limit.output`  | output resolution chain                |
| `attachment`    | `vision`/`vlm` label or `vl` in the id |
| `modalities`    | `text` and `image` input when vision   |
| `tool_call`     | `tool-calling` label                   |
| `reasoning`     | `reasoning` label                      |

The per-model `id` field and any other OpenCode model field can be set through
`models` / `overrides`; see the [options reference](options.md).

## Tracking

The upstream reference is `lemonade/docs/api/lemonade.md` in the Lemonade
repository. The list endpoint and `max_output_tokens` are documented here until
they land upstream.
