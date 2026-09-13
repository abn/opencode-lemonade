---
type: Overview
title: Overview
description: What this project is and why it exists.
status: active
---

# Overview

`opencode-lemonade` is an OpenCode plugin that connects OpenCode to a Lemonade server. At startup it queries the server model catalog and registers every matching model as part of an OpenAI-compatible provider, so models, context limits, output limits, and vision capabilities appear in OpenCode without manual enumeration.

## Why a plugin

OpenCode polls the model catalog only for a small set of hardcoded providers. Generic OpenAI-compatible endpoints are treated as static: every model must be listed by hand, and the standard catalog response carries no metadata about context size, output limits, or image support. Lemonade knows these details for each model, and this plugin carries them into OpenCode.

See [Design](design/rationale.md) for the reasoning behind the key decisions.
