"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/config";

const OPTIONS: { value: Locale; label: string; lang: string }[] = [
  { value: "en", label: "EN", lang: "en" },
  { value: "am", label: "አማ", lang: "am" },
];

/** EN/አማ segmented toggle. The choice is remembered per browser. */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations("common");
  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "inline-flex h-8 items-center rounded-full border border-border bg-background p-0.5",
        className
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === locale;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            lang={option.lang}
            onClick={() => setLocale(option.value)}
            className={cn(
              "h-full min-w-10 rounded-full px-2.5 text-xs font-bold transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-secondary hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
