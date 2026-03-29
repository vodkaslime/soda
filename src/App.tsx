import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast, { Toaster } from "react-hot-toast";
import Sidebar, { type View } from "./components/Sidebar";
import SkillsStore from "./components/SkillsStore";
import AgentDetail from "./components/AgentDetail";
import { ThemeProvider } from "./components/ThemeProvider";
import "./App.css";

function App() {
  const [currentView, setCurrentView] = useState<View>("skills-store");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  function handleViewChange(view: View, agentName?: string | null) {
    setCurrentView(view);
    if (agentName !== undefined) {
      setSelectedAgent(agentName);
    }
  }

  async function handleSkillDrop(
    agentName: string,
    skillData: { source_path: string; skill_name: string; skill_type: string }
  ) {
    try {
      await invoke<string>("copy_skill_to_agent", {
        req: {
          agent_name: agentName,
          source_path: skillData.source_path,
          skill_name: skillData.skill_name,
          skill_type: skillData.skill_type,
        },
      });
      toast.success(`Installed "${skillData.skill_name}" to ${agentName}`, {
        duration: 3000,
      });
      // If the user is viewing this agent's detail, refresh its skills
      if (currentView === "agent-detail" && selectedAgent === agentName) {
        // Force re-render by toggling selectedAgent
        setSelectedAgent(null);
        setTimeout(() => setSelectedAgent(agentName), 0);
      }
    } catch (err) {
      toast.error(String(err), { duration: 5000 });
    }
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
          onSkillDrop={handleSkillDrop}
        />
        <main className="flex-1 overflow-hidden flex flex-col bg-background">
          {currentView === "skills-store" && <SkillsStore />}
          {currentView === "agent-detail" && selectedAgent && (
            <AgentDetail agentName={selectedAgent} />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
