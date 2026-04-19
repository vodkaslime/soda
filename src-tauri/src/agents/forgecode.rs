use super::Agent;
use crate::{AgentConfigFile, AgentDetail};
use std::fs;
use std::path::PathBuf;

pub struct ForgeCodeAgent;

impl Agent for ForgeCodeAgent {
    fn name(&self) -> &str { "forge" }
    fn label(&self) -> &str { "Forge Code" }
    fn description(&self) -> &str {
        "A terminal coding agent configured through forge.yaml and provider login flows."
    }
    fn skills_label(&self) -> &str { "Project Config" }

    fn skills_dir(&self) -> Option<PathBuf> {
        None
    }

    fn detect(&self) -> crate::AgentStatus {
        let result = which::which("forge");
        crate::AgentStatus {
            name: "forgecode".to_string(),
            label: self.label().to_string(),
            installed: result.is_ok(),
            path: result.ok().map(|p| p.display().to_string()),
        }
    }

    fn get_details(&self) -> AgentDetail {
        let binary_result = which::which("forge");
        let installed = binary_result.is_ok();
        let binary_path = binary_result.ok().map(|p| p.display().to_string());

        let mut detail = AgentDetail {
            name: "forgecode".to_string(),
            label: self.label().to_string(),
            description: self.description().to_string(),
            skills_label: self.skills_label().to_string(),
            installed,
            binary_path: binary_path.clone(),
            version: if installed { crate::get_agent_version("forge") } else { None },
            provider: None,
            model: None,
            config_files: Vec::new(),
            skills: Vec::new(),
            mcp_servers: Vec::new(),
            raw_config: None,
            gateway: None,
        };

        let config_paths = vec![
            PathBuf::from("forge.yaml"),
            PathBuf::from("forge.yml"),
        ];

        let mut found_config = false;
        for path in config_paths {
            if path.exists() {
                found_config = true;
                detail.config_files.push(AgentConfigFile {
                    path: path.display().to_string(),
                    exists: true,
                });

                if let Ok(content) = fs::read_to_string(&path) {
                    detail.raw_config = Some(content.clone());
                    if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                        if let Some(model) = value.get("model").and_then(|v| v.as_str()) {
                            detail.model = Some(model.to_string());
                            if let Some((provider, _)) = model.split_once('/') {
                                detail.provider = Some(provider.to_string());
                            }
                        }
                        if let Some(obj) = value.as_mapping() {
                            detail.skills = obj
                                .keys()
                                .filter_map(|key| key.as_str().map(|s| s.to_string()))
                                .collect();
                        }
                    }
                }
                break;
            }
        }

        if !found_config {
            detail.config_files.push(AgentConfigFile {
                path: PathBuf::from("forge.yaml").display().to_string(),
                exists: false,
            });
        }

        detail
    }
}
