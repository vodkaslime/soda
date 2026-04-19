import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ptBR from "./locales/pt-BR.json";
import zhCN from "./locales/zh-CN.json";

const resources = {
  en: {
    translation: en,
  },
  "zh-CN": {
    translation: zhCN,
  },
  es: {
    translation: es,
  },
  fr: {
    translation: fr,
  },
  de: {
    translation: de,
  },
  ja: {
    translation: ja,
  },
  ko: {
    translation: ko,
  },
  "pt-BR": {
    translation: ptBR,
  },
  ar: {
    translation: ar,
  },
  hi: {
    translation: hi,
  },
} as const;

const supportedLanguages = ["en", "zh-CN", "es", "fr", "de", "ja", "ko", "pt-BR", "ar", "hi"] as const;
const savedLanguage = localStorage.getItem("soda-language");
const browserLanguage = navigator.language.toLowerCase();
const matchedBrowserLanguage = supportedLanguages.find((language) => browserLanguage === language.toLowerCase() || browserLanguage.startsWith(`${language.toLowerCase()}-`));
const initialLanguage = savedLanguage && supportedLanguages.includes(savedLanguage as (typeof supportedLanguages)[number])
  ? savedLanguage
  : matchedBrowserLanguage ?? (browserLanguage.startsWith("zh") ? "zh-CN" : "en");

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem("soda-language", language);
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.language;

export default i18n;
