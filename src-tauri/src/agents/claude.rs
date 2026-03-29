use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;

pub struct ClaudeAgent;

impl Agent for ClaudeAgent {
    fn name(&self) -> &str { "claude" }
    fn label(&self) -> &str { "Claude Code" }
    fn description(&self) -> &str {
        "Anthropic's agentic coding tool that lives in your terminal."
    }
    fn skills_label(&self) -> &str { "Settings" }

    fn skills_dir(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".claude").join("skills"))
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
            version: if installed { crate::get_agent_version(self.name()) } else { None },
            provider: None,
            model: None,
            config_files: Vec::new(),
            skills: Vec::new(),
            mcp_servers: Vec::new(),
            raw_config: None,
        };

        let home = dirs::home_dir().unwrap_or_default();

        // --- Primary config: ~/.claude/settings.json ---
        if let Some((path, config)) = read_settings(&home) {
            detail.config_files.push(AgentConfigFile { path: path.clone(), exists: true });
            detail.raw_config = serde_json::to_string_pretty(&config).ok();

            // Claude Code configures models via env vars in settings
            if let Some(env) = config.get("env").and_then(|e| e.as_object()) {
                let default_model = env.get("ANTHROPIC_DEFAULT_SONNET_MODEL")
                    .or_else(|| env.get("ANTHROPIC_DEFAULT_OPUS_MODEL"))
                    .map(|v| json_value_to_string(v));
                detail.model = default_model;
                detail.provider = Some("anthropic".to_string());
            }

            // Skills = top-level setting keys
            if let Some(obj) = config.as_object() {
                detail.skills = obj.keys().cloned().collect();
            }
        } else {
            detail.config_files.push(AgentConfigFile {
                path: home.join(".claude").join("settings.json").display().to_string(),
                exists: false,
            });
        }

        // --- CLAUDE.md in current directory ---
        let claude_md = std::path::PathBuf::from("CLAUDE.md");
        detail.config_files.push(AgentConfigFile {
            path: claude_md.display().to_string(),
            exists: claude_md.exists(),
        });

        detail
    }
}

fn read_settings(home: &std::path::Path) -> Option<(String, serde_json::Value)> {
    let settings_path = home.join(".claude").join("settings.json");
    if !settings_path.exists() { return None; }

    let content = fs::read_to_string(&settings_path).ok()?;
    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    Some((settings_path.display().to_string(), val))
}
