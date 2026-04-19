import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "es", label: "Espanol" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "pt-BR", label: "Portugues (BR)" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
] as const;

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const activeLanguage = LANGUAGES.find((language) => language.code === i18n.language) ?? LANGUAGES[0];

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
      <span className="text-[0.65rem] uppercase tracking-wider text-text-muted">{t("sidebar.language")}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="mr-1 flex min-w-[8.25rem] items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-xs font-semibold text-text-primary shadow-sm transition hover:border-coral/30 hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-coral/20"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Languages className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="truncate">{activeLanguage.label}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="z-50 max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-1 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {t("sidebar.language")}
            </div>
            {LANGUAGES.map((language) => {
              const isActive = language.code === i18n.language;
              return (
                <DropdownMenu.Item
                  key={language.code}
                  onSelect={() => void i18n.changeLanguage(language.code)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition ${
                    isActive
                      ? "bg-coral/10 text-coral"
                      : "text-text-primary hover:bg-background focus:bg-background"
                  }`}
                >
                  <span className="truncate">{language.label}</span>
                  {isActive ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
