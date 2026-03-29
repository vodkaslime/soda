import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Agents.css";

interface AgentStatus {
  name: string;
  installed: boolean;
  path: string | null;
}

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
};

export default function Agents() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="agents">
      <div className="agents-header">
        <h2>Agents</h2>
        <span className="agents-subtitle">
          Detected CLI agent installations on your system
        </span>
      </div>
      <div className="agents-list">
        {loading ? (
          <div className="loading">Detecting agents...</div>
        ) : (
          agents.map((agent) => {
            const display = AGENT_DISPLAY[agent.name] || {
              label: agent.name,
              description: "",
            };
            return (
              <div
                key={agent.name}
                className={`agent-card ${agent.installed ? "installed" : "not-installed"}`}
              >
                <div className="agent-info">
                  <div className="agent-name-row">
                    <span className="agent-name">{display.label}</span>
                    <span
                      className={`agent-badge ${agent.installed ? "badge-installed" : "badge-missing"}`}
                    >
                      {agent.installed ? "Installed" : "Not Found"}
                    </span>
                  </div>
                  <span className="agent-description">
                    {display.description}
                  </span>
                  {agent.path && (
                    <span className="agent-path">{agent.path}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
