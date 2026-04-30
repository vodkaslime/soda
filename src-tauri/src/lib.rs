use axum::{
    body::Body,
    extract::State as AxumState,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::net::SocketAddr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

mod agents;

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
struct AgentGatewayInfo {
    base_url: String,
    default_model: String,
    api_style: String,
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
    gateway: Option<AgentGatewayInfo>,
}

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
    skill_type: String,
    folder_path: String,
}

#[derive(Serialize, Clone)]
struct TerminalFileTreeEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize, Clone)]
struct TerminalFilePreview {
    path: String,
    content: String,
    truncated: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct TerminalBoardCard {
    id: String,
    title: String,
    note: String,
    column: String,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    color: String,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct SkillKit {
    id: String,
    name: String,
    description: String,
    skill_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ProviderConfig {
    id: String,
    label: String,
    protocol: String,
    base_url: String,
    #[serde(default)]
    api_key: String,
    wire_api: Option<String>,
}

fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 4 {
        return "****".to_string();
    }
    format!("{}****{}", &key[..key.len() - 4], &key[key.len() - 4..])
}

#[derive(Serialize, Clone)]
struct ProviderConfigPublic {
    id: String,
    label: String,
    protocol: String,
    base_url: String,
    api_key_masked: String,
    api_key_set: bool,
    wire_api: Option<String>,
}

impl From<&ProviderConfig> for ProviderConfigPublic {
    fn from(p: &ProviderConfig) -> Self {
        ProviderConfigPublic {
            id: p.id.clone(),
            label: p.label.clone(),
            protocol: p.protocol.clone(),
            base_url: p.base_url.clone(),
            api_key_masked: mask_api_key(&p.api_key),
            api_key_set: !p.api_key.is_empty(),
            wire_api: p.wire_api.clone(),
        }
    }
}

#[derive(Serialize, Clone)]
struct ProviderRegistryPublic {
    providers: Vec<ProviderConfigPublic>,
    models: Vec<ModelConfig>,
}

impl From<&ProviderRegistry> for ProviderRegistryPublic {
    fn from(r: &ProviderRegistry) -> Self {
        ProviderRegistryPublic {
            providers: r.providers.iter().map(ProviderConfigPublic::from).collect(),
            models: r.models.clone(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ModelConfig {
    id: String,
    label: String,
    provider_id: String,
    model_name: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ProviderRegistry {
    providers: Vec<ProviderConfig>,
    models: Vec<ModelConfig>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct GatewayVirtualModel {
    id: String,
    label: String,
    target_model_id: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct GatewayConfig {
    enabled: bool,
    host: String,
    port: u16,
    openai_path: String,
    anthropic_path: String,
    virtual_models: Vec<GatewayVirtualModel>,
    default_virtual_model_id: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct AppConfig {
    #[serde(default)]
    skill_folders: Vec<String>,
    #[serde(default)]
    provider_registry: ProviderRegistry,
    #[serde(default)]
    skill_kits: Vec<SkillKit>,
    #[serde(default)]
    agent_skill_kits: HashMap<String, Vec<String>>,
    #[serde(default)]
    gateway: GatewayConfig,
    #[serde(default)]
    terminal_board: Vec<TerminalBoardCard>,
}

#[derive(Serialize)]
struct TerminalBootstrap {
    cwd: String,
    shell: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalSessionRequest {
    cwd: String,
    shell: String,
}

#[derive(Serialize)]
struct TerminalSessionResponse {
    session_id: String,
    cwd: String,
    shell: String,
}

#[derive(Deserialize)]
struct TerminalWriteRequest {
    #[serde(rename = "sessionId")]
    session_id: String,
    data: String,
}

#[derive(Deserialize)]
struct TerminalResizeRequest {
    #[serde(rename = "sessionId")]
    session_id: String,
    cols: u16,
    rows: u16,
}

#[derive(Serialize, Clone)]
struct TerminalOutputEvent {
    session_id: String,
    chunk: String,
    cwd: Option<String>,
    exit_code: Option<i32>,
}

#[derive(Clone)]
struct GatewayRuntimeState {
    client: reqwest::Client,
}

static GATEWAY_STATE: Lazy<GatewayRuntimeState> = Lazy::new(|| GatewayRuntimeState {
    client: reqwest::Client::new(),
});

static GATEWAY_HANDLE: std::sync::Mutex<Option<tokio::sync::watch::Sender<bool>>> = std::sync::Mutex::new(None);

#[derive(Deserialize)]
struct OpenAiChatRequest {
    model: Option<String>,
    #[serde(flatten)]
    extra: serde_json::Value,
}

#[derive(Deserialize)]
struct AnthropicMessagesRequest {
    model: Option<String>,
    #[serde(flatten)]
    extra: serde_json::Value,
}

struct TerminalSessionHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send>,
}

struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSessionHandle>>,
}

static TERMINAL_STATE: Lazy<TerminalState> = Lazy::new(|| TerminalState {
    sessions: Mutex::new(HashMap::new()),
});

fn infer_agent_api_style(agent_name: &str) -> &'static str {
    match agent_name {
        "claude" => "Anthropic-compatible",
        "gemini" => "OpenAI-compatible",
        _ => "OpenAI / Anthropic-compatible",
    }
}

fn attach_gateway_info(mut detail: AgentDetail) -> AgentDetail {
    if let Ok(config) = load_config() {
        let gateway = &config.gateway;
        let path = if matches!(detail.name.as_str(), "claude") {
            gateway.anthropic_path.clone()
        } else {
            gateway.openai_path.clone()
        };
        detail.gateway = Some(AgentGatewayInfo {
            base_url: format!("http://{}:{}{}", gateway.host, gateway.port, path),
            default_model: gateway.default_virtual_model_id.clone(),
            api_style: infer_agent_api_style(&detail.name).to_string(),
        });
    }
    detail
}

fn get_agent_version(binary_name: &str) -> Option<String> {
    use std::process::Command;
    let output = Command::new(binary_name).arg("--version").output().ok()?;
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

#[tauri::command]
fn detect_agents() -> Vec<AgentStatus> {
    agents::all_agents().into_iter().map(|a| a.detect()).collect()
}

#[tauri::command]
fn get_agent_details(agent_name: String) -> Result<AgentDetail, String> {
    agents::find_agent(&agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", agent_name))
        .map(|a| attach_gateway_info(a.get_details()))
}

#[tauri::command]
fn scan_agent_skills(agent_name: String) -> Result<Vec<SkillEntry>, String> {
    // Sync kit-assigned skills before scanning so symlinks are up to date
    let _ = deploy_skills_for_agent(&agent_name);

    let agent = agents::find_agent(&agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", agent_name))?;
    let skills_dir = agent
        .skills_dir()
        .ok_or_else(|| format!("Agent {} has no skills directory", agent_name))?;
    Ok(scan_folder_for_skills(&skills_dir.display().to_string()))
}

#[derive(Deserialize)]
struct CopySkillRequest {
    agent_name: String,
    source_path: String,
    skill_name: String,
    skill_type: String,
}

#[tauri::command]
fn copy_skill_to_agent(req: CopySkillRequest) -> Result<String, String> {
    let agent = agents::find_agent(&req.agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", req.agent_name))?;
    let skills_dir = agent
        .skills_dir()
        .ok_or_else(|| format!("Agent {} has no skills directory", req.agent_name))?;

    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let dest_dir = skills_dir.join(&req.skill_name);
    if dest_dir.exists() {
        return Err(format!(
            "Skill \"{}\" already exists in {}",
            req.skill_name, req.agent_name
        ));
    }

    let source = std::path::Path::new(&req.source_path);

    match req.skill_type.as_str() {
        "zip" => {
            let file = fs::File::open(source).map_err(|e| format!("Failed to open zip: {}", e))?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

            fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create skill directory: {}", e))?;

            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).map_err(|e| format!("Failed to read zip entry: {}", e))?;
                let entry_name = entry.name().to_string();

                if entry_name.ends_with('/') || entry_name.starts_with("__MACOSX") {
                    continue;
                }

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
        "folder" => copy_dir_recursive(source, &dest_dir)?,
        _ => return Err(format!("Unknown skill type: {}", req.skill_type)),
    }

    Ok(dest_dir.display().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create directory: {}", e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory: {}", e))? {
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
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove skill: {}", e))?;
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to remove skill: {}", e))?;
    }
    Ok(())
}

fn config_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("SODA_CONFIG_PATH") {
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        return Ok(path);
    }

    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let soda_dir = home.join(".soda");
    fs::create_dir_all(&soda_dir).map_err(|e| format!("Failed to create .soda dir: {}", e))?;
    Ok(soda_dir.join("config.json"))
}

fn with_gateway_defaults(mut config: AppConfig) -> AppConfig {
    if config.gateway.host.trim().is_empty() {
        config.gateway.host = "127.0.0.1".to_string();
    }
    if config.gateway.port == 0 {
        config.gateway.port = 4315;
    }
    if config.gateway.openai_path.trim().is_empty() {
        config.gateway.openai_path = "/openai".to_string();
    }
    if config.gateway.anthropic_path.trim().is_empty() {
        config.gateway.anthropic_path = "/anthropic".to_string();
    }
    if config.gateway.virtual_models.is_empty() {
        config.gateway.virtual_models = vec![
            GatewayVirtualModel {
                id: "soda/default".to_string(),
                label: "Default".to_string(),
                target_model_id: String::new(),
            },
            GatewayVirtualModel {
                id: "soda/fast".to_string(),
                label: "Fast".to_string(),
                target_model_id: String::new(),
            },
            GatewayVirtualModel {
                id: "soda/reasoning".to_string(),
                label: "Reasoning".to_string(),
                target_model_id: String::new(),
            },
        ];
    }
    if config.gateway.default_virtual_model_id.trim().is_empty() {
        config.gateway.default_virtual_model_id = "soda/default".to_string();
    }
    config
}

fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        let parsed = serde_json::from_str(&data).map_err(|e| format!("Failed to parse config: {}", e))?;
        Ok(with_gateway_defaults(parsed))
    } else {
        Ok(with_gateway_defaults(AppConfig::default()))
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

fn extract_zip_skill_meta(zip_path: &Path) -> Option<SkillMeta> {
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
    let path = Path::new(folder_path);
    if !path.exists() || !path.is_dir() {
        return vec![];
    }

    let mut skills = Vec::new();

    // Check if the folder itself is a skill (has SKILL.md at root)
    let root_skill_md = path.join("SKILL.md");
    if root_skill_md.exists() {
        if let Ok(content) = fs::read_to_string(&root_skill_md) {
            if let Some(meta) = parse_skill_md_frontmatter(&content) {
                skills.push(SkillEntry {
                    id: path.display().to_string(),
                    name: meta.name,
                    description: meta.description,
                    source_path: path.display().to_string(),
                    skill_type: "folder".to_string(),
                    folder_path: folder_path.to_string(),
                });
            }
        }
    }

    // Also scan subdirectories for skills
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
    Ok(load_config()?.skill_folders)
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
fn get_skill_kits() -> Result<Vec<SkillKit>, String> {
    Ok(load_config()?.skill_kits)
}

#[derive(Deserialize)]
struct SaveSkillKitRequest {
    id: Option<String>,
    name: String,
    description: String,
    skill_ids: Vec<String>,
}

#[tauri::command]
fn save_skill_kit(req: SaveSkillKitRequest) -> Result<Vec<SkillKit>, String> {
    let mut config = load_config()?;
    let kit_id = req.id.unwrap_or_else(|| slugify(&req.name));

    if kit_id.trim().is_empty() {
        return Err("Kit id cannot be empty".to_string());
    }

    let kit = SkillKit {
        id: kit_id.clone(),
        name: req.name,
        description: req.description,
        skill_ids: req.skill_ids,
    };

    if let Some(existing) = config.skill_kits.iter_mut().find(|existing| existing.id == kit_id) {
        *existing = kit;
    } else {
        config.skill_kits.push(kit);
    }

    save_config(&config)?;
    Ok(config.skill_kits)
}

#[tauri::command]
fn delete_skill_kit(kit_id: String) -> Result<Vec<SkillKit>, String> {
    let mut config = load_config()?;
    config.skill_kits.retain(|kit| kit.id != kit_id);
    for assigned in config.agent_skill_kits.values_mut() {
        assigned.retain(|id| id != &kit_id);
    }
    save_config(&config)?;
    Ok(config.skill_kits)
}

/// Deploy (symlink) all skills from assigned kits into the agent's skills directory.
/// For folder skills, symlinks directly. For zip skills, extracts to a cache dir first,
/// then symlinks the extracted folder.
fn deploy_skills_for_agent(agent_name: &str) -> Result<(), String> {
    let agent = agents::find_agent(agent_name)
        .ok_or_else(|| format!("Unknown agent: {}", agent_name))?;
    let skills_dir = agent.skills_dir()
        .ok_or_else(|| format!("Agent {} has no skills directory", agent_name))?;

    let config = load_config()?;
    let assigned_kit_ids = config.agent_skill_kits.get(agent_name).cloned().unwrap_or_default();

    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    // Collect all skill source paths from assigned kits
    let mut target_skill_ids: Vec<String> = Vec::new();
    for kit_id in &assigned_kit_ids {
        if let Some(kit) = config.skill_kits.iter().find(|k| &k.id == kit_id) {
            target_skill_ids.extend(kit.skill_ids.iter().cloned());
        }
    }

    // Skills cache directory for extracted zips
    let cache_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?
        .join(".soda")
        .join("skills-cache");
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create skills cache: {}", e))?;

    // Build a set of all known skill paths (from any kit) for cleanup detection.
    // For zip skills, also include the expected cache path so cleanup can match symlinks.
    let all_known_skills: Vec<String> = config.skill_kits.iter()
        .flat_map(|kit| kit.skill_ids.iter().cloned())
        .flat_map(|sid| {
            let source = Path::new(&sid);
            if source.extension().is_some_and(|e| e == "zip") {
                let zip_stem = source.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| slugify(&sid));
                let cached = cache_dir.join(&zip_stem).display().to_string();
                vec![sid, cached]
            } else {
                vec![sid]
            }
        })
        .collect();

    // Build the same for currently assigned skills
    let assigned_sources: Vec<String> = target_skill_ids.iter()
        .flat_map(|sid| {
            let source = Path::new(sid);
            if source.extension().is_some_and(|e| e == "zip") {
                let zip_stem = source.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| slugify(sid));
                let cached = cache_dir.join(&zip_stem).display().to_string();
                vec![sid.clone(), cached]
            } else {
                vec![sid.clone()]
            }
        })
        .collect();

    // Remove any existing soda-managed symlinks in the skills dir that are no longer assigned
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_symlink() {
                if let Ok(target) = std::fs::read_link(&entry_path) {
                    let target_str = target.display().to_string();
                    // Check if this symlink still points to an assigned skill
                    let is_still_assigned = assigned_sources.iter().any(|sid| {
                        target_str.starts_with(sid) || sid.starts_with(&target_str)
                    });
                    if !is_still_assigned {
                        // Check if it was ever managed by soda
                        let is_soda_managed = all_known_skills.iter().any(|sid| {
                            target_str.starts_with(sid) || sid.starts_with(&target_str)
                        });
                        if is_soda_managed {
                            let _ = fs::remove_file(&entry_path);
                        }
                    }
                }
            }
        }
    }

    // Create symlinks for all assigned skills
    for skill_id in &target_skill_ids {
        let source = Path::new(skill_id);
        if !source.exists() {
            continue;
        }

        // Resolve the actual deployable source path
        let (deploy_source, link_name) = if source.extension().is_some_and(|e| e == "zip") {
            // Zip file: extract to cache, symlink the extracted folder
            let zip_stem = source.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| slugify(skill_id));
            let extracted_dir = cache_dir.join(&zip_stem);

            // Extract if not already cached
            if !extracted_dir.join("SKILL.md").exists() {
                let file = fs::File::open(source)
                    .map_err(|e| format!("Failed to open zip {}: {}", skill_id, e))?;
                let mut archive = zip::ZipArchive::new(file)
                    .map_err(|e| format!("Failed to read zip {}: {}", skill_id, e))?;

                // Clean and recreate
                if extracted_dir.exists() {
                    let _ = fs::remove_dir_all(&extracted_dir);
                }
                fs::create_dir_all(&extracted_dir)
                    .map_err(|e| format!("Failed to create cache dir: {}", e))?;

                for i in 0..archive.len() {
                    let mut entry = archive.by_index(i)
                        .map_err(|e| format!("Failed to read zip entry: {}", e))?;
                    let entry_name = entry.name().to_string();

                    if entry_name.ends_with('/') || entry_name.starts_with("__MACOSX") {
                        continue;
                    }

                    let relative = if let Some(slash) = entry_name.find('/') {
                        &entry_name[slash + 1..]
                    } else {
                        &entry_name
                    };

                    if relative.is_empty() {
                        continue;
                    }

                    let out_path = extracted_dir.join(relative);

                    if entry.is_dir() {
                        fs::create_dir_all(&out_path)
                            .map_err(|e| format!("Failed to create directory: {}", e))?;
                    } else {
                        if let Some(parent) = out_path.parent() {
                            fs::create_dir_all(parent)
                                .map_err(|e| format!("Failed to create parent: {}", e))?;
                        }
                        let mut outfile = fs::File::create(&out_path)
                            .map_err(|e| format!("Failed to create file: {}", e))?;
                        std::io::copy(&mut entry, &mut outfile)
                            .map_err(|e| format!("Failed to write file: {}", e))?;
                    }
                }
            }

            (extracted_dir, zip_stem)
        } else {
            // Folder skill: symlink directly
            let name = source.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| slugify(skill_id));
            (source.to_path_buf(), name)
        };

        let link_path = skills_dir.join(&link_name);

        // Remove existing link/file if it exists
        if link_path.exists() || link_path.is_symlink() {
            let _ = fs::remove_file(&link_path);
        }

        // Create symlink to the resolved source
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&deploy_source, &link_path)
                .map_err(|e| format!("Failed to symlink {}: {}", link_name, e))?;
        }
        #[cfg(windows)]
        {
            if deploy_source.is_dir() {
                std::os::windows::fs::symlink_dir(&deploy_source, &link_path)
                    .map_err(|e| format!("Failed to symlink dir {}: {}", link_name, e))?;
            } else {
                std::os::windows::fs::symlink_file(&deploy_source, &link_path)
                    .map_err(|e| format!("Failed to symlink file {}: {}", link_name, e))?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_agent_skill_kits() -> Result<HashMap<String, Vec<String>>, String> {
    Ok(load_config()?.agent_skill_kits)
}

#[tauri::command]
fn set_agent_skill_kits(agent_name: String, kit_ids: Vec<String>) -> Result<HashMap<String, Vec<String>>, String> {
    let mut config = load_config()?;
    config.agent_skill_kits.insert(agent_name.clone(), kit_ids);
    save_config(&config)?;

    // Deploy skills to agent's skills directory
    let _ = deploy_skills_for_agent(&agent_name);

    Ok(config.agent_skill_kits)
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

#[tauri::command]
fn read_skill_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if p.is_file() && p.extension().is_some_and(|e| e == "zip") {
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


#[tauri::command]
fn get_gateway_config() -> Result<GatewayConfig, String> {
    Ok(load_config()?.gateway)
}

#[tauri::command]
fn save_gateway_config(gateway: GatewayConfig) -> Result<GatewayConfig, String> {
    let mut config = load_config()?;
    config.gateway = with_gateway_defaults(AppConfig { gateway, ..config.clone() }).gateway;
    save_config(&config)?;
    restart_gateway_server()?;
    Ok(config.gateway)
}

#[tauri::command]
fn toggle_gateway() -> Result<GatewayConfig, String> {
    let mut config = load_config()?;
    config.gateway.enabled = !config.gateway.enabled;
    save_config(&config)?;
    restart_gateway_server()?;
    Ok(config.gateway)
}

#[derive(Serialize)]
struct GatewayOverview {
    enabled: bool,
    openai_base_url: String,
    anthropic_base_url: String,
    default_virtual_model_id: String,
    virtual_models: Vec<GatewayVirtualModel>,
}

#[tauri::command]
fn get_gateway_overview() -> Result<GatewayOverview, String> {
    let gateway = load_config()?.gateway;
    let base = format!("http://{}:{}", gateway.host, gateway.port);
    Ok(GatewayOverview {
        enabled: gateway.enabled,
        openai_base_url: format!("{}{}", base, gateway.openai_path),
        anthropic_base_url: format!("{}{}", base, gateway.anthropic_path),
        default_virtual_model_id: gateway.default_virtual_model_id.clone(),
        virtual_models: gateway.virtual_models,
    })
}

#[tauri::command]
fn get_provider_registry() -> Result<ProviderRegistryPublic, String> {
    Ok(ProviderRegistryPublic::from(&load_config()?.provider_registry))
}

#[tauri::command]
fn save_provider(provider: ProviderConfig) -> Result<ProviderRegistryPublic, String> {
    if provider.id.trim().is_empty() || provider.label.trim().is_empty() || provider.base_url.trim().is_empty() {
        return Err("Provider id, label, and base URL are required".to_string());
    }
    let mut config = load_config()?;
    config.provider_registry.providers.retain(|entry| entry.id != provider.id);
    config.provider_registry.providers.push(provider);
    save_config(&config)?;
    Ok(ProviderRegistryPublic::from(&config.provider_registry))
}

#[tauri::command]
fn save_model(model: ModelConfig) -> Result<ProviderRegistryPublic, String> {
    if model.id.trim().is_empty() || model.label.trim().is_empty() || model.provider_id.trim().is_empty() || model.model_name.trim().is_empty() {
        return Err("Model id, label, provider, and model name are required".to_string());
    }
    let mut config = load_config()?;
    if !config.provider_registry.providers.iter().any(|entry| entry.id == model.provider_id) {
        return Err(format!("Unknown provider: {}", model.provider_id));
    }
    config.provider_registry.models.retain(|entry| entry.id != model.id);
    config.provider_registry.models.push(model);
    save_config(&config)?;
    Ok(ProviderRegistryPublic::from(&config.provider_registry))
}

#[tauri::command]
fn delete_provider(provider_id: String) -> Result<ProviderRegistryPublic, String> {
    let mut config = load_config()?;
    config.provider_registry.providers.retain(|entry| entry.id != provider_id);
    config.provider_registry.models.retain(|entry| entry.provider_id != provider_id);
    save_config(&config)?;
    Ok(ProviderRegistryPublic::from(&config.provider_registry))
}

#[tauri::command]
fn delete_model(model_id: String) -> Result<ProviderRegistryPublic, String> {
    let mut config = load_config()?;
    config.provider_registry.models.retain(|entry| entry.id != model_id);
    save_config(&config)?;
    Ok(ProviderRegistryPublic::from(&config.provider_registry))
}

#[tauri::command]
fn set_provider_api_key(provider_id: String, api_key: String) -> Result<ProviderRegistryPublic, String> {
    let mut config = load_config()?;
    let provider = config.provider_registry.providers.iter_mut().find(|p| p.id == provider_id)
        .ok_or_else(|| format!("Unknown provider: {}", provider_id))?;
    provider.api_key = api_key;
    save_config(&config)?;
    Ok(ProviderRegistryPublic::from(&config.provider_registry))
}

fn model_lookup(model_id: &str) -> Result<(ProviderConfig, ModelConfig), String> {
    let config = load_config()?;
    let model = config
        .provider_registry
        .models
        .iter()
        .find(|entry| entry.id == model_id || entry.model_name == model_id)
        .cloned()
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;
    let provider = config
        .provider_registry
        .providers
        .iter()
        .find(|entry| entry.id == model.provider_id)
        .cloned()
        .ok_or_else(|| format!("Unknown provider: {}", model.provider_id))?;
    Ok((provider, model))
}

fn resolve_virtual_model(_model_id: Option<&str>) -> Result<(ProviderConfig, ModelConfig), String> {
    let config = load_config()?;
    let requested_model_id = &config.gateway.default_virtual_model_id;

    let resolved_model_id = config
        .gateway
        .virtual_models
        .iter()
        .find(|entry| entry.id == *requested_model_id)
        .and_then(|entry| {
            let target = entry.target_model_id.trim();
            if target.is_empty() {
                None
            } else {
                Some(target.to_string())
            }
        })
        .unwrap_or_else(|| requested_model_id.to_string());
    model_lookup(&resolved_model_id)
}

fn build_upstream_url(provider: &ProviderConfig, route: &str) -> String {
    format!("{}/{}", provider.base_url.trim_end_matches('/'), route.trim_start_matches('/'))
}

fn apply_forward_headers(
    mut req: reqwest::RequestBuilder,
    provider: &ProviderConfig,
    headers: &HeaderMap,
) -> reqwest::RequestBuilder {
    if !provider.api_key.is_empty() {
        req = req.bearer_auth(&provider.api_key);
    }

    for header_name in ["x-soda-agent", "anthropic-version", "anthropic-beta"] {
        if let Some(value) = headers.get(header_name) {
            req = req.header(header_name, value);
        }
    }

    req
}

fn response_with_upstream(status: reqwest::StatusCode, headers: &reqwest::header::HeaderMap, body: Vec<u8>) -> Response {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);

    let response_headers = response.headers_mut();
    for (name, value) in headers.iter() {
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            response_headers.append(header_name, header_value);
        }
    }

    response
}

fn prepare_body_with_model(extra: serde_json::Value, model_name: &str) -> serde_json::Value {
    let mut request_body = match extra {
        serde_json::Value::Object(map) => serde_json::Value::Object(map),
        _ => json!({}),
    };

    if let Some(obj) = request_body.as_object_mut() {
        obj.insert("model".to_string(), serde_json::Value::String(model_name.to_string()));
    }

    request_body
}

async fn proxy_openai_chat(
    AxumState(state): AxumState<GatewayRuntimeState>,
    headers: HeaderMap,
    Json(payload): Json<OpenAiChatRequest>,
) -> Response {
    let (provider, model) = match resolve_virtual_model(payload.model.as_deref()) {
        Ok(result) => result,
        Err(err) => return (StatusCode::BAD_REQUEST, err).into_response(),
    };

    let wire_api = provider.wire_api.as_deref().unwrap_or("chat");
    let upstream_route = match wire_api {
        "responses" => "responses",
        _ => "chat/completions",
    };
    let upstream_url = build_upstream_url(&provider, upstream_route);
    let request_body = prepare_body_with_model(payload.extra, &model.model_name);

    let req = apply_forward_headers(state.client.post(upstream_url).json(&request_body), &provider, &headers);

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            let body = match resp.bytes().await {
                Ok(body) => body,
                Err(err) => return (StatusCode::BAD_GATEWAY, err.to_string()).into_response(),
            };
            response_with_upstream(status, &headers, body.to_vec())
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err.to_string()).into_response(),
    }
}

async fn proxy_anthropic_messages(
    AxumState(state): AxumState<GatewayRuntimeState>,
    headers: HeaderMap,
    Json(payload): Json<AnthropicMessagesRequest>,
) -> Response {
    let (provider, model) = match resolve_virtual_model(payload.model.as_deref()) {
        Ok(result) => result,
        Err(err) => return (StatusCode::BAD_REQUEST, err).into_response(),
    };

    let upstream_route = match provider.protocol.as_str() {
        "anthropic" => "messages",
        _ => {
            // For non-anthropic providers, route to chat/completions
            let wire_api = provider.wire_api.as_deref().unwrap_or("chat");
            match wire_api {
                "responses" => "responses",
                _ => "chat/completions",
            }
        }
    };
    let upstream_url = build_upstream_url(&provider, upstream_route);
    let request_body = prepare_body_with_model(payload.extra, &model.model_name);
    let req = apply_forward_headers(state.client.post(upstream_url).json(&request_body), &provider, &headers);

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            let body = match resp.bytes().await {
                Ok(body) => body,
                Err(err) => return (StatusCode::BAD_GATEWAY, err.to_string()).into_response(),
            };
            response_with_upstream(status, &headers, body.to_vec())
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err.to_string()).into_response(),
    }
}

fn start_gateway_server() -> Result<(), String> {
    let gateway = load_config()?.gateway;
    if !gateway.enabled {
        return Ok(());
    }
    spawn_gateway(gateway)
}

fn spawn_gateway(gateway: GatewayConfig) -> Result<(), String> {
    let openai_path = gateway.openai_path.trim_matches('/');
    let anthropic_path = gateway.anthropic_path.trim_matches('/');
    let openai_route = format!("/{}/chat/completions", openai_path);
    let openai_v1_route = format!("/{}/v1/chat/completions", openai_path);
    let anthropic_route = format!("/{}/messages", anthropic_path);
    let anthropic_v1_route = format!("/{}/v1/messages", anthropic_path);
    let app = Router::new()
        .route(&openai_route, post(proxy_openai_chat))
        .route(&openai_v1_route, post(proxy_openai_chat))
        .route(&anthropic_route, post(proxy_anthropic_messages))
        .route(&anthropic_v1_route, post(proxy_anthropic_messages))
        .with_state(GATEWAY_STATE.clone());

    let addr: SocketAddr = format!("{}:{}", gateway.host, gateway.port)
        .parse()
        .map_err(|e| format!("Invalid gateway bind address: {}", e))?;

    // Stop any previously running gateway
    stop_gateway();

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("Failed to bind Soda gateway: {}", err);
                return;
            }
        };

        let changed = shutdown_rx.changed();
        let server = axum::serve(listener, app);

        tokio::select! {
            result = server => {
                if let Err(err) = result {
                    eprintln!("Soda gateway server stopped: {}", err);
                }
            }
            _ = changed => {
                // shutdown signal received
            }
        }
    });

    *GATEWAY_HANDLE.lock().unwrap() = Some(shutdown_tx);
    Ok(())
}

