import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

type GatewayVirtualModel = {
  id: string;
  label: string;
  target_model_id: string;
};

type GatewayOverview = {
  enabled: boolean;
  openai_base_url: string;
  anthropic_base_url: string;
  default_virtual_model_id: string;
  virtual_models: GatewayVirtualModel[];
};

export default function GatewayGuide() {
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    invoke<GatewayOverview>("get_gateway_overview")
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);

  if (!overview) {
    return <div className="text-sm text-text-muted">{t("gatewayGuide.loading")}</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{t("gatewayGuide.title")}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t("gatewayGuide.openai")}</div>
          <div className="mt-2 break-all font-mono text-sm text-text-primary">{overview.openai_base_url}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t("gatewayGuide.anthropic")}</div>
          <div className="mt-2 break-all font-mono text-sm text-text-primary">{overview.anthropic_base_url}</div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-background p-4">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t("gatewayGuide.defaultVirtualModel")}</div>
        <div className="mt-2 text-sm text-text-primary">{overview.default_virtual_model_id}</div>
      </div>
    </div>
  );
}
