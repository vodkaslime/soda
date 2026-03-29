import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import type { AgentDetailData } from "../types/agent";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  agentName: string;
}

interface AgentSkillEntry {
  id: string;
  name: string;
  description: string;
  source_path: string;
  skill_type: string;
  folder_path: string;
}

function pathDisplayName(path: string): string {
  const home = "/home/";
  if (path.startsWith(home)) {
    const rest = path.slice(home.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) {
      return "~" + rest.slice(slashIdx);
    }
    return "~/" + rest;
  }
  return path;
}

const SKILLS_DIR_MAP: Record<string, string> = {
  claude: "~/.claude/skills",
  codex: "~/.codex/skills",
  opencode: "~/.config/opencode/skills",
  openclaw: "~/.openclaw/workspace/skills",
};

function getSkillsDir(agentName: string): string {
  return SKILLS_DIR_MAP[agentName] ?? "";
}

export default function AgentDetail({ agentName }: Props) {
  const [detail, setDetail] = useState<AgentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawConfig, setShowRawConfig] = useState(false);
  const [agentSkills, setAgentSkills] = useState<AgentSkillEntry[]>([]);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [skillContents, setSkillContents] = useState<Record<string, string>>({});
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<AgentSkillEntry | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setShowRawConfig(false);
    setAgentSkills([]);
    setExpandedSkillId(null);
    setSkillContents({});

    Promise.all([
      invoke<AgentDetailData>("get_agent_details", { agentName }),
      invoke<AgentSkillEntry[]>("scan_agent_skills", { agentName }).catch(() => []),
    ])
      .then(([agentDetail, skills]) => {
        setDetail(agentDetail);
        setAgentSkills(skills);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [agentName]);

  async function handleToggleSkill(skill: AgentSkillEntry) {
    if (expandedSkillId === skill.id) {
      setExpandedSkillId(null);
      return;
    }
    setExpandedSkillId(skill.id);
    if (!skillContents[skill.id]) {
      try {
        let path = skill.source_path;
        if (skill.skill_type === "folder") {
          path = skill.source_path + "/SKILL.md";
        }
        const content = await invoke<string>("read_skill_content", { path });
        setSkillContents((prev) => ({ ...prev, [skill.id]: content }));
      } catch (err) {
        setSkillContents((prev) => ({
          ...prev,
          [skill.id]: `Error loading content: ${err}`,
        }));
      }
    }
  }

  async function confirmRemoveSkill() {
    if (!pendingRemoveSkill) return;
    const skill = pendingRemoveSkill;
    try {
      await invoke("remove_skill_from_agent", {
        agentName,
        skillPath: skill.source_path,
      });
      toast.success(`Removed "${skill.name}" from ${agentName}`);
      setAgentSkills((prev) => prev.filter((s) => s.id !== skill.id));
      if (expandedSkillId === skill.id) {
        setExpandedSkillId(null);
      }
    } catch (err) {
      toast.error(String(err));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-christi" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading agent details...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center h-full text-coral">
        Failed to load agent: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 bg-background">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-medium text-text-primary font-display">{detail.label}</h2>
          <span
            className={`text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              detail.installed
                ? "bg-leaf/20 text-leaf border border-leaf/30"
                : "bg-coral/15 text-coral border border-coral/25"
            }`}
          >
            {detail.installed ? "Installed" : "Not Found"}
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{detail.description}</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {/* Info cards grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {/* Status */}
          <div className="p-4 rounded-xl border border-border bg-surface hover:shadow-md hover:border-christi/30 transition-all duration-200">
            <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Status
            </div>
            <div className="text-sm font-medium">
              {detail.installed ? (
                <span className="text-leaf flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-leaf shadow-[0_0_6px_rgba(21_224_90,0.4)]" />
                  Active
                </span>
              ) : (
                <span className="text-coral">Not installed</span>
              )}
            </div>
          </div>

          {/* Version */}
          {detail.version && (
            <div className="p-4 rounded-xl border border-border bg-surface hover:shadow-md hover:border-christi/30 transition-all duration-200">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Version
              </div>
              <div className="text-sm font-medium font-mono text-text-primary">{detail.version}</div>
            </div>
          )}

          {/* Provider */}
          {detail.provider && (
            <div className="p-4 rounded-xl border border-border bg-surface hover:shadow-md hover:border-christi/30 transition-all duration-200">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Provider
              </div>
              <div className="text-sm font-medium text-text-primary capitalize">{detail.provider}</div>
            </div>
          )}

          {/* Model */}
          {detail.model && (
            <div className="p-4 rounded-xl border border-border bg-surface hover:shadow-md hover:border-christi/30 transition-all duration-200">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Model
              </div>
              <div className="text-sm font-medium font-mono text-christi">{detail.model}</div>
            </div>
          )}

          {/* Binary Path */}
          {detail.binary_path && (
            <div className="p-4 rounded-xl border border-border bg-surface hover:shadow-md hover:border-christi/30 transition-all duration-200">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Binary Path
              </div>
              <div className="text-xs font-mono text-text-secondary break-all">
                {pathDisplayName(detail.binary_path)}
              </div>
            </div>
          )}
        </div>

        {/* Config files */}
        {detail.config_files.length > 0 && (
          <div>
            <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">
              Configuration Files
            </h3>
            <div className="flex flex-col gap-2">
              {detail.config_files.map((cf) => (
                <div
                  key={cf.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 ${
                    cf.exists
                      ? "border-border bg-surface hover:border-christi/40 hover:shadow-sm"
                      : "border-dashed border-border bg-surface opacity-60"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      cf.exists
                        ? "bg-leaf shadow-[0_0_6px_rgba(21_224_90,0.3)]"
                        : "bg-text-muted"
                    }`}
                  />
                  <span className="flex-1 font-mono text-xs text-text-primary">
                    {pathDisplayName(cf.path)}
                  </span>
                  <span
                    className={`text-[0.65rem] font-bold uppercase tracking-wider ${
                      cf.exists ? "text-leaf" : "text-text-muted"
                    }`}
                  >
                    {cf.exists ? "Found" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills / Agents / Profiles */}
        {detail.skills.length > 0 && (
          <div>
            <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">
              {detail.skills_label}
            </h3>
            <div className="flex flex-wrap gap-2">
              {detail.skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-christi/20 text-christi border border-christi/30 hover:bg-christi/30 transition-colors duration-150"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Local Skills */}
        <div>
          <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Local Skills
            <span className="font-normal text-text-muted ml-1.5">({agentSkills.length})</span>
          </h3>
          {agentSkills.length === 0 ? (
            <div className="py-5 text-center text-sm text-text-muted bg-surface rounded-xl border border-dashed border-border">
              No skills found. Add skill folders at{" "}
              <span className="font-mono text-xs text-text-secondary">
                {getSkillsDir(agentName)}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {agentSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={`rounded-xl border bg-surface overflow-hidden transition-all duration-200 ${
                    expandedSkillId === skill.id
                      ? "border-christi/40 shadow-md shadow-christi/10"
                      : "border-border hover:shadow-sm hover:border-christi/30"
                  }`}
                >
                  <div
                    className="flex items-start px-4 py-3 cursor-pointer gap-3"
                    onClick={() => handleToggleSkill(skill)}
                  >
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-text-primary">
                          {skill.name}
                        </span>
                      </div>
                      <span className="text-sm text-text-secondary leading-relaxed line-clamp-2">
                        {skill.description}
                      </span>
                      <span className="text-xs font-mono text-text-muted">
                        {pathDisplayName(skill.source_path)}
                      </span>
                    </div>
                    <button
                      className="shrink-0 mt-0.5 p-1 rounded-lg text-text-muted hover:text-coral hover:bg-coral/10 transition-all duration-150 cursor-pointer border-none bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingRemoveSkill(skill);
                      }}
                      title="Remove skill"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
                      </svg>
                    </button>
                    <svg
                      className={`shrink-0 mt-1 text-text-muted transition-transform duration-200 ${
                        expandedSkillId === skill.id ? "rotate-180" : ""
                      }`}
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="4,6 8,10 12,6" />
                    </svg>
                  </div>
                  {expandedSkillId === skill.id && (
                    <div className="border-t border-border bg-surface-hover px-4 py-4">
                      <pre className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-words m-0 font-[SF_Mono,Monaco,Menlo,Consolas,monospace]">
                        {skillContents[skill.id] || "Loading..."}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MCP Servers */}
        {detail.mcp_servers.length > 0 && (
          <div>
            <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">
              MCP Servers
            </h3>
            <div className="flex flex-wrap gap-2">
              {detail.mcp_servers.map((server) => (
                <span
                  key={server}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-coral/15 text-coral border border-coral/25 hover:bg-coral/25 transition-colors duration-150"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-coral" />
                  {server}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Raw config */}
        {detail.raw_config && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">
                Raw Configuration
              </h3>
              <button
                className="px-3 py-1 rounded-lg border border-border bg-surface text-xs text-text-secondary hover:bg-surface-hover hover:border-christi/30 hover:text-text-primary transition-all duration-150 cursor-pointer font-medium"
                onClick={() => setShowRawConfig(!showRawConfig)}
              >
                {showRawConfig ? "Hide" : "Show"}
              </button>
            </div>
            {showRawConfig && (
              <pre className="bg-surface-hover text-text-primary p-5 rounded-xl text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap break-words border border-border">
                {detail.raw_config}
              </pre>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoveSkill !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveSkill(null); }}
        title="Remove Skill"
        description={pendingRemoveSkill
          ? `Remove "${pendingRemoveSkill.name}" from ${agentName}? This cannot be undone.`
          : ""
        }
        confirmLabel="Remove"
        onConfirm={confirmRemoveSkill}
      />
    </div>
  );
}
