"use client";

import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import am from "@/messages/am.json";
import en from "@/messages/en.json";
import {
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  isLocale,
  type Locale,
} from "./config";

const MESSAGES = { en, am } as const;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function persist(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage disabled */
  }
}

/**
 * Cookie/localStorage-based locale (no URL prefix). The server reads the cookie for
 * the first paint; switching is instant on the client (both catalogs are bundled).
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    persist(next);
    setLocaleState(next);
  }, []);

  // If the cookie was cleared but localStorage remembers a choice, restore it.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* storage disabled */
    }
    if (isLocale(stored) && stored !== initialLocale) {
      const frame = requestAnimationFrame(() => setLocale(stored));
      return () => cancelAnimationFrame(frame);
    }
  }, [initialLocale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSwitch(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocaleSwitch must be used inside I18nProvider");
  return ctx;
}
