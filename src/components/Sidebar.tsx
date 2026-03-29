import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "./ThemeProvider";
import type { AgentStatus } from "../types/agent";

export type View = "skills-store" | "agent-detail";

interface SidebarProps {
  currentView: View;
  selectedAgent: string | null;
  onViewChange: (view: View, agentName?: string | null) => void;
  onSkillDrop: (agentName: string, skillData: { source_path: string; skill_name: string; skill_type: string }) => void;
}

export default function Sidebar({ currentView, selectedAgent, onViewChange, onSkillDrop }: SidebarProps) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [dragOverAgent, setDragOverAgent] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    invoke<AgentStatus[]>("detect_agents")
      .then((result) => setAgents(result))
      .catch((err) => console.error("Failed to detect agents:", err));
  }, []);

  const installedAgents = agents.filter((a) => a.installed);

  return (
    <aside className="w-56 min-w-56 h-screen flex flex-col bg-sidebar select-none">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <h1 className="text-xl font-bold tracking-wide">
          <span className="inline-flex items-center gap-2 bg-christi text-white px-2.5 py-1 rounded-lg font-display font-medium text-xl">
            <svg width="24" height="24" viewBox="0 0 64 64" fill="none" className="shrink-0">
              {/* Glass body */}
              <path d="M18 14 L14 56 C14 58 16 60 20 60 L44 60 C48 60 50 58 50 56 L46 14 Z" fill="white" fill-opacity="0.15" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
              {/* Liquid */}
              <path d="M19 24 L16 56 C16 58 17 59 20 59 L44 59 C47 59 48 58 48 56 L45 24 Z" fill="white" fill-opacity="0.25"/>
              {/* Rim */}
              <rect x="16" y="11" width="32" height="4" rx="2" fill="white" fill-opacity="0.4"/>
              {/* Lemon slice */}
              <circle cx="17" cy="13" r="12" fill="#ffe64a" fill-opacity="0.85" stroke="white" stroke-opacity="0.5" strokeWidth="1"/>
              <path d="M17 1 L17 25" stroke="white" stroke-opacity="0.4" strokeWidth="0.8"/>
              <path d="M5 13 L29 13" stroke="white" stroke-opacity="0.4" strokeWidth="0.8"/>
              <path d="M8.5 4.5 L25.5 21.5" stroke="white" stroke-opacity="0.3" strokeWidth="0.6"/>
              <path d="M8.5 21.5 L25.5 4.5" stroke="white" stroke-opacity="0.3" strokeWidth="0.6"/>
              {/* Bubbles */}
              <circle cx="28" cy="36" r="2.5" fill="white" fill-opacity="0.9"/>
              <circle cx="38" cy="44" r="2" fill="white" fill-opacity="0.7"/>
              <circle cx="24" cy="50" r="1.8" fill="white" fill-opacity="0.6"/>
              <circle cx="34" cy="30" r="1.5" fill="white" fill-opacity="0.85"/>
              <circle cx="40" cy="54" r="1.5" fill="white" fill-opacity="0.5"/>
              {/* Straw */}
              <rect x="36" y="4" width="3" height="20" rx="1.5" fill="white" fill-opacity="0.7" transform="rotate(15 37.5 14)"/>
            </svg>
            Soda
          </span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col p-2 gap-0.5 flex-1 overflow-y-auto">
        {/* Skills Store button */}
        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "skills-store"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("skills-store")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span>Skills Store</span>
        </button>

        {/* Agents section */}
        <div className="flex flex-col mt-2">
          {/* Section header */}
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-transparent text-[0.7rem] font-semibold uppercase tracking-wider w-full text-left transition-all duration-150 cursor-pointer text-coral/50 hover:text-coral/70"
            onClick={() => setAgentsCollapsed(!agentsCollapsed)}
          >
            <svg
              className="transition-transform duration-150 shrink-0"
              style={{ transform: agentsCollapsed ? "rotate(-90deg)" : undefined }}
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3,4 6,7 9,4" />
            </svg>
            <span>Agents</span>
            <span className="ml-auto text-[0.65rem] bg-coral/10 text-coral/60 px-1.5 py-0.5 rounded-full font-semibold tabular-nums">
              {installedAgents.length}
            </span>
          </button>

          {/* Agent list */}
          {!agentsCollapsed && (
            <div className="flex flex-col gap-px pl-1.5">
              {installedAgents.length === 0 ? (
                <div className="px-3 py-2 pl-4 text-xs text-text-muted italic">
                  No agents detected
                </div>
              ) : (
                installedAgents.map((agent) => (
                  <button
                    key={agent.name}
                    className={`flex items-center gap-2 px-3 py-2 pl-4 rounded-lg text-[0.82rem] w-full text-left transition-all duration-150 cursor-pointer border ${
                      dragOverAgent === agent.name
                        ? "bg-christi/10 border-christi/50 text-christi shadow-md shadow-christi/15 scale-[1.02]"
                        : currentView === "agent-detail" && selectedAgent === agent.name
                          ? "bg-surface border-border font-medium shadow-sm shadow-christi/15"
                          : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
                    }`}
                    onClick={() => onViewChange("agent-detail", agent.name)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setDragOverAgent(agent.name);
                    }}
                    onDragLeave={() => {
                      setDragOverAgent(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverAgent(null);
                      try {
                        const raw = e.dataTransfer.getData("application/json");
                        const skillData = JSON.parse(raw);
                        onSkillDrop(agent.name, skillData);
                      } catch {
                        // ignore invalid drops
                      }
                    }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        currentView === "agent-detail" && selectedAgent === agent.name
                          ? "bg-christi shadow-[0_0_8px_rgba(121,168,18,0.6)]"
                          : "bg-coral/40"
                      }`}
                    />
                    <span className={currentView === "agent-detail" && selectedAgent === agent.name ? "text-christi" : ""}>
                      {agent.label}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Footer: theme toggle */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[0.65rem] text-text-muted uppercase tracking-wider">Theme</span>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 cursor-pointer"
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? (
            /* Moon icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            /* Sun icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
}
