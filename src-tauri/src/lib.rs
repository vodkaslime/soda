use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;

mod agents;

// --- Shared types ---

#[derive(Serialize, Clone)]
struct AgentStatus {
    name: String,
    label: String,
    installed: bool,
    path: Option<String>,
}

#[derive(Serialize, Clone)]
struct AgentConfigFile {
    path: String,
    exists: bool,
}

#[derive(Serialize, Clone)]
struct AgentDetail {
    name: String,
    label: String,
    description: String,
    skills_label: String,
    installed: bool,
    binary_path: Option<String>,
    version: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    config_files: Vec<AgentConfigFile>,
    skills: Vec<String>,
    mcp_servers: Vec<String>,
    raw_config: Option<String>,
}

// --- Shared helpers (used by agent modules) ---

fn get_agent_version(binary_name: &str) -> Option<String> {
    use std::process::Command;
    let output = Command::new(binary_name)
        .arg("--version")
        .output()
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() {
            return Some(stdout);
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            return Some(stderr);
        }
    }
    None
}

fn json_value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => String::new(),
        _ => serde_json::to_string_pretty(v).unwrap_or_default(),
    }
}

// --- Agent Tauri commands ---

#[tauri::command]
fn detect_agents() -> Vec<AgentStatus> {
    agents::all_agents().into_iter().map(|a| a.detect()).collect()
}

#[tauri::command]
fn get_agent_details(agent_name: String) -> Result<AgentDetail, String> {
    agents::find_agent(&agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", agent_name))
        .map(|a| a.get_details())
}

#[tauri::command]
fn scan_agent_skills(agent_name: String) -> Result<Vec<SkillEntry>, String> {
    let agent = agents::find_agent(&agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", agent_name))?;
    let skills_dir = agent.skills_dir()
        .ok_or_else(|| format!("Agent {} has no skills directory", agent_name))?;
    Ok(scan_folder_for_skills(&skills_dir.display().to_string()))
}

#[derive(Deserialize)]
struct CopySkillRequest {
    agent_name: String,
    source_path: String,
    skill_name: String,
    skill_type: String, // "folder" or "zip"
}

#[tauri::command]
fn copy_skill_to_agent(req: CopySkillRequest) -> Result<String, String> {
    let agent = agents::find_agent(&req.agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", req.agent_name))?;
    let skills_dir = agent.skills_dir()
        .ok_or_else(|| format!("Agent {} has no skills directory", req.agent_name))?;

    // Ensure the skills directory exists
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let dest_dir = skills_dir.join(&req.skill_name);

    // Check for name collision
    if dest_dir.exists() {
        return Err(format!(
            "Skill \"{}\" already exists in {}",
            req.skill_name,
            req.agent_name
        ));
    }

    let source = std::path::Path::new(&req.source_path);

    match req.skill_type.as_str() {
        "zip" => {
            // Extract zip into a folder named after the skill
            let file = fs::File::open(source)
                .map_err(|e| format!("Failed to open zip: {}", e))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read zip: {}", e))?;

            fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create skill directory: {}", e))?;

            for i in 0..archive.len() {
                let mut entry = archive.by_index(i)
                    .map_err(|e| format!("Failed to read zip entry: {}", e))?;
                let entry_name = entry.name().to_string();

                // Skip directory entries and macOS metadata
                if entry_name.ends_with('/') || entry_name.starts_with("__MACOSX") {
                    continue;
                }

                // Strip the top-level directory from the zip entry if present
                let relative = if let Some(slash) = entry_name.find('/') {
                    &entry_name[slash + 1..]
                } else {
                    &entry_name
                };

                if relative.is_empty() {
                    continue;
                }

                let out_path = dest_dir.join(relative);

                if entry.is_dir() {
                    fs::create_dir_all(&out_path)
                        .map_err(|e| format!("Failed to create directory: {}", e))?;
                } else {
                    if let Some(parent) = out_path.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                    }
                    let mut outfile = fs::File::create(&out_path)
                        .map_err(|e| format!("Failed to create file: {}", e))?;
                    std::io::copy(&mut entry, &mut outfile)
                        .map_err(|e| format!("Failed to write file: {}", e))?;
                }
            }
        }
        "folder" => {
            // Recursively copy the folder
            copy_dir_recursive(source, &dest_dir)?;
        }
        _ => {
            return Err(format!("Unknown skill type: {}", req.skill_type));
        }
    }

    Ok(dest_dir.display().to_string())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    for entry in fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file {}: {}", src_path.display(), e))?;
        }
    }

    Ok(())
}

#[tauri::command]
fn remove_skill_from_agent(_agent_name: String, skill_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&skill_path);
    if !path.exists() {
        return Err(format!("Skill not found at {}", skill_path));
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to remove skill: {}", e))?;
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("Failed to remove skill: {}", e))?;
    }
    Ok(())
}

// --- Skills Store types ---

