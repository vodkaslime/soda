import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { SkillEntry } from "../types/skill";

interface SkillDetailProps {
  skill: SkillEntry;
  onBack: () => void;
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

export default function SkillDetail({ skill, onBack }: SkillDetailProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let path = skill.source_path;
        if (skill.skill_type === "folder") {
          path = skill.source_path + "/SKILL.md";
        }
        const result = await invoke<string>("read_skill_content", { path });
        setContent(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [skill]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 bg-background">
        <div className="mb-3 flex items-center gap-2 text-sm text-text-muted">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted transition hover:text-coral"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t("skillDetail.back")}
          </button>
          <span>/</span>
          <span className="text-text-primary">{skill.name}</span>
        </div>
        <h2 className="text-xl font-medium text-text-primary font-display">{skill.name}</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">{skill.description}</p>
        <div className="mt-3 text-xs font-mono text-text-muted">{pathDisplayName(skill.source_path)}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-text-muted">{t("skillDetail.loading")}</div>
        ) : error ? (
          <div className="text-sm text-coral">{t("skillDetail.failed", { error })}</div>
        ) : (
          <pre className="rounded-2xl border border-border bg-surface p-5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-words font-[SF_Mono,Monaco,Menlo,Consolas,monospace]">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
