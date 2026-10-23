import { ApiError } from "@/lib/api";

const LANGUAGE_NAMES: Record<string, string> = {
  am: "Amharic",
  en: "English",
  om: "Afaan Oromo",
  so: "Somali",
};

export function voiceFailureMessage(
  error: unknown,
  language: string,
  translate: (key: "unsupportedLanguage" | "playbackError", values?: { language: string }) => string,
) {
  if (error instanceof ApiError && error.status === 422 && /not enabled|unsupported language/i.test(error.detail)) {
    return translate("unsupportedLanguage", { language: LANGUAGE_NAMES[language] ?? "this language" });
  }
  return translate("playbackError");
}
