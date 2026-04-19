import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { AgentDetailData } from "../types/agent";
import type { KitEntry } from "../types/skill";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  agentName: string;
  onBack?: () => void;
}

interface AgentSkillEntry {
  id: string;
  name: string;
  description: string;
  source_path: string;
  skill_type: string;
  folder_path: string;
}

type InstallInfo = {
  command: string;
  docsUrl: string;
};

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
  crush: "~/.config/crush/skills",
  gemini: "~/.gemini/extensions",
};

const AGENT_INSTALL_INFO: Record<string, InstallInfo> = {
  codex: {
    command: "npm install -g @openai/codex",
    docsUrl: "https://help.openai.com/en/articles/11096431",
  },
  claude: {
    command: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
  },
  opencode: {
    command: "brew install opencode-ai/tap/opencode",
    docsUrl: "https://github.com/opencode-ai/opencode",
  },
  openclaw: {
    command: "curl -fsSL https://install.openclaw.ai | sh",
    docsUrl: "https://docs.openclaw.ai/install",
  },
  crush: {
    command: "brew install charmbracelet/tap/crush",
    docsUrl: "https://github.com/charmbracelet/crush",
  },
  forgecode: {
    command: "curl -fsSL https://forgecode.dev/cli | sh",
    docsUrl: "https://github.com/tailcallhq/forgecode",
  },
  gemini: {
    command: "npm install -g @google/gemini-cli",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
};

function getSkillsDir(agentName: string): string {
  return SKILLS_DIR_MAP[agentName] ?? "";
}

export default function AgentDetail({ agentName, onBack }: Props) {
  const [detail, setDetail] = useState<AgentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawConfig, setShowRawConfig] = useState(false);
  const [agentSkills, setAgentSkills] = useState<AgentSkillEntry[]>([]);
  const [kits, setKits] = useState<KitEntry[]>([]);
  const [agentKitIds, setAgentKitIds] = useState<string[]>([]);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [skillContents, setSkillContents] = useState<Record<string, string>>({});
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<AgentSkillEntry | null>(null);
  const { t } = useTranslation();

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
      invoke<KitEntry[]>("get_skill_kits").catch(() => []),
      invoke<Record<string, string[]>>("get_agent_skill_kits").catch(() => ({} as Record<string, string[]>)),
    ])
      .then(([agentDetail, skills, loadedKits, agentKitMap]) => {
        setDetail(agentDetail);
        setAgentSkills(skills);
        setKits(loadedKits);
        setAgentKitIds(agentKitMap[agentName] ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [agentName]);

  const installInfo = AGENT_INSTALL_INFO[agentName];

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
          [skill.id]: t("agentDetail.skillContentError", { error: String(err) }),
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
      toast.success(t("agentDetail.skillRemoved", { skill: skill.name, agent: agentName }));
      setAgentSkills((prev) => prev.filter((s) => s.id !== skill.id));
      if (expandedSkillId === skill.id) {
        setExpandedSkillId(null);
      }
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleToggleKit(kitId: string) {
    const nextKitIds = agentKitIds.includes(kitId)
      ? agentKitIds.filter((id) => id !== kitId)
      : [...agentKitIds, kitId];

    setAgentKitIds(nextKitIds);
    try {
      await invoke("set_agent_skill_kits", { agentName, kitIds: nextKitIds });
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleOpenPath(path: string) {
    try {
      await openPath(path);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleOpenParent(path: string) {
    const normalized = path.trim();
    const lastSlash = normalized.lastIndexOf("/");
    const parent = lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
    await handleOpenPath(parent);
  }

  async function handleCopyInstallCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      toast.success(t("agentDetail.installCommandCopied"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  const connectionRows = useMemo(() => {
    if (!detail?.gateway) {
      return [];
    }
    return [
      { label: t("agentDetail.gatewayBaseUrl"), value: detail.gateway.base_url, mono: true },
      { label: t("agentDetail.gatewayModel"), value: detail.gateway.default_model, mono: true },
      { label: t("agentDetail.gatewayApiStyle"), value: detail.gateway.api_style, mono: false },
    ];
  }, [detail, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-christi" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t("agentDetail.loading")}
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center h-full text-coral">
        {t("agentDetail.failed", { error })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 bg-background">
        <div className="mb-3 flex items-center gap-2 text-sm text-text-muted">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted transition hover:border-coral/30 hover:text-coral disabled:cursor-default disabled:opacity-60"
            disabled={!onBack}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t("sidebar.agents")}
          </button>
          <span>/</span>
          <span className="text-text-primary">{detail.label}</span>
        </div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-medium text-text-primary font-display">{detail.label}</h2>
          <span
            className={`text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              detail.installed
                ? "bg-leaf/20 text-leaf border border-leaf/30"
                : "bg-coral/15 text-coral border border-coral/25"
            }`}
          >
            {detail.installed ? t("agents.statusInstalled") : t("agents.statusMissing")}
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{detail.description}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {!detail.installed && installInfo ? (
          <section className="rounded-2xl border border-coral/25 bg-surface p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-[0.75rem] font-semibold text-coral uppercase tracking-wider">{t("agentDetail.installAgent")}</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {t("agentDetail.installDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openUrl(installInfo.docsUrl)}
                className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {t("agentDetail.openInstallGuide")}
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t("agentDetail.installCommand")}</div>
                <button
                  type="button"
                  onClick={() => void handleCopyInstallCommand(installInfo.command)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary cursor-pointer"
                >
                  {t("agentDetail.copy")}
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-sm font-mono text-text-primary">{installInfo.command}</pre>
            </div>
          </section>
        ) : null}

        {detail.installed && connectionRows.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">{t("agentDetail.gatewayTitle")}</h3>
              <p className="mt-2 text-sm text-text-secondary">{t("agentDetail.gatewayDescription")}</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {connectionRows.map((row) => (
                <div key={row.label} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{row.label}</div>
                  <div className={`mt-2 break-all text-sm text-text-primary ${row.mono ? "font-mono" : ""}`}>{row.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.config_files.map((cf) => (
                <button
                  key={cf.path}
                  type="button"
                  onClick={() => void handleOpenParent(cf.path)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary cursor-pointer"
                >
                  {t("agentDetail.openConfigFolder")}
                </button>
              )).slice(0, 1)}
            </div>
          </section>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <div className="p-4 rounded-xl border border-border bg-surface transition-colors duration-200 hover:border-christi/30">
            <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              {t("agentDetail.status")}
            </div>
            <div className="text-sm font-medium">
              <span className={`flex items-center gap-1.5 ${detail.installed ? "text-leaf" : "text-coral"}`}>
                <span className={`w-2 h-2 rounded-full ${detail.installed ? "bg-leaf shadow-[0_0_6px_rgba(21_224_90,0.4)]" : "bg-coral shadow-[0_0_6px_rgba(232_91_69,0.3)]"}`} />
                {detail.installed ? t("agentDetail.active") : t("agents.statusMissing")}
              </span>
            </div>
          </div>

          {detail.version && (
            <div className="p-4 rounded-xl border border-border bg-surface transition-colors duration-200 hover:border-christi/30">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {t("agentDetail.version")}
              </div>
              <div className="text-sm font-medium font-mono text-text-primary">{detail.version}</div>
            </div>
          )}

          {detail.binary_path && (
            <div className="p-4 rounded-xl border border-border bg-surface transition-colors duration-200 hover:border-christi/30">
              <div className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {t("agentDetail.binaryPath")}
              </div>
              <div className="text-xs font-mono text-text-secondary break-all">
                {pathDisplayName(detail.binary_path)}
              </div>
            </div>
          )}
        </div>

        {detail.config_files.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">
                {t("agentDetail.configFiles")}
              </h3>
              <span className="text-xs text-text-muted">{t("agentDetail.configFilesHint")}</span>
            </div>
            <div className="flex flex-col gap-2">
              {detail.config_files.map((cf) => (
                <div
                  key={cf.path}
                  className={`rounded-lg border px-4 py-3 transition-all duration-200 ${
                    cf.exists
                      ? "border-border bg-surface hover:border-christi/40"
                      : "border-dashed border-border bg-surface opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                        cf.exists
                          ? "bg-leaf shadow-[0_0_6px_rgba(21_224_90,0.3)]"
                          : "bg-text-muted"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-text-primary break-all">
                        {pathDisplayName(cf.path)}
                      </div>
                      <div className={`mt-1 text-[0.65rem] font-bold uppercase tracking-wider ${cf.exists ? "text-leaf" : "text-text-muted"}`}>
                        {cf.exists ? t("agentDetail.found") : t("agentDetail.supportedLocation")}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {cf.exists ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleOpenPath(cf.path)}
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary cursor-pointer"
                          >
                            {t("agentDetail.open")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOpenParent(cf.path)}
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary cursor-pointer"
                          >
                            {t("agentDetail.folder")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleOpenParent(cf.path)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary cursor-pointer"
                        >
                          {t("agentDetail.openConfigFolder")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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

        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">
              {t("agentDetail.localSkills")}
              <span className="font-normal text-text-muted ml-1.5">({agentSkills.length})</span>
            </h3>
            <span className="text-xs text-text-muted">{t("agentDetail.kitsAssigned", { count: agentKitIds.length })}</span>
          </div>
          {kits.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {kits.map((kit) => {
                const active = agentKitIds.includes(kit.id);
                return (
                  <button
                    key={kit.id}
                    type="button"
                    onClick={() => void handleToggleKit(kit.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-christi/40 bg-christi/10 text-christi"
                        : "border-border bg-surface text-text-secondary hover:border-christi/30 hover:text-text-primary"
                    }`}
                  >
                    {kit.name} ({kit.skill_ids.length})
                  </button>
                );
              })}
            </div>
          )}
          {agentSkills.length === 0 ? (
            <div className="py-5 text-center text-sm text-text-muted bg-surface rounded-xl border border-dashed border-border">
              {t("agentDetail.noSkillsFound")} {" "}
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
                      ? "border-christi/40"
                      : "border-border hover:border-christi/30"
                  }`}
                >
                  <div
                    className="flex items-start px-4 py-3 cursor-pointer gap-3"
                    onClick={() => void handleToggleSkill(skill)}
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
                      title={t("agentDetail.removeSkill")}
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
                        {skillContents[skill.id] || t("skillsStore.loading")}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {detail.raw_config && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">
                {t("agentDetail.rawConfiguration")}
              </h3>
              <button
                className="px-3 py-1 rounded-lg border border-border bg-surface text-xs text-text-secondary hover:bg-surface-hover hover:border-christi/30 hover:text-text-primary transition-all duration-150 cursor-pointer font-medium"
                onClick={() => setShowRawConfig(!showRawConfig)}
              >
                {showRawConfig ? t("common.hide") : t("common.show")}
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
        title={t("skillsStore.removeSkillTitle")}
        description={pendingRemoveSkill
          ? t("agentDetail.removeSkillDescription", { name: pendingRemoveSkill.name, agent: agentName })
          : ""
        }
        confirmLabel={t("common.remove")}
        onConfirm={confirmRemoveSkill}
      />
    </div>
  );
}
