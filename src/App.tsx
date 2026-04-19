import { useState } from "react";
import { Toaster } from "react-hot-toast";
import Sidebar, { type View } from "./components/Sidebar";
import SkillsStore from "./components/SkillsStore";
import SkillDetail from "./components/SkillDetail";
import AgentDetail from "./components/AgentDetail";
import Agents from "./components/Agents";
import Kits from "./components/Kits";
import TerminalWorkspace from "./components/TerminalWorkspace";
import ProviderManagement from "./components/ProviderManagement";
import GatewayManagement from "./components/GatewayManagement";
import { ThemeProvider } from "./components/ThemeProvider";
import "./App.css";
import type { SkillEntry } from "./types/skill";

function App() {
  const [currentView, setCurrentView] = useState<View>("skills-store");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);

  function handleViewChange(view: View, agentName?: string | null) {
    setCurrentView(view);
    if (agentName !== undefined) {
      setSelectedAgent(agentName);
    }
    if (view !== "skill-detail") {
      setSelectedSkill(null);
    }
  }

  function handleSkillSelect(skill: SkillEntry) {
    setSelectedSkill(skill);
    setCurrentView("skill-detail");
  }

  return (
    <ThemeProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: "12px",
            fontSize: "13px",
            padding: "10px 14px",
          },
        }}
      />
      <div className="flex h-screen w-screen">
        <Sidebar
          currentView={currentView}
          selectedAgent={selectedAgent}
          onViewChange={handleViewChange}
        />
        <main className="flex-1 overflow-hidden flex flex-col bg-background">
          {currentView === "skills-store" && <SkillsStore onSelectSkill={handleSkillSelect} />}
          {currentView === "provider-management" && <ProviderManagement />}
          {currentView === "gateway-management" && <GatewayManagement />}
          {currentView === "kits" && <Kits />}
          {currentView === "agents" && <Agents onSelectAgent={(agentName) => handleViewChange("agent-detail", agentName)} />}
          <div className={currentView === "terminal" ? "flex-1 min-h-0" : "hidden"}>
            <TerminalWorkspace />
          </div>
          {currentView === "agent-detail" && selectedAgent && (
            <AgentDetail agentName={selectedAgent} onBack={() => handleViewChange("agents")} />
          )}
          {currentView === "skill-detail" && selectedSkill && (
            <SkillDetail skill={selectedSkill} onBack={() => handleViewChange("skills-store")} />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