fn stop_gateway() {
    if let Some(tx) = GATEWAY_HANDLE.lock().unwrap().take() {
        // Signal shutdown — value change wakes the watch receiver
        let _ = tx.send(true);
    }
}

fn restart_gateway_server() -> Result<(), String> {
    let gateway = load_config()?.gateway;
    if gateway.enabled {
        spawn_gateway(gateway)
    } else {
        stop_gateway();
        Ok(())
    }
}

fn detect_default_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "cmd".to_string()
            } else {
                "/bin/bash".to_string()
            }
        })
}

fn normalize_terminal_cwd(raw: &str) -> Result<PathBuf, String> {
    let candidate = if raw.is_empty() {
        std::env::current_dir().map_err(|e| format!("Failed to resolve working directory: {}", e))?
    } else {
        PathBuf::from(raw)
    };

    if candidate.is_dir() {
        candidate
            .canonicalize()
            .map_err(|e| format!("Failed to resolve directory {}: {}", candidate.display(), e))
    } else {
        Err(format!("Directory not found: {}", candidate.display()))
    }
}

#[tauri::command]
fn get_terminal_board() -> Result<Vec<TerminalBoardCard>, String> {
    Ok(load_config()?.terminal_board)
}

#[tauri::command]
fn save_terminal_board(cards: Vec<TerminalBoardCard>) -> Result<Vec<TerminalBoardCard>, String> {
    let mut config = load_config()?;
    config.terminal_board = cards;
    save_config(&config)?;
    Ok(config.terminal_board)
}

