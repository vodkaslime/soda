import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { AgentStatus } from "../types/agent";
import type { SkillEntry, KitEntry } from "../types/skill";

type FilterMode = "all" | "used" | "unused";

const EMPTY_FORM = {
  id: null as string | null,
  name: "",
  description: "",
  skillIds: [] as string[],
};

export default function Kits() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [kits, setKits] = useState<KitEntry[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [agentKitMap, setAgentKitMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const { t } = useTranslation();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [folders, loadedKits, loadedAgents, loadedAgentKitMap] = await Promise.all([
          invoke<string[]>("get_skill_folders"),
          invoke<KitEntry[]>("get_skill_kits").catch(() => []),
          invoke<AgentStatus[]>("detect_agents").catch(() => []),
          invoke<Record<string, string[]>>("get_agent_skill_kits").catch(() => ({} as Record<string, string[]>)),
        ]);
        setKits(loadedKits);
        setAgents(loadedAgents);
        setAgentKitMap(loadedAgentKitMap);
        if (folders.length > 0) {
          const foundSkills = await invoke<SkillEntry[]>("scan_skills", { folders });
          setSkills(foundSkills);
        } else {
          setSkills([]);
        }
      } catch (err) {
        console.error("Failed to load kits:", err);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const skillsById = useMemo(() => Object.fromEntries(skills.map((skill) => [skill.id, skill] as const)), [skills]);

  const usageByKit = useMemo(() => {
    const usage: Record<string, string[]> = {};
    for (const agent of agents) {
      const assigned = agentKitMap[agent.name] ?? [];
      for (const kitId of assigned) {
        if (!usage[kitId]) {
          usage[kitId] = [];
        }
        usage[kitId].push(agent.label);
      }
    }
    return usage;
  }, [agentKitMap, agents]);

  const filteredKits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return kits.filter((kit) => {
      const usage = usageByKit[kit.id] ?? [];
      const matchesFilter =
        filterMode === "all" ||
        (filterMode === "used" && usage.length > 0) ||
        (filterMode === "unused" && usage.length === 0);

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        kit.name,
        kit.description,
        ...kit.skill_ids.map((skillId) => skillsById[skillId]?.name ?? skillId),
        ...usage,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [filterMode, kits, search, skillsById, usageByKit]);

  function resetForm() {
    setEditingKitId(null);
    setForm(EMPTY_FORM);
  }

  function startEditing(kit: KitEntry) {
    setEditingKitId(kit.id);
    setForm({
      id: kit.id,
      name: kit.name,
      description: kit.description,
      skillIds: [...kit.skill_ids],
    });
  }

  async function handleSaveKit() {
    if (!form.name.trim()) {
      toast.error(t("kits.requiredName"));
      return;
    }
    if (form.skillIds.length === 0) {
      toast.error(t("kits.requiredSkills"));
      return;
    }

    try {
      const updated = await invoke<KitEntry[]>("save_skill_kit", {
        req: {
          id: form.id,
          name: form.name.trim(),
          description: form.description.trim(),
          skill_ids: form.skillIds,
        },
      });
      setKits(updated);
      toast.success(editingKitId ? t("kits.updated") : t("kits.created"));
      resetForm();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleDeleteKit(kitId: string) {
    try {
      const updated = await invoke<KitEntry[]>("delete_skill_kit", { kitId });
      setKits(updated);
      setAgentKitMap((prev) => {
        const next: Record<string, string[]> = {};
        for (const [agentName, kitIds] of Object.entries(prev)) {
          next[agentName] = kitIds.filter((id) => id !== kitId);
        }
        return next;
      });
      if (editingKitId === kitId) {
        resetForm();
      }
      toast.success(t("kits.deleted"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  function toggleSkillSelection(skillId: string) {
    setForm((prev) => ({
      ...prev,
      skillIds: prev.skillIds.includes(skillId)
        ? prev.skillIds.filter((id) => id !== skillId)
        : [...prev.skillIds, skillId],
    }));
  }

  const usedCount = kits.filter((kit) => (usageByKit[kit.id] ?? []).length > 0).length;
  const unusedCount = kits.filter((kit) => (usageByKit[kit.id] ?? []).length === 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-background">
        <h2 className="text-lg font-medium text-text-primary font-display">{t("kits.title")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">{t("kits.loading")}</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">
                    {editingKitId ? t("kits.editTitle") : t("kits.createTitle")}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">{t("kits.description")}</p>
                </div>
                {editingKitId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {t("common.cancel")}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t("kits.namePlaceholder")}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none"
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={t("kits.descriptionPlaceholder")}
                  className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none"
                />
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t("kits.selectedSkills", { count: form.skillIds.length })}</span>
                  <span>{t("common.available", { count: skills.length })}</span>
                </div>
                <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-background">
                  {skills.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-text-muted">{t("kits.addFoldersFirst")}</div>
                  ) : (
                    skills.map((skill) => (
                      <label key={skill.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                        <input
                          type="checkbox"
                          checked={form.skillIds.includes(skill.id)}
                          onChange={() => toggleSkillSelection(skill.id)}
                          className="mt-1"
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-text-primary">{skill.name}</span>
                          <span className="block text-xs text-text-muted">{skill.description}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <button
                  className="self-start rounded-lg bg-christi px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-christi/90"
                  onClick={handleSaveKit}
                >
                  {editingKitId ? t("kits.saveChanges") : t("kits.createKit")}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-wider">{t("kits.savedTitle")}</h3>
                  <p className="mt-2 text-sm text-text-secondary">{t("kits.savedDescription")}</p>
                </div>
                <span className="rounded-full bg-christi/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-christi">
                  {t("kits.count", { count: kits.length })}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("kits.searchPlaceholder")}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["all", t("kits.all", { count: kits.length })],
                      ["used", t("kits.used", { count: usedCount })],
                      ["unused", t("kits.unused", { count: unusedCount })],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFilterMode(mode)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          filterMode === mode
                            ? "border-coral/40 bg-coral/10 text-coral"
                            : "border-border bg-surface text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredKits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-sm text-text-muted">
                    {t("kits.empty")}
                  </div>
                ) : (
                  filteredKits.map((kit) => {
                    const usedBy = usageByKit[kit.id] ?? [];
                    return (
                      <div key={kit.id} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary">{kit.name}</h4>
                            <p className="mt-1 text-sm text-text-secondary">{kit.description || t("kits.noDescription")}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="border-none bg-transparent text-sm text-text-secondary cursor-pointer"
                              onClick={() => startEditing(kit)}
                            >
                              {t("kits.edit")}
                            </button>
                            <button
                              className="border-none bg-transparent text-sm text-coral cursor-pointer"
                              onClick={() => handleDeleteKit(kit.id)}
                            >
                              {t("kits.delete")}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {kit.skill_ids.map((skillId) => (
                            <span key={skillId} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary">
                              {skillsById[skillId]?.name ?? skillId}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-border pt-3">
                          <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t("kits.usedBy")}</div>
                          {usedBy.length === 0 ? (
                            <div className="text-xs text-text-muted">{t("kits.noAgentsAssigned")}</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {usedBy.map((agentLabel) => (
                                <span key={agentLabel} className="rounded-full bg-christi/10 px-2.5 py-1 text-xs text-christi">
                                  {agentLabel}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
