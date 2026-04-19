use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;
use std::path::PathBuf;

pub struct GeminiAgent;

impl Agent for GeminiAgent {
    fn name(&self) -> &str { "gemini" }
    fn label(&self) -> &str { "Gemini CLI" }
    fn description(&self) -> &str {
        "Google's terminal-based AI coding and task agent."
    }
    fn skills_label(&self) -> &str { "Extensions & Settings" }

    fn skills_dir(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".gemini").join("extensions"))
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
            provider: Some("google".to_string()),
            model: None,
            config_files: Vec::new(),
            skills: Vec::new(),
            mcp_servers: Vec::new(),
            raw_config: None,
            gateway: None,
        };

        let home = dirs::home_dir().unwrap_or_default();
        let config_paths = vec![
            home.join(".gemini").join("settings.json"),
            PathBuf::from("GEMINI.md"),
        ];

        let settings_path = home.join(".gemini").join("settings.json");
        if settings_path.exists() {
            detail.config_files.push(AgentConfigFile {
                path: settings_path.display().to_string(),
                exists: true,
            });
            if let Ok(content) = fs::read_to_string(&settings_path) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                    detail.raw_config = serde_json::to_string_pretty(&value).ok();
                    detail.model = value
                        .get("model")
                        .or_else(|| value.get("defaultModel"))
                        .map(json_value_to_string);
                    if let Some(obj) = value.as_object() {
                        detail.skills = obj.keys().cloned().collect();
                    }
                    detail.mcp_servers = value
                        .get("mcpServers")
                        .or_else(|| value.get("mcp_servers"))
                        .and_then(|v| v.as_object())
                        .map(|obj| obj.keys().cloned().collect())
                        .unwrap_or_default();
                }
            }
        } else {
            detail.config_files.push(AgentConfigFile {
                path: settings_path.display().to_string(),
                exists: false,
            });
        }

        let gemini_md = PathBuf::from("GEMINI.md");
        detail.config_files.push(AgentConfigFile {
            path: gemini_md.display().to_string(),
            exists: gemini_md.exists(),
        });

        let extensions_dir = home.join(".gemini").join("extensions");
        detail.config_files.push(AgentConfigFile {
            path: extensions_dir.display().to_string(),
            exists: extensions_dir.exists(),
        });

        detail
    }
}
