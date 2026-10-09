"use client";

import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AnalyticsSummary } from "@/lib/api";
import { CHART } from "../colors";
import { ChartCard } from "./charts";

export function TopDocuments({ items }: { items: AnalyticsSummary["top_documents"] }) {
  const t = useTranslations("admin.overviewPage");
  const max = Math.max(1, ...items.map((d) => d.citations));
  return (
    <ChartCard title={t("topDocuments")} hint={t("topDocumentsHint")}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCitations")}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((doc, i) => (
            <li key={doc.document_id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs font-bold text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-secondary" title={doc.title}>
                    {doc.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {t("citations", { count: doc.citations })}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(doc.citations / max) * 100}%`, background: CHART.deepTeal }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

export function UnusedDocuments({ items }: { items: AnalyticsSummary["unused_documents"] }) {
  const t = useTranslations("admin.overviewPage");
  return (
    <ChartCard title={t("unusedDocuments")} hint={t("unusedDocumentsHint")}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          {t("allUsed")}
        </p>
      ) : (
        <ul className="scrollbar-thin -mx-2 max-h-80 overflow-y-auto">
          {items.map((doc) => (
            <li key={doc.document_id}>
              <Link
                href={`/admin/documents?q=${encodeURIComponent(doc.title)}`}
                className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-secondary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <span className="truncate">{doc.title}</span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-secondary"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
