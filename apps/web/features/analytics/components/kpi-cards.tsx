"use client";

import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsKpis } from "@/lib/api";
import { formatMs, formatNumber, formatPercent } from "@/lib/format";

interface Kpi {
  label: string;
  value: string | null;
  detail?: string;
}

function KpiCard({ label, value, detail }: Kpi) {
  const t = useTranslations("admin.overviewPage.kpi");
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-xs font-semibold text-muted-foreground sm:text-sm">{label}</p>
      <p className="mt-1.5 text-2xl leading-8 font-bold text-secondary tabular-nums sm:text-[1.75rem]">
        {value ?? t("na")}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{detail}</p>}
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: AnalyticsKpis }) {
  const t = useTranslations("admin.overviewPage.kpi");
  const locale = useLocale();
  const na = t("na");

  const usage: Kpi[] = [
    { label: t("conversations"), value: formatNumber(kpis.conversations, locale) },
    { label: t("messages"), value: formatNumber(kpis.messages, locale) },
    { label: t("uniqueSessions"), value: formatNumber(kpis.unique_sessions, locale) },
    { label: t("documentsReady"), value: formatNumber(kpis.documents_ready, locale) },
  ];
  const quality: Kpi[] = [
    { label: t("positiveFeedback"), value: formatPercent(kpis.feedback_positive_rate, locale) },
    { label: t("noAnswerRate"), value: formatPercent(kpis.no_answer_rate, locale) },
    { label: t("lowConfidenceRate"), value: formatPercent(kpis.low_confidence_rate, locale) },
    { label: t("errorRate"), value: formatPercent(kpis.error_rate, locale) },
    {
      label: t("firstToken"),
      value: formatMs(kpis.p95_first_token_ms),
      detail: t("firstTokenDetail", {
        p50: formatMs(kpis.p50_first_token_ms) ?? na,
        p95: formatMs(kpis.p95_first_token_ms) ?? na,
      }),
    },
    { label: t("voiceTurn"), value: formatMs(kpis.p95_voice_turn_ms) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {usage.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {quality.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
    </div>
  );
}

export function KpiGridSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
