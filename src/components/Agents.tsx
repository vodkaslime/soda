import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { AgentStatus } from "../types/agent";

interface AgentsProps {
  onSelectAgent: (agentName: string) => void;
}

type FilterMode = "all" | "installed" | "missing";

const AGENT_DISPLAY: Record<string, { label: string; description: string }> = {
  codex: {
    label: "Codex",
    description: "OpenAI Codex CLI agent",
  },
  claude: {
    label: "Claude Code",
    description: "Anthropic Claude Code CLI agent",
  },
  opencode: {
    label: "OpenCode",
    description: "OpenCode CLI agent",
  },
  openclaw: {
    label: "OpenClaw",
    description: "AI gateway agent with multi-agent orchestration",
  },
  crush: {
    label: "Crush",
    description: "Charmbracelet AI coding agent",
  },
  forgecode: {
    label: "Forge Code",
    description: "Terminal coding agent configured by forge.yaml",
  },
  gemini: {
    label: "Gemini CLI",
    description: "Google terminal AI coding agent",
  },
};

export default function Agents({ onSelectAgent }: AgentsProps) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const { t } = useTranslation();

  useEffect(() => {
    invoke<AgentStatus[]>("detect_agents")
      .then((result) => {
        setAgents(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to detect agents:", err);
        setLoading(false);
      });
  }, []);

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...agents].sort((a, b) => Number(b.installed) - Number(a.installed)).filter((agent) => {
      const display = AGENT_DISPLAY[agent.name] || {
        label: agent.label || agent.name,
        description: "",
      };

      const matchesFilter =
        filterMode === "all" ||
        (filterMode === "installed" && agent.installed) ||
        (filterMode === "missing" && !agent.installed);

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        agent.name,
        agent.label,
        display.label,
        display.description,
        agent.path ?? "",
        agent.installed ? t("agents.statusInstalled") : t("agents.statusMissing"),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [agents, filterMode, search, t]);

  const installedCount = agents.filter((agent) => agent.installed).length;
  const missingCount = agents.length - installedCount;

  function renderAgentCard(agent: AgentStatus) {
    const display = AGENT_DISPLAY[agent.name] || {
      label: agent.label || agent.name,
      description: "",
    };

    return (
      <button
        key={agent.name}
        type="button"
        onClick={() => onSelectAgent(agent.name)}
        className="group w-full rounded-2xl border border-border bg-surface p-5 text-left transition-colors duration-150 hover:border-coral/40 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text-primary transition-colors group-hover:text-coral">
              {display.label}
            </h3>
            <p className="mt-1 text-sm text-text-muted">{display.description}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide ${
              agent.installed ? "bg-christi/10 text-christi" : "bg-coral/10 text-coral"
            }`}
          >
            {agent.installed ? t("agents.statusInstalled") : t("agents.statusMissing")}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-text-muted">{agent.path ?? t("agents.binaryNotDetected")}</span>
          <span className="font-medium text-coral">{t("agents.open")}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-8">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-christi/10 px-3 py-1 text-christi">{t("agents.installedCount", { count: installedCount })}</span>
            <span className="rounded-full bg-coral/10 px-3 py-1 text-coral">{t("agents.missingCount", { count: missingCount })}</span>
          </div>
          <div className="flex flex-1 flex-col gap-3 lg:max-w-3xl lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">{t("agents.searchLabel")}</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("agents.searchPlaceholder")}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm text-text-primary outline-none transition focus:border-coral/50"
              />
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </label>
            <div className="flex gap-2">
              {([
                ["all", t("agents.all", { count: agents.length })],
                ["installed", t("agents.installed", { count: installedCount })],
                ["missing", t("agents.missing", { count: missingCount })],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    filterMode === mode
                      ? "border-coral/40 bg-coral/10 text-coral"
                      : "border-border bg-background text-text-muted hover:border-coral/30 hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
            {t("agents.loading")}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
            {t("agents.empty")}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map(renderAgentCard)}
          </div>
        )}
      </div>
    </div>
  );
}
