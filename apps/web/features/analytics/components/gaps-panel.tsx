"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GapReport } from "@/lib/api";
import { errorMessage, formatDateTime } from "@/lib/format";
import { analyticsKeys, getGaps, refreshGaps } from "../api";

/** Knowledge gaps: clustered unanswered topics + recent unanswered questions. */
export function GapsPanel() {
  const t = useTranslations("admin.gaps");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const gaps = useQuery({
    queryKey: analyticsKeys.gaps,
    queryFn: getGaps,
    meta: { requiresAdmin: true },
  });

  const refresh = useMutation({
    mutationFn: refreshGaps,
    meta: { requiresAdmin: true },
    onSuccess: (report) => {
      queryClient.setQueryData<GapReport>(analyticsKeys.gaps, report);
      toast.success(t("refreshed"));
    },
    onError: (err) => toast.error(errorMessage(err, t("refreshError"))),
  });

  const report = gaps.data;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="gaps-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="gaps-title" className="text-base font-bold text-secondary">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
          {report && (
            <p className="mt-2 text-xs text-muted-foreground">
              {report.generated_at
                ? `${t("generatedAt", { date: formatDateTime(report.generated_at, locale) })} · ${t("questionsAnalyzed", { count: report.question_count })}`
                : t("neverGenerated")}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || gaps.isPending}
        >
          {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {refresh.isPending ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      <div className="mt-5">
        {gaps.isPending ? (
          <div className="grid gap-6 lg:grid-cols-2" aria-hidden>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
        ) : gaps.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <AlertCircle className="size-4" aria-hidden />
            {errorMessage(gaps.error, t("loadError"))}
            <Button variant="outline" size="xs" onClick={() => gaps.refetch()}>
              <RefreshCw />
              {tc("retry")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-bold text-secondary">{t("topics")}</h3>
              {report!.topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noTopics")}</p>
              ) : (
                <ul className="space-y-3">
                  {[...report!.topics]
                    .sort((a, b) => b.count - a.count)
                    .map((topic) => (
                      <li key={topic.topic} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-secondary">{topic.topic}</p>
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[#B8321D] tabular-nums">
                            {t("questions", { count: topic.count })}
                          </span>
                        </div>
                        {topic.examples.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {topic.examples.slice(0, 3).map((ex, i) => (
                              <li
                                key={i}
                                className="truncate border-l-2 border-border pl-2 text-xs text-muted-foreground"
                                title={ex}
                              >
                                {ex}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-bold text-secondary">{t("recentUnanswered")}</h3>
              {report!.recent_unanswered.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noneUnanswered")}</p>
              ) : (
                <ul className="scrollbar-thin max-h-[26rem] divide-y divide-border overflow-y-auto">
                  {report!.recent_unanswered.map((q, i) => (
                    <li key={`${q.created_at}-${i}`} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 w-8 shrink-0 rounded-full bg-muted py-0.5 text-center text-[11px] font-bold text-secondary uppercase">
                        {q.lang}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-secondary" lang={q.lang}>
                          {q.question}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(q.created_at, locale)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
