import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import toast from "react-hot-toast";
import { Hand } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  source_path: string;
  skill_type: string;
  folder_path: string;
}

export default function SkillsStore() {
  const [folders, setFolders] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<Record<string, string>>({});
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<SkillEntry | null>(null);

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
    refresh();
  }, []);

  async function handleAddFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a folder containing skills",
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

  async function handleExpandSkill(skill: SkillEntry) {
    if (expandedSkill === skill.id) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(skill.id);
    if (!skillContent[skill.id]) {
      try {
        let path = skill.source_path;
        if (skill.skill_type === "folder") {
          path = skill.source_path + "/SKILL.md";
        }
        const content = await invoke<string>("read_skill_content", { path });
        setSkillContent((prev) => ({ ...prev, [skill.id]: content }));
      } catch (err) {
        setSkillContent((prev) => ({
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
      const path = skill.source_path;
      await invoke("remove_skill_from_agent", {
        agentName: "",
        skillPath: path,
      });
      toast.success(`Removed "${skill.name}"`);
      setSkills((prev) => prev.filter((s) => s.id !== skill.id));
      if (expandedSkill === skill.id) {
        setExpandedSkill(null);
      }
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-background">
        <h2 className="text-lg font-medium text-text-primary font-display">Skills Store</h2>
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-christi text-white text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-christi/90 hover:shadow-lg hover:shadow-christi/20 active:scale-[0.97]"
          onClick={handleAddFolder}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          Add Folder
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-christi" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          </div>
        ) : (
          <>
            {folders.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 p-4 rounded-2xl bg-christi/10 border border-christi/30">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-christi"
                  >
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-text-primary mb-2">
                  No skill folders added
                </h3>
                <p className="text-sm text-text-muted mb-5 max-w-sm">
                  Add a local folder to discover skills (SKILL.md folders or .zip files).
                </p>
                <button
                  className="px-6 py-2.5 rounded-xl bg-christi text-white text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-christi/90 hover:shadow-lg hover:shadow-christi/10 active:scale-[0.97]"
                  onClick={handleAddFolder}
                >
                  Add Folder
                </button>
              </div>
            ) : (
              <>
                {/* Folders section */}
                <div className="mb-6">
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-2.5">
                    Folders
                  </h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    {folders.map((folder) => (
                      <div
                        key={folder}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text-primary hover:border-christi/40 hover:shadow-sm transition-all duration-150"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-christi shrink-0"
                        >
                          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        </svg>
                        <span className="max-w-[180px] truncate" title={folder}>
                          {folderDisplayName(folder)}
                        </span>
                        <button
                          className="border-none bg-transparent text-text-muted text-base cursor-pointer px-0.5 leading-none transition-colors duration-150 hover:text-geraldine"
                          onClick={() => handleRemoveFolder(folder)}
                          title="Remove folder"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      className="border border-dashed border-border bg-transparent text-text-muted px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-all duration-150 hover:border-christi hover:text-christi"
                      onClick={handleAddFolder}
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Skills section */}
                <div>
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider mb-3">
                    Skills{" "}
                    <span className="font-normal text-text-muted">({skills.length})</span>
                  </h3>
                  {skills.length === 0 ? (
                    <div className="py-6 text-center text-sm text-text-muted bg-surface rounded-xl border border-dashed border-border">
                      No skills found in the selected folders. Skills are folders with a SKILL.md file or .zip archives.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {skills.map((skill) => (
                        <div
                          key={skill.id}
                          className={`rounded-xl border bg-surface overflow-hidden transition-all duration-200 ${
                            expandedSkill === skill.id
                              ? "border-christi/40 shadow-md shadow-christi/10"
                              : "border-border hover:shadow-sm hover:border-christi/30"
                          }`}
                        >
                          <div
                            className="flex items-start px-4 py-3.5 cursor-pointer gap-3"
                            onClick={() => handleExpandSkill(skill)}
                          >
                            <div className="flex-1 flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-text-primary">
                                  {skill.name}
                                </span>
                                <span
                                  className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                    skill.skill_type === "zip"
                                      ? "bg-christi/20 text-christi"
                                      : "bg-gold/30 text-leaf"
                                  }`}
                                >
                                  {skill.skill_type === "zip" ? "ZIP" : "FOLDER"}
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
                              className="shrink-0 mt-0.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-[0.65rem] font-medium text-text-muted hover:text-text-primary hover:border-christi/40 hover:bg-surface-hover transition-all duration-150 cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData("application/json", JSON.stringify({
                                  source_path: skill.source_path,
                                  skill_name: skill.name,
                                  skill_type: skill.skill_type,
                                }));
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                            >
                              <Hand size={12} className="inline mr-1 -mt-px" />
                              Drag to agent
                            </button>
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
                                expandedSkill === skill.id ? "rotate-180" : ""
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
                          {expandedSkill === skill.id && (
                            <div className="border-t border-border-subtle bg-surface-hover px-4 py-4">
                              <pre className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-words m-0 font-[SF_Mono,Monaco,Menlo,Consolas,monospace]">
                                {skillContent[skill.id] || "Loading..."}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoveSkill !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveSkill(null); }}
        title="Remove Skill"
        description={pendingRemoveSkill
          ? `Permanently delete "${pendingRemoveSkill.name}" from disk? This cannot be undone.`
          : ""
        }
        confirmLabel="Remove"
        onConfirm={confirmRemoveSkill}
      />
    </div>
  );
}
