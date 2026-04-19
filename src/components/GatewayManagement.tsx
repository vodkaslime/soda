import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import GatewayGuide from "./GatewayGuide";
import Select from "./ui/Select";

type ModelConfig = {
  id: string;
  label: string;
  provider_id: string;
  model_name: string;
};

type ProviderRegistry = {
  providers: Array<{
    id: string;
    label: string;
  }>;
  models: ModelConfig[];
};

type GatewayVirtualModel = {
  id: string;
  label: string;
  target_model_id: string;
};

type GatewayConfig = {
  enabled: boolean;
  host: string;
  port: number;
  openai_path: string;
  anthropic_path: string;
  virtual_models: GatewayVirtualModel[];
  default_virtual_model_id: string;
};

export default function GatewayManagement() {
  const [gateway, setGateway] = useState<GatewayConfig>({
    enabled: false,
    host: "127.0.0.1",
    port: 4315,
    openai_path: "/openai",
    anthropic_path: "/anthropic",
    virtual_models: [],
    default_virtual_model_id: "soda/default",
  });
  const [registry, setRegistry] = useState<ProviderRegistry>({ providers: [], models: [] });
  const [loading, setLoading] = useState(true);
  const [savingGateway, setSavingGateway] = useState(false);
  const [toggling, setToggling] = useState(false);
  const { t } = useTranslation();

  async function loadState() {
    const [providerRegistry, gatewayConfig] = await Promise.all([
      invoke<ProviderRegistry>("get_provider_registry"),
      invoke<GatewayConfig>("get_gateway_config"),
    ]);
    setRegistry(providerRegistry);
    setGateway(gatewayConfig);
  }

  useEffect(() => {
    void loadState()
      .catch((err) => {
        toast.error(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  const modelsById = useMemo(() => {
    const entries = registry.models.map((model) => [model.id, model] as const);
    return Object.fromEntries(entries);
  }, [registry.models]);

  const providersById = useMemo(() => {
    const entries = registry.providers.map((p) => [p.id, p] as const);
    return Object.fromEntries(entries);
  }, [registry.providers]);

  async function handleSaveGateway() {
    setSavingGateway(true);
    try {
      const updated = await invoke<GatewayConfig>("save_gateway_config", { gateway });
      setGateway(updated);
      toast.success(t("gateway.saveSuccess"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingGateway(false);
    }
  }

  async function handleToggleGateway() {
    setToggling(true);
    try {
      const updated = await invoke<GatewayConfig>("toggle_gateway");
      setGateway(updated);
      toast.success(updated.enabled ? t("gateway.started") : t("gateway.stopped"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-muted">{t("gateway.loading")}</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium text-text-primary font-display">{t("gateway.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">{t("gateway.description")}</p>
        </div>
        <button
          disabled={toggling}
          onClick={() => void handleToggleGateway()}
          className={`shrink-0 rounded-2xl px-6 py-3 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
            gateway.enabled
              ? "bg-coral hover:bg-coral/90"
              : "bg-leaf hover:bg-leaf/90"
          }`}
        >
          {toggling
            ? t("gateway.loading")
            : gateway.enabled
              ? t("gateway.stopGateway")
              : t("gateway.startGateway")}
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{t("gateway.coreTitle")}</h3>
            <p className="mt-1 text-sm text-text-secondary">{t("gateway.coreDescription")}</p>
          </div>
          <button
            className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void handleSaveGateway()}
            disabled={savingGateway}
          >
            {savingGateway ? t("common.saving") : t("common.save")}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">{t("gateway.host")}</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              value={gateway.host}
              onChange={(e) => setGateway((prev) => ({ ...prev, host: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">{t("gateway.port")}</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              type="number"
              value={gateway.port}
              onChange={(e) => setGateway((prev) => ({ ...prev, port: Number(e.target.value) || 4315 }))}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">{t("gateway.openaiPath")}</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              value={gateway.openai_path}
              onChange={(e) => setGateway((prev) => ({ ...prev, openai_path: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">{t("gateway.anthropicPath")}</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              value={gateway.anthropic_path}
              onChange={(e) => setGateway((prev) => ({ ...prev, anthropic_path: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{t("gateway.virtualModelsTitle")}</h3>
            <p className="mt-1 text-sm text-text-secondary">{t("gateway.virtualModelsDescription")}</p>
          </div>
          <div className="text-xs text-text-muted">{t("gateway.registeredModels", { count: registry.models.length })}</div>
        </div>

        <div className="flex flex-col gap-3">
          {gateway.virtual_models.map((virtualModel, index) => {
            const targetModel = modelsById[virtualModel.target_model_id];
            return (
              <div key={virtualModel.id} className="grid gap-3 rounded-xl border border-border bg-background p-4 md:grid-cols-[0.95fr_1fr_auto] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{virtualModel.label}</div>
                  <div className="mt-1 text-xs font-mono text-text-muted">{virtualModel.id}</div>
                </div>
                <div className="flex flex-col gap-2">
                  <Select
                    value={virtualModel.target_model_id}
                    onChange={(value) =>
                      setGateway((prev) => ({
                        ...prev,
                        virtual_models: prev.virtual_models.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, target_model_id: value } : entry,
                        ),
                      }))
                    }
                    placeholder={t("common.noTargetModelYet")}
                    options={registry.models.map((model) => {
                      const provider = providersById[model.provider_id];
                      const providerLabel = provider ? provider.label : model.provider_id;
                      return { value: model.id, label: `${providerLabel}  ·  ${model.label}` };
                    })}
                    triggerClassName="bg-surface"
                  />
                  <div className="text-xs text-text-muted">
                    {targetModel
                      ? (() => {
                          const provider = providersById[targetModel.provider_id];
                          const providerLabel = provider ? provider.label : targetModel.provider_id;
                          return t("gateway.routesToWithProvider", { label: targetModel.label, provider: providerLabel, model: targetModel.model_name });
                        })()
                      : t("gateway.unassigned")}
                  </div>
                </div>
                <button
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                    gateway.default_virtual_model_id === virtualModel.id
                      ? "border-christi/40 bg-christi/10 text-christi"
                      : "border-border text-text-secondary"
                  }`}
                  onClick={() => setGateway((prev) => ({ ...prev, default_virtual_model_id: virtualModel.id }))}
                >
                  {gateway.default_virtual_model_id === virtualModel.id ? t("common.default") : t("common.makeDefault")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <GatewayGuide />
    </div>
  );
}