#[tauri::command]
fn get_terminal_bootstrap() -> Result<TerminalBootstrap, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to resolve current directory: {}", e))?;
    Ok(TerminalBootstrap {
        cwd: cwd.display().to_string(),
        shell: detect_default_shell(),
    })
}

#[tauri::command]
fn terminal_list_directory(cwd: String) -> Result<Vec<TerminalFileTreeEntry>, String> {
    let root = normalize_terminal_cwd(&cwd)?;
    let entries = fs::read_dir(&root)
        .map_err(|e| format!("Failed to read directory {}: {}", root.display(), e))?;

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();
        items.push(TerminalFileTreeEntry {
            name,
            path: path.display().to_string(),
            is_dir,
        });
    }

    items.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(items)
}

#[tauri::command]
fn terminal_read_file_preview(path: String) -> Result<TerminalFilePreview, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    let bytes = fs::read(&file_path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path.display(), e))?;
    let max_len = 16 * 1024;
    let truncated = bytes.len() > max_len;
    let slice = &bytes[..bytes.len().min(max_len)];
    let content = String::from_utf8_lossy(slice).to_string();

    Ok(TerminalFilePreview {
        path: file_path.display().to_string(),
        content,
        truncated,
    })
}

fn emit_terminal_output(app: &AppHandle, payload: TerminalOutputEvent) {
    let _ = app.emit("terminal://output", payload);
}

