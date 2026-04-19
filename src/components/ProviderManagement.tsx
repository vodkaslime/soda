import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Select from "./ui/Select";

type ProviderProtocol = "openai" | "anthropic";

type ProviderConfigPublic = {
  id: string;
  label: string;
  protocol: ProviderProtocol;
  base_url: string;
  api_key_masked: string;
  api_key_set: boolean;
  wire_api?: string | null;
};

type ModelConfig = {
  id: string;
  label: string;
  provider_id: string;
  model_name: string;
};

type ProviderRegistryPublic = {
  providers: ProviderConfigPublic[];
  models: ModelConfig[];
};

const EMPTY_PROVIDER: Omit<ProviderConfigPublic, "id"> = {
  label: "",
  protocol: "openai",
  base_url: "",
  api_key_masked: "",
  api_key_set: false,
  wire_api: "responses",
};

const EMPTY_MODEL: Omit<ModelConfig, "id"> = {
  label: "",
  provider_id: "",
  model_name: "",
};

export default function ProviderManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [registry, setRegistry] = useState<ProviderRegistryPublic>({ providers: [], models: [] });
  const [providerDraft, setProviderDraft] = useState(EMPTY_PROVIDER);
  const [providerApiKey, setProviderApiKey] = useState("");
  const [modelDraft, setModelDraft] = useState(EMPTY_MODEL);
  const [editingApiKey, setEditingApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");

  async function refreshState() {
    setLoading(true);
    try {
      const nextRegistry = await invoke<ProviderRegistryPublic>("get_provider_registry");
      setRegistry(nextRegistry);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshState();
  }, []);

  const modelsByProvider = useMemo(() => {
    return registry.models.reduce<Record<string, ModelConfig[]>>((acc, model) => {
      if (!acc[model.provider_id]) {
        acc[model.provider_id] = [];
      }
      acc[model.provider_id].push(model);
      return acc;
    }, {});
  }, [registry.models]);

  async function handleCreateProvider() {
    if (!providerDraft.label.trim() || !providerDraft.base_url.trim()) {
      toast.error(t("provider.missingProviderFields"));
      return;
    }

    setSavingProvider(true);
    try {
      const nextRegistry = await invoke<ProviderRegistryPublic>("save_provider", {
        provider: {
          id: providerDraft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          label: providerDraft.label.trim(),
          protocol: providerDraft.protocol,
          base_url: providerDraft.base_url.trim(),
          api_key: providerApiKey.trim(),
          wire_api: providerDraft.protocol === "openai" ? providerDraft.wire_api?.trim() || "responses" : null,
        },
      });
      setRegistry(nextRegistry);
      setProviderDraft(EMPTY_PROVIDER);
      setProviderApiKey("");
      toast.success(t("provider.addedProvider"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleCreateModel() {
    if (!modelDraft.label.trim() || !modelDraft.provider_id || !modelDraft.model_name.trim()) {
      toast.error(t("provider.missingModelFields"));
      return;
    }

    setSavingModel(true);
    try {
      const nextRegistry = await invoke<ProviderRegistryPublic>("save_model", {
        model: {
          id: modelDraft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          label: modelDraft.label.trim(),
          provider_id: modelDraft.provider_id,
          model_name: modelDraft.model_name.trim(),
        },
      });
      setRegistry(nextRegistry);
      setModelDraft(EMPTY_MODEL);
      toast.success(t("provider.addedModel"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingModel(false);
    }
  }

  async function handleDeleteProvider(id: string) {
    try {
      await invoke("delete_provider", { providerId: id });
      await refreshState();
      toast.success(t("provider.removedProvider"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleDeleteModel(id: string) {
    try {
      await invoke("delete_model", { modelId: id });
      await refreshState();
      toast.success(t("provider.removedModel"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleSaveApiKey(providerId: string) {
    try {
      const nextRegistry = await invoke<ProviderRegistryPublic>("set_provider_api_key", {
        providerId,
        apiKey: apiKeyInput.trim(),
      });
      setRegistry(nextRegistry);
      setEditingApiKey(null);
      setApiKeyInput("");
      toast.success(t("provider.savedApiKey"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-muted">{t("provider.loading")}</div>;
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h2 className="font-display text-xl font-medium text-text-primary">{t("provider.title")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-text-secondary">{t("provider.description")}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">{t("provider.newProvider")}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={t("provider.label")}
              value={providerDraft.label}
              onChange={(e) => setProviderDraft((prev) => ({ ...prev, label: e.target.value }))}
            />
            <Select
              value={providerDraft.protocol}
              onChange={(value) =>
                setProviderDraft((prev) => ({
                  ...prev,
                  protocol: value as ProviderProtocol,
                  wire_api: value === "openai" ? prev.wire_api ?? "responses" : null,
                }))
              }
              options={[
                { value: "openai", label: t("provider.providerProtocolOpenAI") },
                { value: "anthropic", label: t("provider.providerProtocolAnthropic") },
              ]}
            />
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm md:col-span-2"
              placeholder={t("provider.baseUrl")}
              value={providerDraft.base_url}
              onChange={(e) => setProviderDraft((prev) => ({ ...prev, base_url: e.target.value }))}
            />
            <input
              type="password"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm md:col-span-2"
              placeholder={t("provider.apiKeyPlaceholder")}
              value={providerApiKey}
              onChange={(e) => setProviderApiKey(e.target.value)}
            />
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={providerDraft.protocol === "openai" ? t("provider.wireApiPlaceholder") : t("provider.protocolNotesPlaceholder")}
              value={providerDraft.wire_api ?? ""}
              onChange={(e) => setProviderDraft((prev) => ({ ...prev, wire_api: e.target.value }))}
              disabled={providerDraft.protocol !== "openai"}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-text-muted">
            <span>{t("provider.providerHint")}</span>
            <button
              className="rounded-full bg-christi px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleCreateProvider()}
              disabled={savingProvider}
            >
              {savingProvider ? t("common.saving") : t("provider.saveProvider")}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">{t("provider.newModel")}</h3>
          <div className="flex flex-col gap-3">
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={t("provider.label")}
              value={modelDraft.label}
              onChange={(e) => setModelDraft((prev) => ({ ...prev, label: e.target.value }))}
            />
            <Select
              value={modelDraft.provider_id}
              onChange={(value) => setModelDraft((prev) => ({ ...prev, provider_id: value }))}
              placeholder={t("provider.selectProvider")}
              options={registry.providers.map((provider) => ({ value: provider.id, label: provider.label }))}
            />
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={t("provider.modelName")}
              value={modelDraft.model_name}
              onChange={(e) => setModelDraft((prev) => ({ ...prev, model_name: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-text-muted">
            <span>{t("provider.modelHint")}</span>
            <button
              className="rounded-full bg-christi px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleCreateModel()}
              disabled={savingModel || registry.providers.length === 0}
            >
              {savingModel ? t("common.saving") : t("provider.saveModel")}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{t("provider.registryTitle")}</h3>
          <span className="text-xs text-text-muted">
            {t("provider.registryCount", { providers: registry.providers.length, models: registry.models.length })}
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {registry.providers.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h4 className="text-base font-semibold text-text-primary">{provider.label}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="rounded-full bg-surface px-2 py-1 font-medium uppercase tracking-wide">
                      {provider.protocol}
                    </span>
                    <span>{provider.base_url}</span>
                    {provider.api_key_set ? (
                      <span className="rounded-full bg-leaf/10 px-2 py-1 text-leaf">{provider.api_key_masked}</span>
                    ) : (
                      <span className="rounded-full bg-coral/10 px-2 py-1 text-coral">{t("provider.apiKeyNotSet")}</span>
                    )}
                    {provider.wire_api ? <span>{provider.wire_api}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-christi/30 hover:text-christi"
                    onClick={() => {
                      setEditingApiKey(provider.id);
                      setApiKeyInput("");
                    }}
                  >
                    {provider.api_key_set ? t("provider.editApiKey") : t("provider.setApiKey")}
                  </button>
                  <button
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-coral/30 hover:text-coral"
                    onClick={() => void handleDeleteProvider(provider.id)}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>

              {editingApiKey === provider.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="password"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    placeholder={t("provider.apiKeyPlaceholder")}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveApiKey(provider.id); if (e.key === "Escape") setEditingApiKey(null); }}
                    autoFocus
                  />
                  <button
                    className="rounded-full bg-christi px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => void handleSaveApiKey(provider.id)}
                    disabled={!apiKeyInput.trim()}
                  >
                    {t("common.save")}
                  </button>
                  <button
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:text-text-primary"
                    onClick={() => setEditingApiKey(null)}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(modelsByProvider[provider.id] ?? []).map((model) => (
                  <div key={model.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{model.label}</div>
                        <div className="mt-1 text-xs font-mono text-text-muted">{model.model_name}</div>
                      </div>
                      <button
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition hover:border-coral/30 hover:text-coral"
                        onClick={() => void handleDeleteModel(model.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))}
                {(modelsByProvider[provider.id] ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface p-3 text-sm text-text-muted">
                    {t("provider.noModels")}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {registry.providers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background p-5 text-sm text-text-muted">
              {t("provider.emptyState")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
