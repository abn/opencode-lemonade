# opencode-lemonade

Dynamic model discovery and zero-config provider initialization for [Lemonade](https://github.com/lemonade-sdk/lemonade) in [OpenCode](https://opencode.ai).

## Overview

This plugin connects OpenCode to a Lemonade server, discovering all available or downloaded models at startup through the canonical OpenCode `config` plugin hook. It removes the need to manually enumerate models, context sizes, output token limits, and vision modalities in your `opencode.json` / `opencode.jsonc`.

### Key features

- **Zero-config auto-registration**: automatically configures the `lemonade` provider with `@ai-sdk/openai-compatible` if not already defined.
- **Dynamic model discovery**: queries the Lemonade server (`/v1/models`) and registers all matching models under `provider.lemonade.models`.
- **Hardware and context awareness**: reads context length (`ctx_size` / `context_length`) and output token limits from Lemonade model specs.
- **Multimodal / vision detection**: detects vision models (e.g. Qwen 2.5 VL) from labels (`vision`, `vlm`) or ids, setting `attachment: true` and image-input modalities.
- **Capability mapping**: maps Lemonade labels (`tool-calling`, `reasoning`) to OpenCode model capabilities (`tool_call`, `reasoning`).
- **Downloaded-only filtering**: distinguishes local on-disk weights from cloud backends, so only ready-to-run local models are exposed by default.
- **Flexible pattern filtering**: filter models with glob wildcards (`*`, `?`), regular expressions (`/.../flags`), or label tags.
- **Layered API resolution**: respects explicit options, `{env:...}` / `{file:...}` templates, and Lemonade environment variables (`LEMONADE_HOST`, `LEMONADE_ADMIN_API_KEY`, `LEMONADE_API_KEY`).

## Why a dedicated plugin

OpenCode only auto-polls a small hardcoded set of providers (such as Ollama, LM Studio, and vLLM). Custom OpenAI-compatible endpoints are treated as static providers:

1. **No polling for custom endpoints**: every model, quant, or newly downloaded checkpoint must be hardcoded in `opencode.jsonc`.
2. **Metadata blindness in the standard catalog**: the plain `/v1/models` response does not carry context window limits, vision capabilities, or download status. Generic discovery would cap prompt capacity, disable image input, and dump hundreds of undownloaded models into the picker.
3. **Canonical extension lifecycle**: like `opencode-litellm` and similar plugins, this plugin hooks OpenCode's startup lifecycle to hydrate it from Lemonade's rich catalog.

See [the design rationale](docs/design/rationale.md) for more detail.

## Installation

### From npm

Add the plugin to your OpenCode config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-lemonade"],
}
```

### From GitHub Releases

```bash
mkdir -p ~/.config/opencode/plugins
curl -L -o ~/.config/opencode/plugins/lemonade-discovery.js \
  https://github.com/abn/opencode-lemonade/releases/latest/download/lemonade-discovery.js
```

### Local build

```bash
npm run build
mkdir -p ~/.config/opencode/plugins
cp dist/lemonade-discovery.js ~/.config/opencode/plugins/
```

OpenCode loads any `.js` or `.ts` file found in `~/.config/opencode/plugins/`.

## Configuration

The plugin works with zero configuration using default environment variables. Discovery options are passed as plugin options:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-lemonade",
      {
        "downloaded_only": true,
        "cloud_models": "include",
        "exclude": ["insecure.*", "*embedding*", "*whisper*", "*:batch"],
        "exclude_labels": ["embedding", "tts", "stt"],
        "default_output_limit": 8192,
        "max_context_limit": 128000,
      },
    ],
  ],
}
```

To point at a custom host or API key, pre-define the provider; the plugin keeps it and only adds the discovered models:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-lemonade"],
  "provider": {
    "lemonade": {
      "name": "Lemonade",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "{env:LEMONADE_HOST}/v1",
        "apiKey": "{env:LEMONADE_API_KEY}",
      },
    },
  },
}
```

For backward compatibility, options can also be nested under
`provider.lemonade.options.discovery`; the plugin still reads them there.

### Environment variables

Resolution precedence for host and API key:

1. Explicit option or provider configuration (`options.baseURL`, `options.apiKey`).
2. Template expansion (`{env:VARIABLE_NAME}` or `{file:/path/to/secret}`).
3. Environment variables: `LEMONADE_HOST`, `LEMONADE_ADMIN_API_KEY` (admin key first), then `LEMONADE_API_KEY`.

## Options

See the [options reference](docs/reference/options.md) for every option, its type, default, and filtering behavior.

## Development

```bash
make setup      # install dependencies
make check      # full quality gate: okf, lint, test, build
make test       # run the test suite
```

## License

MIT. See [LICENSE](LICENSE).