fn emit_terminal_exit(app: &AppHandle, payload: TerminalOutputEvent) {
    let _ = app.emit("terminal://exit", payload);
}

#[tauri::command]
fn terminal_create_session(app: AppHandle, req: TerminalSessionRequest) -> Result<TerminalSessionResponse, String> {
    let cwd = normalize_terminal_cwd(&req.cwd)?;
    let shell = if req.shell.is_empty() {
        detect_default_shell()
    } else {
        req.shell
    };

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {}", e))?;

    let mut command = CommandBuilder::new(shell.clone());
    command.cwd(cwd.clone());
    command.env("TERM", "xterm-256color");
    if shell.contains("bash") {
        command.env(
            "PROMPT_COMMAND",
            r#"printf '\x1f__SODA_CWD__:%s\x1f\n' "$PWD""#,
        );
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("Failed to spawn shell {}: {}", shell, e))?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| format!("Failed to clone pty reader: {}", e))?;
    let writer = pair.master.take_writer().map_err(|e| format!("Failed to open pty writer: {}", e))?;

    let session_id = format!("terminal-{}", uuid::Uuid::new_v4());
    let session_id_for_thread = session_id.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let chunk = String::from_utf8_lossy(&buffer[..size]).to_string();
                    emit_terminal_output(
                        &app_handle,
                        TerminalOutputEvent {
                            session_id: session_id_for_thread.clone(),
                            chunk,
                            cwd: None,
                            exit_code: None,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        emit_terminal_exit(
            &app_handle,
            TerminalOutputEvent {
                session_id: session_id_for_thread,
                chunk: String::new(),
                cwd: None,
                exit_code: Some(0),
            },
        );
    });

    TERMINAL_STATE
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?
        .insert(
            session_id.clone(),
            TerminalSessionHandle {
                writer,
                master: pair.master,
                child,
            },
        );

    Ok(TerminalSessionResponse {
        session_id,
        cwd: cwd.display().to_string(),
        shell,
    })
}

