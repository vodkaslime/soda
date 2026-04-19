use super::Agent;
use crate::{json_value_to_string, AgentConfigFile, AgentDetail};
use std::fs;
use std::path::{Path, PathBuf};

pub struct CrushAgent;

impl Agent for CrushAgent {
    fn name(&self) -> &str { "crush" }
    fn label(&self) -> &str { "Crush" }
    fn description(&self) -> &str {
        "Charmbracelet's AI coding agent with local skills and JSON configuration."
    }
    fn skills_label(&self) -> &str { "Skills & Settings" }

    fn skills_dir(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".config").join("crush").join("skills"))
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
        let config_candidates = vec![
            PathBuf::from(".crush.json"),
            PathBuf::from("crush.json"),
            home.join(".config").join("crush").join("crush.json"),
        ];

        if let Some((path, config)) = read_first_json(&config_candidates) {
            detail.config_files.push(AgentConfigFile { path: path.clone(), exists: true });
            detail.raw_config = serde_json::to_string_pretty(&config).ok();

            detail.model = config.get("model").map(json_value_to_string);
            detail.provider = config
                .get("provider")
                .map(json_value_to_string)
                .or_else(|| {
                    detail.model.as_ref().and_then(|model| model.split_once('/').map(|(provider, _)| provider.to_string()))
                });

            if let Some(obj) = config.as_object() {
                detail.skills = obj.keys().cloned().collect();
            }

            detail.mcp_servers = config
                .get("mcpServers")
                .or_else(|| config.get("mcp_servers"))
                .and_then(|value| value.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();
        } else {
            for path in &config_candidates {
                detail.config_files.push(AgentConfigFile {
                    path: path.display().to_string(),
                    exists: path.exists(),
                });
            }
        }

        let global_skills = home.join(".config").join("crush").join("skills");
        let project_skills = PathBuf::from(".crush").join("skills");
        for path in [global_skills, project_skills] {
            detail.config_files.push(AgentConfigFile {
                path: path.display().to_string(),
                exists: path.exists(),
            });
        }

        detail
    }
}

fn read_first_json(paths: &[PathBuf]) -> Option<(String, serde_json::Value)> {
    for path in paths {
        if let Some(value) = read_json(path) {
            return Some((path.display().to_string(), value));
        }
    }
    None
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<serde_json::Value>(&content).ok()
}
