use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;

pub struct CodexAgent;

impl Agent for CodexAgent {
    fn name(&self) -> &str { "codex" }
    fn label(&self) -> &str { "Codex CLI" }
    fn description(&self) -> &str {
        "OpenAI Codex CLI agent for AI-powered coding assistance."
    }
    fn skills_label(&self) -> &str { "Profiles & Providers" }

    fn skills_dir(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".codex").join("skills"))
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

        // --- Primary config: ~/.codex/config.toml ---
        if let Some((path, config)) = read_config(&home) {
            detail.config_files.push(AgentConfigFile { path: path.clone(), exists: true });
            detail.raw_config = serde_json::to_string_pretty(&config).ok();

            detail.model = config.get("model").map(|v| json_value_to_string(v));
            detail.provider = config.get("model_provider").map(|v| json_value_to_string(v));

            // Skills = profiles + model_providers
            detail.skills = extract_keys(&config, "profiles");
            detail.skills.extend(extract_keys(&config, "model_providers"));
            detail.mcp_servers = extract_keys(&config, "mcp_servers");
        } else {
            detail.config_files.push(AgentConfigFile {
                path: home.join(".codex").join("config.toml").display().to_string(),
                exists: false,
            });
        }

        // --- instructions.md ---
        let instructions_path = home.join(".codex").join("instructions.md");
        detail.config_files.push(AgentConfigFile {
            path: instructions_path.display().to_string(),
            exists: instructions_path.exists(),
        });

        detail
    }
}

// -- private helpers --

fn read_config(home: &std::path::Path) -> Option<(String, serde_json::Value)> {
    let config_path = home.join(".codex").join("config.toml");
    if !config_path.exists() { return None; }

    let content = fs::read_to_string(&config_path).ok()?;
    let toml_val: toml::Value = content.parse().ok()?;
    let json_str = serde_json::to_string(&toml_val).ok()?;
    let json_val: serde_json::Value = serde_json::from_str(&json_str).ok()?;
    Some((config_path.display().to_string(), json_val))
}

fn extract_keys(config: &serde_json::Value, key: &str) -> Vec<String> {
    config
        .get(key)
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default()
}