#[tauri::command]
fn terminal_write(req: TerminalWriteRequest) -> Result<(), String> {
    let mut sessions = TERMINAL_STATE.sessions.lock().map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get_mut(&req.session_id)
        .ok_or_else(|| format!("Unknown terminal session: {}", req.session_id))?;
    session.writer.write_all(req.data.as_bytes()).map_err(|e| format!("Failed to write to terminal session: {}", e))?;
    session.writer.flush().map_err(|e| format!("Failed to flush terminal session: {}", e))?;
    Ok(())
}

#[tauri::command]
fn terminal_resize(req: TerminalResizeRequest) -> Result<(), String> {
    let mut sessions = TERMINAL_STATE.sessions.lock().map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get_mut(&req.session_id)
        .ok_or_else(|| format!("Unknown terminal session: {}", req.session_id))?;
    session.master.resize(PtySize {
        rows: req.rows,
        cols: req.cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Failed to resize terminal session: {}", e))?;
    Ok(())
}

#[tauri::command]
fn terminal_close_session(session_id: String) -> Result<(), String> {
    let mut sessions = TERMINAL_STATE.sessions.lock().map_err(|_| "Terminal state lock poisoned".to_string())?;
    let mut session = sessions.remove(&session_id).ok_or_else(|| format!("Unknown terminal session: {}", session_id))?;
    let _ = session.writer.flush();
    let _ = session.child.kill();
    let _ = session.child.wait();
    Ok(())
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
            get_skill_kits,
            save_skill_kit,
            delete_skill_kit,
            get_agent_skill_kits,
            set_agent_skill_kits,
            get_provider_registry,
            get_gateway_config,
            save_gateway_config,
            toggle_gateway,
            get_gateway_overview,
            save_provider,
            save_model,
            delete_provider,
            delete_model,
            set_provider_api_key,
            get_terminal_board,
            save_terminal_board,
            get_terminal_bootstrap,
            terminal_list_directory,
            terminal_read_file_preview,
            terminal_create_session,
            terminal_write,
            terminal_resize,
            terminal_close_session,
        ])
        .setup(|_app| {
            start_gateway_server()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;
    use serde_json::json;
    use std::sync::{Mutex, MutexGuard};
    use tempfile::tempdir;

    static TEST_ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

    struct TestConfigGuard {
        _lock: MutexGuard<'static, ()>,
        previous_path: Option<std::ffi::OsString>,
    }

    impl TestConfigGuard {
        fn new() -> Self {
            let lock = TEST_ENV_LOCK.lock().expect("lock test env");
            let previous_path = std::env::var_os("SODA_CONFIG_PATH");
            Self {
                _lock: lock,
                previous_path,
            }
        }

        fn set_config_path(&mut self, path: &Path) {
            std::env::set_var("SODA_CONFIG_PATH", path);
        }
    }

    impl Drop for TestConfigGuard {
        fn drop(&mut self) {
            match &self.previous_path {
                Some(value) => std::env::set_var("SODA_CONFIG_PATH", value),
                None => std::env::remove_var("SODA_CONFIG_PATH"),
            }
        }
    }

    fn write_test_config(path: &Path, config: &AppConfig) {
        fs::write(path, serde_json::to_vec_pretty(config).expect("serialize config")).expect("write config");
    }

    fn gateway_state() -> GatewayRuntimeState {
        GatewayRuntimeState {
            client: reqwest::Client::new(),
        }
    }

    #[tokio::test]
    async fn resolve_virtual_model_uses_default_virtual_model() {
        let dir = tempdir().expect("tempdir");
        let config_path = dir.path().join("config.json");
        let mut guard = TestConfigGuard::new();
        guard.set_config_path(&config_path);

        let config = AppConfig {
            provider_registry: ProviderRegistry {
                providers: vec![ProviderConfig {
                    id: "openai-provider".to_string(),
                    label: "OpenAI Provider".to_string(),
                    protocol: "openai".to_string(),
                    base_url: "http://example.test/v1".to_string(),
                    api_key: "test-token".to_string(),
                    wire_api: Some("chat".to_string()),
                }],
                models: vec![ModelConfig {
                    id: "model-default".to_string(),
                    label: "Default Model".to_string(),
                    provider_id: "openai-provider".to_string(),
                    model_name: "gpt-test".to_string(),
                }],
            },
            gateway: GatewayConfig {
                enabled: true,
                host: "127.0.0.1".to_string(),
                port: 4315,
                openai_path: "/openai".to_string(),
                anthropic_path: "/anthropic".to_string(),
                virtual_models: vec![GatewayVirtualModel {
                    id: "soda/default".to_string(),
                    label: "Default".to_string(),
                    target_model_id: "model-default".to_string(),
                }],
                default_virtual_model_id: "soda/default".to_string(),
            },
            ..AppConfig::default()
        };
        write_test_config(&config_path, &config);

        let (provider, model) = resolve_virtual_model(None).expect("resolve default virtual model");
        assert_eq!(provider.id, "openai-provider");
        assert_eq!(model.id, "model-default");
    }

    #[tokio::test]
    async fn proxy_openai_chat_uses_configured_wire_api_and_preserves_headers() {
        let server = MockServer::start_async().await;
        let dir = tempdir().expect("tempdir");
        let config_path = dir.path().join("config.json");
        let mut guard = TestConfigGuard::new();
        guard.set_config_path(&config_path);

        let upstream = server.mock_async(|when, then| {
            when.method(POST)
                .path("/responses")
                .header("authorization", "Bearer secret-token")
                .header("x-soda-agent", "codex")
                .json_body(json!({
                    "model": "gpt-upstream",
                    "input": "hello"
                }));
            then.status(200)
                .header("content-type", "application/json")
                .header("x-upstream-id", "abc123")
                .json_body(json!({ "id": "resp_1" }));
        }).await;

        let config = AppConfig {
            provider_registry: ProviderRegistry {
                providers: vec![ProviderConfig {
                    id: "wire-provider".to_string(),
                    label: "Wire".to_string(),
                    protocol: "openai".to_string(),
                    base_url: server.base_url(),
                    api_key: "secret-token".to_string(),
                    wire_api: Some("responses".to_string()),
                }],
                models: vec![ModelConfig {
                    id: "openai-model".to_string(),
                    label: "OpenAI Model".to_string(),
                    provider_id: "wire-provider".to_string(),
                    model_name: "gpt-upstream".to_string(),
                }],
            },
            gateway: GatewayConfig {
                enabled: true,
                host: "127.0.0.1".to_string(),
                port: 4315,
                openai_path: "/openai".to_string(),
                anthropic_path: "/anthropic".to_string(),
                virtual_models: vec![GatewayVirtualModel {
                    id: "soda/default".to_string(),
                    label: "Default".to_string(),
                    target_model_id: "openai-model".to_string(),
                }],
                default_virtual_model_id: "soda/default".to_string(),
            },
            ..AppConfig::default()
        };
        write_test_config(&config_path, &config);

        let mut headers = HeaderMap::new();
        headers.insert("x-soda-agent", HeaderValue::from_static("codex"));
        let response = proxy_openai_chat(
            AxumState(gateway_state()),
            headers,
            Json(OpenAiChatRequest {
                model: None,
                extra: json!({ "input": "hello" }),
            }),
        ).await;

        upstream.assert_async().await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get("x-upstream-id").unwrap(), "abc123");
    }

    #[tokio::test]
    async fn proxy_anthropic_messages_routes_to_messages_endpoint() {
        let server = MockServer::start_async().await;
        let dir = tempdir().expect("tempdir");
        let config_path = dir.path().join("config.json");
        let mut guard = TestConfigGuard::new();
        guard.set_config_path(&config_path);

        let upstream = server.mock_async(|when, then| {
            when.method(POST)
                .path("/messages")
                .header("authorization", "Bearer anthropic-secret")
                .header("anthropic-version", "2023-06-01")
                .json_body(json!({
                    "model": "claude-upstream",
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 16
                }));
            then.status(200)
                .header("content-type", "application/json")
                .json_body(json!({ "id": "msg_1" }));
        }).await;

        let config = AppConfig {
            provider_registry: ProviderRegistry {
                providers: vec![ProviderConfig {
                    id: "anthropic-provider".to_string(),
                    label: "Anthropic".to_string(),
                    protocol: "anthropic".to_string(),
                    base_url: server.base_url(),
                    api_key: "anthropic-secret".to_string(),
                    wire_api: None,
                }],
                models: vec![ModelConfig {
                    id: "anthropic-model".to_string(),
                    label: "Claude Model".to_string(),
                    provider_id: "anthropic-provider".to_string(),
                    model_name: "claude-upstream".to_string(),
                }],
            },
            gateway: GatewayConfig {
                enabled: true,
                host: "127.0.0.1".to_string(),
                port: 4315,
                openai_path: "/openai".to_string(),
                anthropic_path: "/anthropic".to_string(),
                virtual_models: vec![GatewayVirtualModel {
                    id: "soda/default".to_string(),
                    label: "Default".to_string(),
                    target_model_id: "anthropic-model".to_string(),
                }],
                default_virtual_model_id: "soda/default".to_string(),
            },
            ..AppConfig::default()
        };
        write_test_config(&config_path, &config);

        let mut headers = HeaderMap::new();
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        let response = proxy_anthropic_messages(
            AxumState(gateway_state()),
            headers,
            Json(AnthropicMessagesRequest {
                model: None,
                extra: json!({
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 16
                }),
            }),
        ).await;

        upstream.assert_async().await;
        assert_eq!(response.status(), StatusCode::OK);
    }
}
