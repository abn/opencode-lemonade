---
type: Guide
title: Reasoning and thinking effort
description: How reasoning capability and thinking effort map from Lemonade models into OpenCode.
status: active
---

# Reasoning and thinking effort

Two separate things carry reasoning from Lemonade into OpenCode. A per-model
capability flag marks a model as reasoning-capable, and optional per-request
thinking effort controls how much a model thinks. The plugin sets the first
automatically and leaves the second opt-in per model.

## Reasoning capability

The plugin maps the Lemonade `reasoning` label to
`compatibility.reasoningField: "reasoning_content"`. That marks the model as
reasoning-capable in the picker and tells OpenCode which response field carries
the model's reasoning. Models without the label are not marked.

Override the field per model when a backend returns reasoning under a different
name:

```jsonc
{
  "overrides": {
    "some.Model": {
      "compatibility": { "reasoningField": "reasoning" },
    },
  },
}
```

## Thinking effort

Thinking effort is a request property, not a capability. It is expressed as
model variants. Each variant is a named set of generation settings, and
`reasoningEffort` is the semantic option that OpenCode lowers to the
`reasoning_effort` field for the OpenAI-compatible protocol.

OpenCode does not generate variants for custom OpenAI-compatible providers, so a
Lemonade model has no effort switcher unless you declare one through overrides.
List every variant you want, including the default, because variants replace the
discovered value as a whole array:

```jsonc
{
  "overrides": {
    "openrouter.deepseek/deepseek-v4-flash-0731": {
      "variants": [
        { "id": "default", "settings": {} },
        { "id": "high", "settings": { "reasoningEffort": "high" } },
        { "id": "max", "settings": { "reasoningEffort": "max" } },
      ],
    },
  },
}
```

To control only whether a model thinks, add a variant that turns thinking off
with `reasoningEffort: "none"`:

```jsonc
{
  "overrides": {
    "Qwen3-0.6B-GGUF": {
      "variants": [
        { "id": "thinking", "settings": {} },
        { "id": "off", "settings": { "reasoningEffort": "none" } },
      ],
    },
  },
}
```

## What Lemonade supports

Lemonade accepts `reasoning_effort` and forwards it to the model backend. Whether
it changes anything depends on the backend and the model's chat template:

| Backend   | Behavior                                                                                                        |
| :-------- | :-------------------------------------------------------------------------------------------------------------- |
| llama.cpp | `reasoning_effort: "none"` is a hard per-request disable. Other values are template-defined.                    |
| vLLM      | The value is merged into the model's chat template as `reasoning_effort`, and `enable_thinking` is set from it. |
| Cloud     | Forwarded to the upstream provider, which enforces its own rules.                                               |

Not every model labelled `reasoning` honors effort levels:

- Templates that ignore `reasoning_effort` always think, regardless of variant.
- Accepted values are model-specific. The vLLM DeepSeek v4 template, for
  example, accepts only `high`, `max`, and none; other values fail.
- Some models use a thinking toggle (`enable_thinking`, `/no_think`) rather than
  effort levels.

Disabling thinking is the one control Lemonade normalizes across backends. When a
request carries `enable_thinking: false`, `thinking: false`, or
`thinking: { "type": "disabled" }`, Lemonade sets `reasoning_effort: "none"`, sets
`chat_template_kwargs.enable_thinking: false` where possible, and prepends
`/no_think` as a fallback.

## Recommendation

Add effort variants per model, only for models you have confirmed support them.
Prefer a disable-only variant (`reasoningEffort: "none"`) when you just want to
control whether a model thinks. Do not assume every model the server labels
`reasoning` accepts effort levels.
