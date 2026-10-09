import type { ReactNode } from "react";
import { I18nProvider } from "./provider";
import { getInitialLocale } from "./server";

/** Server component: reads the locale cookie, then hands off to the client provider. */
export async function IntlRoot({ children }: { children: ReactNode }) {
  const locale = await getInitialLocale();
  return <I18nProvider initialLocale={locale}>{children}</I18nProvider>;
}