#[derive(Serialize, Deserialize, Clone)]
struct SkillMeta {
    name: String,
    description: String,
}

#[derive(Serialize, Clone)]
struct SkillEntry {
    id: String,
    name: String,
    description: String,
    source_path: String,
    skill_type: String, // "folder" or "zip"
    folder_path: String, // the parent folder the user added
}

#[derive(Serialize, Deserialize, Clone)]
struct AppConfig {
    skill_folders: Vec<String>,
}

fn config_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let soda_dir = home.join(".soda");
    fs::create_dir_all(&soda_dir).map_err(|e| format!("Failed to create .soda dir: {}", e))?;
    Ok(soda_dir.join("config.json"))
}

fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        Ok(AppConfig {
            skill_folders: vec![],
        })
    }
}

fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path()?;
    let data = serde_json::to_string_pretty(config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

fn parse_skill_md_frontmatter(content: &str) -> Option<SkillMeta> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    if let Some(end) = rest.find("---") {
        let yaml = &rest[..end];
        let mut name = String::from("Unknown");
        let mut description = String::from("No description");
        for line in yaml.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("name:") {
                name = val.trim().trim_matches('"').trim_matches('\'').to_string();
            } else if let Some(val) = line.strip_prefix("description:") {
                description = val.trim().trim_matches('"').trim_matches('\'').to_string();
            }
        }
        Some(SkillMeta { name, description })
    } else {
        None
    }
}

fn extract_zip_skill_meta(zip_path: &std::path::Path) -> Option<SkillMeta> {
    let file = fs::File::open(zip_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).ok()?;
        let name = f.name().to_string();
        if name.ends_with("SKILL.md") {
            let mut content = String::new();
            f.read_to_string(&mut content).ok()?;
            return parse_skill_md_frontmatter(&content);
        }
    }
    None
}

fn scan_folder_for_skills(folder_path: &str) -> Vec<SkillEntry> {
    let path = std::path::Path::new(folder_path);
    if !path.exists() || !path.is_dir() {
        return vec![];
    }

    let mut skills = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();

            if entry_path.is_dir() {
                let skill_md = entry_path.join("SKILL.md");
                if skill_md.exists() {
                    if let Ok(content) = fs::read_to_string(&skill_md) {
                        if let Some(meta) = parse_skill_md_frontmatter(&content) {
                            skills.push(SkillEntry {
                                id: entry_path.display().to_string(),
                                name: meta.name,
                                description: meta.description,
                                source_path: entry_path.display().to_string(),
                                skill_type: "folder".to_string(),
                                folder_path: folder_path.to_string(),
                            });
                        }
                    }
                }
            }

            if let Some(ext) = entry_path.extension() {
                if ext == "zip" {
                    if let Some(meta) = extract_zip_skill_meta(&entry_path) {
                        skills.push(SkillEntry {
                            id: entry_path.display().to_string(),
                            name: meta.name,
                            description: meta.description,
                            source_path: entry_path.display().to_string(),
                            skill_type: "zip".to_string(),
                            folder_path: folder_path.to_string(),
                        });
                    }
                }
            }
        }
    }

    skills
}

#[tauri::command]
fn get_skill_folders() -> Result<Vec<String>, String> {
    let config = load_config()?;
    Ok(config.skill_folders)
}

#[tauri::command]
fn add_skill_folder(folder_path: String) -> Result<Vec<String>, String> {
    let mut config = load_config()?;
    if !config.skill_folders.contains(&folder_path) {
        config.skill_folders.push(folder_path);
        save_config(&config)?;
    }
    Ok(config.skill_folders)
}

#[tauri::command]
fn remove_skill_folder(folder_path: String) -> Result<Vec<String>, String> {
    let mut config = load_config()?;
    config.skill_folders.retain(|f| f != &folder_path);
    save_config(&config)?;
    Ok(config.skill_folders)
}

#[tauri::command]
fn scan_skills(folders: Vec<String>) -> Vec<SkillEntry> {
    let mut all_skills = Vec::new();
    for folder in folders {
        all_skills.extend(scan_folder_for_skills(&folder));
    }
    all_skills
}

#[tauri::command]
fn read_skill_content(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if p.is_file() && p.extension().map_or(false, |e| e == "zip") {
        let file = fs::File::open(p).map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| format!("Failed to read entry: {}", e))?;
            if f.name().ends_with("SKILL.md") {
                let mut content = String::new();
                f.read_to_string(&mut content)
                    .map_err(|e| format!("Failed to read SKILL.md: {}", e))?;
                return Ok(content);
            }
        }
        Err("No SKILL.md found in zip".to_string())
    } else {
        fs::read_to_string(p).map_err(|e| format!("Failed to read file: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_agents,
            get_agent_details,
            scan_agent_skills,
            copy_skill_to_agent,
            remove_skill_from_agent,
            get_skill_folders,
            add_skill_folder,
            remove_skill_folder,
            scan_skills,
            read_skill_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
