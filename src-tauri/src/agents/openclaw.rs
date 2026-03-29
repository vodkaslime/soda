use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;

pub struct OpenClawAgent;

impl Agent for OpenClawAgent {
    fn name(&self) -> &str {
        "openclaw"
    }
    fn label(&self) -> &str {
        "OpenClaw"
    }
    fn description(&self) -> &str {
        "AI gateway agent with multi-agent orchestration, channels, skills, and plugins."
    }
    fn skills_label(&self) -> &str {
        "Skills & Plugins"
    }

    fn skills_dir(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".openclaw").join("workspace").join("skills"))
    }

    fn get_details(&self) -> AgentDetail {
        let binary_result = which::which(self.name());
        let installed = binary_result.is_ok();
        let binary_path = binary_result.ok().map(|p| p.display().to_string());

        let mut detail = AgentDetail {
            name: self.name().to_string(),
            label: self.label().to_string(),
            description: self.description().to_string(),
            skills_label: self.skills_label().to_string(),
            installed,
            binary_path: binary_path.clone(),
            version: if installed {
                crate::get_agent_version(self.name())
            } else {
                None
            },
            provider: None,
            model: None,
            config_files: Vec::new(),
            skills: Vec::new(),
            mcp_servers: Vec::new(),
            raw_config: None,
        };

        let home = dirs::home_dir().unwrap_or_default();

        // --- Primary config: ~/.openclaw/openclaw.json (JSON5 format) ---
        let config_path = home.join(".openclaw").join("openclaw.json");
        if let Some(config) = read_config(&config_path) {
            detail.config_files.push(AgentConfigFile {
                path: config_path.display().to_string(),
                exists: true,
            });
            detail.raw_config = serde_json::to_string_pretty(&config).ok();

            // --- Model ---
            // agents.defaults.model.primary (e.g. "anthropic/claude-sonnet-4-6")
            if let Some(model) = config
                .get("agents")
                .and_then(|a| a.get("defaults"))
                .and_then(|d| d.get("model"))
                .and_then(|m| m.as_str())
            {
                detail.model = Some(model.to_string());
                // Provider is the part before "/"
                if let Some((prov, _)) = model.split_once('/') {
                    detail.provider = Some(prov.to_string());
                }
            } else if let Some(model) = config
                .get("agents")
                .and_then(|a| a.get("defaults"))
                .and_then(|d| d.get("model"))
                .and_then(|m| m.get("primary"))
                .map(|v| json_value_to_string(v))
            {
                detail.model = Some(model.clone());
                if let Some((prov, _)) = model.split_once('/') {
                    detail.provider = Some(prov.to_string());
                }
            }

            // --- Skills: from skills.entries ---
            if let Some(entries) = config
                .get("skills")
                .and_then(|s| s.get("entries"))
                .and_then(|e| e.as_object())
            {
                for (name, val) in entries {
                    let enabled = val
                        .get("enabled")
                        .map(|v| v.as_bool().unwrap_or(true))
                        .unwrap_or(true);
                    if enabled {
                        detail.skills.push(name.clone());
                    }
                }
            }

            // Also add tools profile if set
            if let Some(profile) = config
                .get("tools")
                .and_then(|t| t.get("profile"))
                .map(|v| json_value_to_string(v))
            {
                detail.skills.push(format!("tools: {}", profile));
            }

            // --- Plugins: from plugins.entries ---
            if let Some(entries) = config
                .get("plugins")
                .and_then(|p| p.get("entries"))
                .and_then(|e| e.as_object())
            {
                for (name, val) in entries {
                    let enabled = val
                        .get("enabled")
                        .map(|v| v.as_bool().unwrap_or(true))
                        .unwrap_or(true);
                    if enabled {
                        detail.skills.push(format!("plugin: {}", name));
                    }
                }
            }

            // --- Channels: list enabled channels ---
            if let Some(channels) = config.get("channels").and_then(|c| c.as_object()) {
                for (name, val) in channels {
                    let enabled = val
                        .get("enabled")
                        .map(|v| v.as_bool().unwrap_or(true))
                        .unwrap_or(true);
                    if enabled {
                        detail.skills.push(format!("channel: {}", name));
                    }
                }
            }

            // --- MCP Servers: from tools.mcp if present ---
            if let Some(mcp) = config.get("tools").and_then(|t| t.get("mcp")) {
                if let Some(servers) = mcp.as_object() {
                    detail.mcp_servers = servers.keys().cloned().collect();
                }
            }

            // --- Model providers ---
            if let Some(providers) = config
                .get("models")
                .and_then(|m| m.get("providers"))
                .and_then(|p| p.as_object())
            {
                if detail.provider.is_none() {
                    // If no provider from model, take the first provider
                    detail.provider = providers.keys().next().cloned();
                }
                for name in providers.keys() {
                    if !detail.mcp_servers.contains(name) {
                        detail.skills.push(format!("provider: {}", name));
                    }
                }
            }
        } else {
            detail.config_files.push(AgentConfigFile {
                path: config_path.display().to_string(),
                exists: false,
            });
        }

        detail
    }
}

// -- private helpers --

/// Read a JSON5 config file (JSON with comments and trailing commas).
/// Tries standard JSON first; if that fails, strips single-line comments
/// and trailing commas before retrying.
fn read_config(path: &std::path::Path) -> Option<serde_json::Value> {
    if !path.exists() {
        return None;
    }

    let content = fs::read_to_string(path).ok()?;

    // Try standard JSON first
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
        return Some(val);
    }

    // Fallback: strip single-line comments and trailing commas
    let cleaned = strip_json5(&content);
    serde_json::from_str(&cleaned).ok()
}

/// Minimal JSON5 cleanup: remove `//` comments and trailing commas.
/// This is a best-effort parser – it does NOT handle block comments (`/* */`)
/// or all edge cases, but covers the common OpenClaw config format.
fn strip_json5(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_string = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_string {
            result.push(ch);
            if ch == '\\' {
                // Skip escaped character
                if let Some(escaped) = chars.next() {
                    result.push(escaped);
                }
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            result.push(ch);
            continue;
        }

        // Single-line comment
        if ch == '/' && chars.peek() == Some(&'/') {
            // Skip until end of line
            while let Some(&c) = chars.peek() {
                if c == '\n' {
                    break;
                }
                chars.next();
            }
            continue;
        }

        // Block comment
        if ch == '/' && chars.peek() == Some(&'*') {
            chars.next(); // consume '*'
            loop {
                match chars.next() {
                    Some('*') if chars.peek() == Some(&'/') => {
                        chars.next(); // consume '/'
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
            continue;
        }

        result.push(ch);
    }

    // Remove trailing commas before } or ]
    let re = regex_lite::Regex::new(r",\s*([}\]])").unwrap();
    re.replace_all(&result, "$1").to_string()
}
