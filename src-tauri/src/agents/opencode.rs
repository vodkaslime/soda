use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;

pub struct OpenCodeAgent;

impl Agent for OpenCodeAgent {
    fn name(&self) -> &str { "opencode" }
    fn label(&self) -> &str { "OpenCode" }
    fn description(&self) -> &str {
        "An open-source AI coding agent that supports multiple providers and models."
    }
    fn skills_label(&self) -> &str { "Agents" }

    fn skills_dir(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".config").join("opencode").join("skills"))
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
            gateway: None,
        };

        let home = dirs::home_dir().unwrap_or_default();

        // --- Primary config: opencode.json (project-level first, then global) ---
        if let Some((path, config)) = read_config() {
            detail.config_files.push(AgentConfigFile { path: path.clone(), exists: true });
            detail.raw_config = serde_json::to_string_pretty(&config).ok();

            detail.model = config.get("model").map(|v| json_value_to_string(v));
            detail.provider = config
                .get("provider")
                .and_then(|p| p.as_object())
                .and_then(|obj| obj.keys().next())
                .cloned();

            detail.skills = extract_keys(&config, "agent");
            detail.mcp_servers = extract_keys(&config, "mcp");

            // Also scan ~/.config/opencode/agents/ for .md skill files
            let agents_dir = home.join(".config").join("opencode").join("agents");
            if agents_dir.exists() {
                if let Ok(entries) = fs::read_dir(&agents_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.ends_with(".md") && !detail.skills.contains(&name) {
                            detail.skills.push(name.trim_end_matches(".md").to_string());
                        }
                    }
                }
            }
        } else {
            detail.config_files.push(AgentConfigFile {
                path: home.join(".config").join("opencode").join("opencode.json").display().to_string(),
                exists: false,
            });
        }

        detail
    }
}

fn read_config() -> Option<(String, serde_json::Value)> {
    // Try project-level first, then global
    let paths = vec![
        std::path::PathBuf::from("opencode.json"),
        dirs::home_dir()?.join(".config").join("opencode").join("opencode.json"),
    ];

    for p in paths {
        if p.exists() {
            if let Ok(content) = fs::read_to_string(&p) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    return Some((p.display().to_string(), val));
                }
            }
        }
    }
    None
}

fn extract_keys(config: &serde_json::Value, key: &str) -> Vec<String> {
    config
        .get(key)
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default()
}
