"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

const SUGGESTION_KEYS = ["s1", "s2", "s3", "s4"] as const;

/** Greeting + suggested questions shown on a new chat. */
export function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("chat");
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
          <span aria-hidden className="mb-5 block h-1 w-10 rounded-full bg-brand-primary" />
          <h1 className="text-2xl leading-tight font-bold text-secondary sm:text-3xl">
            {t("greetingTitle")}
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">{t("greetingBody")}</p>
        </div>
        <h2 className="sr-only">{t("suggestionsLabel")}</h2>
        <ul className="divide-y divide-border-soft border-y border-border-soft sm:max-w-2xl">
          {SUGGESTION_KEYS.map((key, i) => {
            const text = t(`suggestions.${key}`);
            return (
              <li
                key={key}
                className="animate-in fill-mode-both duration-500 fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${100 + i * 60}ms` }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(text)}
                  className="group flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-sm leading-6 font-medium text-secondary transition-colors hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
                >
                  <span>{text}</span>
                  <ArrowUpRight
                    className="mt-0.5 size-4 shrink-0 text-text-secondary transition-colors group-hover:text-brand-primary"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
