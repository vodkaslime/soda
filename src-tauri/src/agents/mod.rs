pub mod codex;
pub mod claude;
pub mod opencode;
pub mod openclaw;
pub mod crush;
pub mod forgecode;
pub mod gemini;

use crate::{AgentDetail, AgentStatus};

/// Uniform interface that every agent plugin must implement.
/// Adding a new agent = implement this trait + register in `all_agents()`.
pub trait Agent: Send + Sync {
    /// Internal identifier used in config / CLI (e.g. "codex")
    fn name(&self) -> &str;

    /// Human-readable display name (e.g. "Codex CLI")
    fn label(&self) -> &str;

    /// Short description shown in the detail header
    fn description(&self) -> &str;

    /// Label for the "skills" section (e.g. "Profiles & Providers" for codex)
    fn skills_label(&self) -> &str;

    /// Path to the agent's skills directory (e.g. "~/.claude/skills").
    /// Returns None if the agent does not support local skills.
    fn skills_dir(&self) -> Option<std::path::PathBuf>;

    /// Check whether the agent binary is on $PATH
    fn detect(&self) -> AgentStatus {
        let result = which::which(self.name());
        AgentStatus {
            name: self.name().to_string(),
            label: self.label().to_string(),
            installed: result.is_ok(),
            path: result.ok().map(|p| p.display().to_string()),
        }
    }

    /// Collect full detail (config, version, skills, mcp, etc.)
    fn get_details(&self) -> AgentDetail;
}

/// Returns a boxed slice of every known agent, in display order.
pub fn all_agents() -> Vec<Box<dyn Agent>> {
    vec![
        Box::new(codex::CodexAgent),
        Box::new(claude::ClaudeAgent),
        Box::new(opencode::OpenCodeAgent),
        Box::new(openclaw::OpenClawAgent),
        Box::new(crush::CrushAgent),
        Box::new(forgecode::ForgeCodeAgent),
        Box::new(gemini::GeminiAgent),
    ]
}

/// Look up an agent by its internal name (e.g. "codex").
pub fn find_agent(name: &str) -> Option<Box<dyn Agent>> {
    all_agents().into_iter().find(|a| a.name() == name)
}
