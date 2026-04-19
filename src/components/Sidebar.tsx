import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTheme } from "./ThemeProvider";

export type View = "skills-store" | "skill-detail" | "kits" | "terminal" | "provider-management" | "gateway-management" | "agents" | "agent-detail";

interface SidebarProps {
  currentView: View;
  selectedAgent: string | null;
  onViewChange: (view: View, agentName?: string | null) => void;
}

export default function Sidebar({ currentView, selectedAgent, onViewChange }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <aside className="w-56 min-w-56 h-screen flex flex-col bg-sidebar select-none">
      <div className="px-4 pt-5 pb-4 flex flex-col">
        <h1 className="text-xl font-bold tracking-wide">
          <span className="flex items-center gap-2 bg-christi text-white px-2.5 py-1 rounded-lg font-display font-medium text-xl w-full">
            <svg width="24" height="24" viewBox="0 0 64 64" fill="none" className="shrink-0">
              <path d="M18 14 L14 56 C14 58 16 60 20 60 L44 60 C48 60 50 58 50 56 L46 14 Z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M19 24 L16 56 C16 58 17 59 20 59 L44 59 C47 59 48 58 48 56 L45 24 Z" fill="white" fillOpacity="0.25"/>
              <rect x="16" y="11" width="32" height="4" rx="2" fill="white" fillOpacity="0.4"/>
              <circle cx="17" cy="13" r="12" fill="#ffe64a" fillOpacity="0.85" stroke="white" strokeOpacity="0.5" strokeWidth="1"/>
              <path d="M17 1 L17 25" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
              <path d="M5 13 L29 13" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
              <path d="M8.5 4.5 L25.5 21.5" stroke="white" strokeOpacity="0.3" strokeWidth="0.6"/>
              <path d="M8.5 21.5 L25.5 4.5" stroke="white" strokeOpacity="0.3" strokeWidth="0.6"/>
              <circle cx="28" cy="36" r="2.5" fill="white" fillOpacity="0.9"/>
              <circle cx="38" cy="44" r="2" fill="white" fillOpacity="0.7"/>
              <circle cx="24" cy="50" r="1.8" fill="white" fillOpacity="0.6"/>
              <circle cx="34" cy="30" r="1.5" fill="white" fillOpacity="0.85"/>
              <circle cx="40" cy="54" r="1.5" fill="white" fillOpacity="0.5"/>
              <rect x="36" y="4" width="3" height="20" rx="1.5" fill="white" fillOpacity="0.7" transform="rotate(15 37.5 14)"/>
            </svg>
            Soda
          </span>
        </h1>
      </div>

      <nav className="flex flex-col p-2 gap-0.5 flex-1 overflow-y-auto">
        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "terminal"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("terminal")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
            <path d="m7 9 3 3-3 3" />
            <path d="M12 15h5" />
          </svg>
          <span>{t("sidebar.terminal")}</span>
        </button>

        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "skills-store" || currentView === "skill-detail"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("skills-store")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>{t("sidebar.skillsStore")}</span>
        </button>

        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "kits"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("kits")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span>{t("sidebar.kits")}</span>
        </button>

        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "provider-management"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("provider-management")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7h-9" />
            <path d="M14 17H4" />
            <circle cx="17" cy="17" r="3" />
            <circle cx="7" cy="7" r="3" />
          </svg>
          <span>{t("sidebar.providers")}</span>
        </button>

        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "gateway-management"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("gateway-management")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
            <path d="M19 19l-3-3" />
            <path d="M8 8l-3-3" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{t("sidebar.gateway")}</span>
        </button>

        <button
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all duration-150 cursor-pointer border ${
            currentView === "agents" || currentView === "agent-detail"
              ? "bg-surface text-coral border-border font-medium shadow-sm shadow-christi/15"
              : "text-text-primary/80 hover:bg-surface-hover hover:text-text-primary border-transparent"
          }`}
          onClick={() => onViewChange("agents")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="10" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{t("sidebar.agents")}</span>
          {selectedAgent && currentView === "agent-detail" ? (
            <span className="ml-auto max-w-[6.5rem] truncate text-xs text-coral/75">{selectedAgent}</span>
          ) : null}
        </button>
      </nav>

      <LanguageSwitcher />

      <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
        <span className="text-[0.65rem] text-text-muted uppercase tracking-wider">{t("sidebar.theme")}</span>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 cursor-pointer"
          title={theme === "light" ? t("sidebar.switchToDark") : t("sidebar.switchToLight")}
        >
          {theme === "light" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
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
