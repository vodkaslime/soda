import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog";
import type { SkillEntry } from "../types/skill";

interface SkillsStoreProps {
  onSelectSkill: (skill: SkillEntry) => void;
}

export default function SkillsStore({ onSelectSkill }: SkillsStoreProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<SkillEntry | null>(null);
  const { t } = useTranslation();

  async function refresh() {
    setLoading(true);
    try {
      const storedFolders = await invoke<string[]>("get_skill_folders");
      setFolders(storedFolders);
      if (storedFolders.length > 0) {
        const foundSkills = await invoke<SkillEntry[]>("scan_skills", {
          folders: storedFolders,
        });
        setSkills(foundSkills);
      } else {
        setSkills([]);
      }
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAddFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("skillsStore.selectFolderTitle"),
    });
    if (selected && typeof selected === "string") {
      try {
        const updated = await invoke<string[]>("add_skill_folder", {
          folderPath: selected,
        });
        setFolders(updated);
        const foundSkills = await invoke<SkillEntry[]>("scan_skills", {
          folders: updated,
        });
        setSkills(foundSkills);
      } catch (err) {
        console.error("Failed to add folder:", err);
      }
    }
  }

  async function handleRemoveFolder(folder: string) {
    try {
      const updated = await invoke<string[]>("remove_skill_folder", {
        folderPath: folder,
      });
      setFolders(updated);
      const foundSkills = await invoke<SkillEntry[]>("scan_skills", {
        folders: updated,
      });
      setSkills(foundSkills);
    } catch (err) {
      console.error("Failed to remove folder:", err);
    }
  }

  async function confirmRemoveSkill() {
    if (!pendingRemoveSkill) return;
    const skill = pendingRemoveSkill;
    try {
      const path = skill.source_path;
      await invoke("remove_skill_from_agent", {
        agentName: "",
        skillPath: path,
      });
      toast.success(t("skillsStore.removeSkillSuccess", { name: skill.name }));
      setSkills((prev) => prev.filter((s) => s.id !== skill.id));
    } catch (err) {
      toast.error(String(err));
    }
  }

  function folderDisplayName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-background">
        <h2 className="text-lg font-medium text-text-primary font-display">{t("skillsStore.title")}</h2>
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-christi text-white text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-christi/90"
          onClick={handleAddFolder}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          {t("skillsStore.addFolder")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-christi" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("skillsStore.loading")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 p-4 rounded-2xl bg-christi/10 border border-christi/30">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-christi">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-text-primary mb-2">{t("skillsStore.noFoldersTitle")}</h3>
                <p className="text-sm text-text-muted mb-5 max-w-sm">{t("skillsStore.noFoldersDescription")}</p>
                <button className="px-6 py-2.5 rounded-xl bg-christi text-white text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-christi/90" onClick={handleAddFolder}>
                  {t("skillsStore.addFolder")}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-2">
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-2.5">{t("skillsStore.folders")}</h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    {folders.map((folder) => (
                      <div key={folder} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text-primary hover:border-christi/40 transition-colors duration-150">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-christi shrink-0">
                          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        </svg>
                        <span className="max-w-[180px] truncate" title={folder}>{folderDisplayName(folder)}</span>
                        <button className="border-none bg-transparent text-text-muted text-base cursor-pointer px-0.5 leading-none transition-colors duration-150 hover:text-geraldine" onClick={() => handleRemoveFolder(folder)} title={t("skillsStore.removeFolderTitle")}> 
                          &times;
                        </button>
                      </div>
                    ))}
                    <button className="border border-dashed border-border bg-transparent text-text-muted px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-all duration-150 hover:border-christi hover:text-christi" onClick={handleAddFolder}>
                      {t("skillsStore.addShort")}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">{t("skillsStore.skills")}</h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {skills.map((skill) => (
                      <div key={skill.id} className="rounded-xl border border-border bg-surface overflow-hidden transition-colors duration-200 hover:border-christi/30">
                        <div className="p-4 cursor-pointer" onClick={() => onSelectSkill(skill)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-text-primary">{skill.name}</span>
                              </div>
                              <p className="mt-2 text-sm text-text-secondary leading-relaxed line-clamp-2">{skill.description}</p>
                              <p className="mt-2 text-xs font-mono text-text-muted">{pathDisplayName(skill.source_path)}</p>
                            </div>
                            <button className="border-none bg-transparent text-text-muted text-base cursor-pointer" onClick={(e) => { e.stopPropagation(); setPendingRemoveSkill(skill); }}>
                              &times;
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoveSkill !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveSkill(null); }}
        title={t("skillsStore.removeSkillTitle")}
        description={pendingRemoveSkill ? t("skillsStore.removeSkillDescription", { name: pendingRemoveSkill.name }) : ""}
        confirmLabel={t("common.remove")}
        onConfirm={confirmRemoveSkill}
      />
    </div>
  );
}
