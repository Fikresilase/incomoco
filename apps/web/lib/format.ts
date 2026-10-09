import { NetworkError, isApiError } from "@/lib/api";

function intlLocale(locale: string) {
  return locale === "am" ? "am-ET" : "en-US";
}

export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatShortDate(isoOrDay: string, locale: string): string {
  // "YYYY-MM-DD" is parsed as UTC midnight; format in UTC to keep the same day.
  const date = new Date(isoOrDay.length === 10 ? `${isoOrDay}T00:00:00Z` : isoOrDay);
  if (Number.isNaN(date.getTime())) return isoOrDay;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    timeZone: isoOrDay.length === 10 ? "UTC" : undefined,
  }).format(date);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatPercent(value: number | null, locale: string): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMs(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s` : `${Math.round(value)} ms`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Pick a user-facing message: API `detail` if present, otherwise a translated fallback. */
export function errorMessage(
  error: unknown,
  fallback: string,
  networkFallback?: string
): string {
  if (error instanceof NetworkError) return networkFallback ?? fallback;
  if (isApiError(error) && error.detail) return error.detail;
  return fallback;
}
