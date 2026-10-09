import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from "./config";

/** Locale for the first render, from the cookie set by the EN/አማ toggle. */
export async function getInitialLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}
