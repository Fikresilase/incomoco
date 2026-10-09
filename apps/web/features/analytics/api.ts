import { apiFetch, type AnalyticsSummary, type GapReport } from "@/lib/api";

export const analyticsKeys = {
  summary: (days: number) => ["admin", "analytics", "summary", days] as const,
  gaps: ["admin", "analytics", "gaps"] as const,
};

export const getSummary = (days: number) =>
  apiFetch<AnalyticsSummary>("/admin/analytics/summary", { query: { days } });

export const getGaps = () => apiFetch<GapReport>("/admin/analytics/gaps");

export const refreshGaps = () =>
  apiFetch<GapReport>("/admin/analytics/gaps/refresh", { method: "POST" });
