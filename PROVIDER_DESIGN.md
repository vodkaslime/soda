# Provider and Model Design

This document explains how provider and model configuration is managed for the four agents currently supported by Soda:

- Codex CLI
- Claude Code
- OpenCode
- OpenClaw

It covers:

- where Soda reads configuration from
- how each agent stores provider and model settings
- how Soda currently infers and displays provider/model data
- the practical behavior of the current local setup
- gaps and recommended improvements

## Overview

Soda does not directly manage model/provider selection for these agents.
Each agent manages its own configuration in its own config files, and Soda reads those files to infer:

- selected provider
- selected model
- related skills/profiles/plugins/MCP settings

Because each agent uses a different configuration design, Soda currently uses a different parser for each one in `src-tauri/src/agents/*.rs`.

## Where Soda Reads Agent Data

The relevant Soda parsers are:

- `src-tauri/src/agents/codex.rs`
- `src-tauri/src/agents/claude.rs`
- `src-tauri/src/agents/opencode.rs`
- `src-tauri/src/agents/openclaw.rs`

Each parser reads the agent's own config file and converts it into Soda's shared `AgentDetail` shape:

- `provider`
- `model`
- `config_files`
- `skills`
- `mcp_servers`
- `raw_config`

## Codex CLI

### Config location

Soda reads:

- `~/.codex/config.toml`

### How Codex stores providers and models

Codex CLI uses a TOML config with:

- a top-level selected provider alias
- a top-level selected model
- a registry of named providers

Typical fields:

- `model_provider`
- `model`
- `[model_providers.<name>]`

### How Soda interprets Codex

In `src-tauri/src/agents/codex.rs`, Soda extracts:

- `provider` from top-level `model_provider`
- `model` from top-level `model`
- `skills` from keys under:
  - `profiles`
  - `model_providers`
- `mcp_servers` from keys under `mcp_servers`

### Current local Codex setup

From `~/.codex/config.toml`:

- `model_provider = "custom"`
- `model = "gpt-5.4"`

The selected provider is defined under:

- `[model_providers.custom]`

Important details:

- `type = "openai"`
- `base_url = "https://crs.wirely.cn/openai"`
- `wire_api = "responses"`
- `env_key = "MODEL_API_KEY"`

### Practical meaning

Codex is configured as:

- provider alias: `custom`
- backend type: OpenAI-compatible
- backend URL: `https://crs.wirely.cn/openai`
- selected model: `gpt-5.4`
- auth source: env var `MODEL_API_KEY`

### Design summary

Codex has a clean and explicit separation:

- provider selection: top-level alias
- provider registry: `[model_providers.*]`
- model selection: top-level `model`

## Claude Code

### Config location

Soda reads:

- `~/.claude/settings.json`

Soda also records the existence of:

- `CLAUDE.md` in the current project

### How Claude stores providers and models

Claude Code commonly uses:

- settings values
- env-style settings embedded in `settings.json`
- runtime model switching

