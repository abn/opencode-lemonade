---
type: Design
title: Design rationale
description: Key decisions behind the plugin's behavior.
status: active
---

# Design rationale

## Discovery over static config

OpenCode does not poll custom OpenAI-compatible endpoints. Registering models at load through the provider transform keeps the provider in sync with the server without manual editing.

## Rich metadata from the catalog

The catalog reports context size and output limits per model. Mapping those onto the provider model limits gives correct prompt capacity instead of the small defaults generic providers fall back to.

## Downloaded-only filtering

The catalog lists cloud backends and available downloads alongside local weights. Defaulting to downloaded-only keeps the model picker clean while an explicit option restores the full catalog.

## Layered value resolution

Host and API key resolve in order: explicit option, provider configuration, environment variable, default. `{env:...}` and `{file:...}` templates work whole-string and embedded, so secrets stay out of the config file.

## MCP gateway stays external

Lemonade exposes its inference as an MCP server (`POST /mcp`, Streamable HTTP, tools-only) so MCP-native clients such as Claude Desktop, GitHub Copilot, or Cursor can call local models as tools. This plugin deliberately does not register that gateway, for three reasons.

First, it is redundant in OpenCode. OpenCode consumes Lemonade models natively through the provider this plugin configures. Wiring the MCP endpoint into OpenCode as well would expose `lemonade_chat` as an agent tool on top of models the agent already picks from the model picker, adding a redundant path with no new capability. The gateway exists for clients that cannot use Lemonade's OpenAI-compatible API directly; OpenCode can.

Second, it couples unrelated surfaces. Model discovery operates on a live catalog; an MCP registration is a single static endpoint with a different config key (`mcp` vs `providers`), transport, and failure mode. One plugin mutating both config trees makes each harder to reason about and test.

Third, it couples release cycles. With the package published to npm, bundling the gateway would pull every user into every MCP change and vice versa. Keeping the gateway documented rather than configured keeps the plugin scoped, the package small, and each surface free to evolve and release independently.
