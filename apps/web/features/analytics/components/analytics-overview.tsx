"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/format";
import { analyticsKeys, getSummary } from "../api";
import { SERIES } from "../colors";
import { ChartCard, SplitBars, StackedBarChart, TimeLineChart } from "./charts";
import { TopDocuments, UnusedDocuments } from "./document-lists";
import { GapsPanel } from "./gaps-panel";
import { KpiGrid, KpiGridSkeleton } from "./kpi-cards";

const RANGES = [7, 30, 90] as const;

export function AnalyticsOverview() {
  const t = useTranslations("admin.overviewPage");
  const tc = useTranslations("common");
  const [days, setDays] = useState<number>(30);

  const summary = useQuery({
    queryKey: analyticsKeys.summary(days),
    queryFn: () => getSummary(days),
    placeholderData: keepPreviousData,
    meta: { requiresAdmin: true },
  });

  const data = summary.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ToggleGroup
          type="single"
          value={String(days)}
          onValueChange={(v) => v && setDays(Number(v))}
          aria-label={t("range")}
          variant="outline"
          className="rounded-full bg-background"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem
              key={r}
              value={String(r)}
              className="px-3.5 text-xs font-bold data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
            >
              {t("days", { days: r })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {summary.isPending ? (
        <div className="space-y-6" aria-busy="true">
          <span className="sr-only">{tc("loading")}</span>
          <KpiGridSkeleton />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : summary.isError && !data ? (
        <div role="alert" className="rounded-xl border border-border bg-card p-8 text-center">
          <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden />
          <p className="font-semibold text-secondary">
            {errorMessage(summary.error, t("loadError"), tc("networkError"))}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => summary.refetch()}>
            {tc("retry")}
          </Button>
        </div>
      ) : data ? (
        <div
          className="space-y-6 transition-opacity"
          style={{ opacity: summary.isPlaceholderData ? 0.6 : 1 }}
          aria-busy={summary.isFetching}
        >
          <KpiGrid kpis={data.kpis} />

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t("usageTitle")}>
              <TimeLineChart
                data={data.timeseries}
                series={[
                  { key: "conversations", label: t("conversations"), color: SERIES.conversations },
                  { key: "messages", label: t("messages"), color: SERIES.messages },
                ]}
              />
            </ChartCard>
            <ChartCard title={t("feedbackTitle")}>
              <StackedBarChart
                data={data.feedback_timeseries}
                series={[
                  { key: "positive", label: t("positive"), color: SERIES.positive },
                  { key: "negative", label: t("negative"), color: SERIES.negative },
                ]}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title={t("languagesTitle")}>
              <SplitBars
                items={[
                  { key: "en", label: t("english"), value: data.languages.en, color: SERIES.en },
                  { key: "am", label: t("amharic"), value: data.languages.am, color: SERIES.am },
                ]}
              />
            </ChartCard>
            <ChartCard title={t("modalitiesTitle")}>
              <SplitBars
                items={[
                  { key: "text", label: t("text"), value: data.modalities.text, color: SERIES.text },
                  {
                    key: "dictation",
                    label: t("dictation"),
                    value: data.modalities.dictation,
                    color: SERIES.dictation,
                  },
                  { key: "voice", label: t("voice"), value: data.modalities.voice, color: SERIES.voice },
                ]}
              />
            </ChartCard>
          </div>

          <GapsPanel />

          <div className="grid gap-4 lg:grid-cols-2">
            <TopDocuments items={data.top_documents} />
            <UnusedDocuments items={data.unused_documents} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