In practice, model/provider configuration is often expressed through environment variables such as:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_SMALL_FAST_MODEL`

### How Soda currently interprets Claude

In `src-tauri/src/agents/claude.rs`, Soda currently:

- assumes provider is `anthropic`
- tries to infer model from:
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
- treats top-level settings keys as `skills`

### Current local Claude setup

From `~/.claude/settings.json`:

- `ANTHROPIC_BASE_URL = "https://api.copilot.wirely.cn"`
- `ANTHROPIC_AUTH_TOKEN = "..."`
- `ANTHROPIC_MODEL = "zhipu/glm-5-turbo"`
- `ANTHROPIC_SMALL_FAST_MODEL = "glm/glm-4.5-air"`

### Practical meaning

Claude is configured to use:

- a custom Anthropic-compatible endpoint
- custom token auth
- a primary model of `zhipu/glm-5-turbo`
- a smaller/faster model of `glm/glm-4.5-air`

### Important gap in Soda

Soda currently under-parses Claude's real config behavior because:

- it does not read `ANTHROPIC_MODEL`
- it does not recognize that `ANTHROPIC_BASE_URL` implies a custom endpoint
- it hardcodes provider as `anthropic`

### Design summary

Claude's design is more env-driven than registry-driven:

- provider behavior comes from endpoint/auth env vars
- model behavior comes from model env vars or runtime settings
- Soda should treat it as a settings/env-configured tool, not as a static provider registry

## OpenCode

### Config location

Soda reads, in order:

1. project-level `opencode.json`
2. global `~/.config/opencode/opencode.json`

### How OpenCode stores providers and models

OpenCode uses JSON config with:

- a `provider` registry
- optional selected `model`
- provider-specific model definitions
- optional project-level overrides

Typical structure:

- `provider.<provider-name>`
- `provider.<provider-name>.options`
- `provider.<provider-name>.models`
- optional top-level `model`

### How Soda interprets OpenCode

In `src-tauri/src/agents/opencode.rs`, Soda extracts:

- `model` from top-level `model`
- `provider` as the first key found under top-level `provider`
- `skills` from keys under `agent`
- `mcp_servers` from keys under `mcp`

It also scans:

- `~/.config/opencode/agents/*.md`

and adds those filenames as skills.

### Current local OpenCode setup

From `~/.config/opencode/opencode.json`:

- provider alias: `wirely`
- adapter package: `@ai-sdk/openai-compatible`
- base URL: `https://api.copilot.wirely.cn`
- API key configured in provider options
- provider model catalog includes:
  - `glm/glm-4.7`

### Practical meaning

OpenCode is configured with:

- provider alias: `wirely`
- backend type: OpenAI-compatible AI SDK provider
- backend endpoint: `https://api.copilot.wirely.cn`
- available model catalog includes `glm/glm-4.7`

### Important gap in Soda

The current OpenCode config does not appear to define an explicit top-level selected `model`.
That means Soda may show:

- provider: `wirely`
- model: empty / none

Even though a usable provider and model catalog are configured.

### Design summary

OpenCode separates:

- provider registry
- provider backend implementation
- provider-local model catalog
- optionally selected global model

It is more registry-centric than Claude, but less explicit than Codex/OpenClaw if no top-level `model` is set.

## OpenClaw

### Config location

Soda reads:

- `~/.openclaw/openclaw.json`

This file may contain JSON5-style comments/trailing commas, and Soda handles that with a best-effort cleanup parser.

### How OpenClaw stores providers and models

OpenClaw has the richest model/provider system of the four.
It separates:

- provider registry
- model catalog under each provider
- agent-default model selection
- model aliases

Important sections:

- `models.providers`
- `agents.defaults.model`
- `agents.defaults.models`

### How Soda interprets OpenClaw

In `src-tauri/src/agents/openclaw.rs`, Soda extracts:

- selected model from:
  - `agents.defaults.model.primary`
  - or `agents.defaults.model` fallback
- provider by splitting `provider/model` at `/`
- skills from:
  - `skills.entries`
  - `plugins.entries`
  - `channels`
  - `tools.profile`
  - provider names under `models.providers`
- MCP servers from `tools.mcp`

### Current local OpenClaw setup

From `~/.openclaw/openclaw.json`:

Provider registry:

- `models.providers.custom-apr-wirely-cn`

Provider details:

- `baseUrl = "https://apr.wirely.cn"`
- `apiKey = "..."`
- `api = "anthropic-messages"`

Available model:

- `GLM/GLM-5`

Selected default model:

- `agents.defaults.model.primary = "custom-apr-wirely-cn/GLM/GLM-5"`

Alias:

- `agents.defaults.models["custom-apr-wirely-cn/GLM/GLM-5"].alias = "glm-5"`

### Practical meaning

OpenClaw is configured with:

- provider alias: `custom-apr-wirely-cn`
- backend API style: `anthropic-messages`
- backend endpoint: `https://apr.wirely.cn`
- selected model: `GLM/GLM-5`
- model alias: `glm-5`

### Design summary

OpenClaw has the most explicit model/provider architecture:

- provider registry under `models.providers`
- selected agent model under `agents.defaults.model.primary`
- alias metadata under `agents.defaults.models`

This is the most structured and Soda's current interpretation is relatively accurate.

## Summary Table

| Agent | Main config | Provider storage | Model storage | Soda accuracy |
|---|---|---|---|---|
| Codex CLI | `~/.codex/config.toml` | top-level alias + `[model_providers.*]` | top-level `model` | good |
| Claude Code | `~/.claude/settings.json` | env/settings-driven | env/settings-driven | incomplete |
| OpenCode | `opencode.json` / `~/.config/opencode/opencode.json` | `provider.*` | top-level `model` and/or provider-local models | partial |
| OpenClaw | `~/.openclaw/openclaw.json` | `models.providers.*` | `agents.defaults.model.primary` | good |

## Current Effective Local Setup

### Codex CLI

- provider alias: `custom`
- backend type: OpenAI-compatible
- endpoint: `https://crs.wirely.cn/openai`
- selected model: `gpt-5.4`

### Claude Code

- endpoint: `https://api.copilot.wirely.cn`
- auth: custom token
- primary model: `zhipu/glm-5-turbo`
- fast/small model: `glm/glm-4.5-air`
- effectively a custom Anthropic-compatible setup

### OpenCode

- provider alias: `wirely`
- backend adapter: `@ai-sdk/openai-compatible`
- endpoint: `https://api.copilot.wirely.cn`
- available model catalog includes `glm/glm-4.7`
- selected model is not explicitly visible in the current config

### OpenClaw

- provider alias: `custom-apr-wirely-cn`
- API mode: `anthropic-messages`
- endpoint: `https://apr.wirely.cn`
- selected model: `GLM/GLM-5`
- alias: `glm-5`

## Recommended Improvements in Soda

To make Soda's agent detail pages more accurate, the following improvements are recommended.

### Claude Code improvements

- read `env.ANTHROPIC_MODEL`
- read `env.ANTHROPIC_SMALL_FAST_MODEL`
- infer custom provider behavior from `ANTHROPIC_BASE_URL`
- avoid always displaying provider as plain `anthropic`

### OpenCode improvements

- display available provider-local models when no top-level `model` exists
- distinguish between:
  - selected model
  - configured providers
  - available model catalog

### Codex improvements

- display resolved provider details for the selected provider alias:
  - provider type
  - base URL
  - auth env key

### OpenClaw improvements

- optionally display provider API type, e.g. `anthropic-messages`
- optionally display model alias alongside the canonical model ID

## Design Conclusions

- Codex and OpenClaw have explicit provider/model architectures and are easier for Soda to introspect.
- Claude Code is more dynamic and env-driven, so Soda currently misses some important details.
- OpenCode sits in the middle: provider registry is explicit, but selected model can be absent while provider-local models still exist.
- Soda currently reads and displays a useful approximation, but the quality varies by agent.

## References

Official docs consulted:

- Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude Code model config: https://docs.anthropic.com/en/docs/claude-code/model-config
- OpenCode config: https://opencode.ai/docs/config/
- OpenCode providers: https://opencode.ai/docs/providers
- OpenCode agents: https://opencode.ai/docs/agents/
