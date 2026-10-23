import { Languages } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";

const names: Record<string, Record<Locale, string>> = {
  am: { am: "አማርኛ", en: "Amharic", om: "Afaan Amaaraa", so: "Af-Amxaari" },
  en: { am: "እንግሊዝኛ", en: "English", om: "Afaan Ingilizii", so: "Ingiriisi" },
  om: { am: "ኦሮምኛ", en: "Afaan Oromo", om: "Afaan Oromoo", so: "Af-Oromo" },
  so: { am: "ሶማሊኛ", en: "Somali", om: "Afaan Somaalee", so: "Af-Soomaali" },
};

const copy: Record<Locale, (language: string) => string> = {
  am: (language) => `ይህ ይዘት በ${language} ነው፤ በመረጡት ቋንቋ ያለው ስሪት እስካሁን አልተገኘም።`,
  en: (language) => `This content is in ${language}. A version in your selected language is not available yet.`,
  om: (language) => `Qabiyyeen kun ${language} dha. Qabiyyeen afaan ati filatte amma hin jiru.`,
  so: (language) => `Qoraalkan wuxuu ku qoran yahay ${language}. Nooca luqadda aad dooratay weli lama hayo.`,
};

export function ContentLanguageNotice({ contentLanguage, selectedLanguage }: { contentLanguage: string; selectedLanguage: Locale }) {
  if (!contentLanguage || contentLanguage === selectedLanguage) return null;
  const language = names[contentLanguage]?.[selectedLanguage] ?? contentLanguage;
  return (
    <p className="flex items-start gap-1.5 border-l border-warning/70 py-1 pl-2.5 text-xs leading-5 text-text-secondary" role="status">
      <Languages className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-hidden />
      <span>{copy[selectedLanguage](language)}</span>
    </p>
  );
}

const businessCopy: Record<Locale, string> = {
  am: "አንዳንድ የንግድ መረጃ በተመዘገበበት ቋንቋ ሊታይ ይችላል። ትርጉም ካልተጨመረ እንደተመዘገበው ይታያል።",
  en: "Some business details may appear in the language they were recorded. When a translation is not available, the original text is shown.",
  om: "Odeeffannoon daldalaa tokko tokko afaan itti galmaa'een mul'achuu danda'a. Yoo hiikni hin jirre, akkuma galmaa'etti mul'ata.",
  so: "Faahfaahinta ganacsiga qaarkeed waxay ku muuqan kartaa luqaddii lagu diiwaangeliyey. Haddii turjumaad jirin, qoraalkii asalka ahaa ayaa la tusayaa.",
};

export function StoredBusinessTextNote({ language }: { language: Locale }) {
  return <p className="flex items-start gap-1.5 text-xs leading-5 text-text-secondary" role="note"><Languages className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-hidden /><span>{businessCopy[language]}</span></p>;
}
