import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Languages, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "./ThemeProvider";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsModal({ open, onOpenChange }: Props) {
  const { i18n, t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const activeLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) ?? LANGUAGES[0];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <Dialog.Title className="text-base font-medium text-text-primary">
              {t("settings.title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 pt-5 pb-6 flex flex-col gap-5">
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Languages className="w-4 h-4 text-text-muted" />
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("settings.language")}</span>
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-text-primary shadow-sm transition hover:border-coral/30 hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-coral/20 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Languages className="w-4 h-4 shrink-0 text-text-muted" />
                      <span>{activeLanguage.label}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    className="z-[60] max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
                  >
                    {LANGUAGES.map((lang) => {
                      const isActive = lang.code === i18n.language;
                      return (
                        <DropdownMenu.Item
                          key={lang.code}
                          onSelect={() => void i18n.changeLanguage(lang.code)}
                          className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm outline-none transition ${
                            isActive
                              ? "bg-coral/10 text-coral"
                              : "text-text-primary hover:bg-background focus:bg-background"
                          }`}
                        >
                          <span className="truncate">{lang.label}</span>
                          {isActive ? <Check className="h-4 w-4 shrink-0 ml-2" /> : null}
                        </DropdownMenu.Item>
                      );
                    })}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3">
                {theme === "light" ? (
                  <Sun className="w-4 h-4 text-text-muted" />
                ) : (
                  <Moon className="w-4 h-4 text-text-muted" />
                )}
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("settings.theme")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { if (theme !== "light") toggleTheme(); }}
                  className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-all duration-150 cursor-pointer ${
                    theme === "light"
                      ? "border-coral/40 bg-coral/10 text-coral font-medium"
                      : "border-border bg-background text-text-primary hover:border-christi/30"
                  }`}
                >
                  <Sun className="w-4 h-4 shrink-0" />
                  <span>{t("settings.lightMode")}</span>
                  {theme === "light" ? <Check className="h-3.5 w-3.5 shrink-0 ml-auto" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => { if (theme !== "dark") toggleTheme(); }}
                  className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-all duration-150 cursor-pointer ${
                    theme === "dark"
                      ? "border-coral/40 bg-coral/10 text-coral font-medium"
                      : "border-border bg-background text-text-primary hover:border-christi/30"
                  }`}
                >
                  <Moon className="w-4 h-4 shrink-0" />
                  <span>{t("settings.darkMode")}</span>
                  {theme === "dark" ? <Check className="h-3.5 w-3.5 shrink-0 ml-auto" /> : null}
                </button>
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
