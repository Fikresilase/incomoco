"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Source } from "@/lib/api";
import { cn } from "@/lib/utils";

function usePageLabel() {
  const t = useTranslations("chat");
  return (source: Source) => {
    const { page_start: start, page_end: end } = source;
    if (start === null) return null;
    if (end !== null && end !== start) return t("pages", { start, end });
    return t("page", { page: start });
  };
}

function SourceDetails({ source }: { source: Source }) {
  const t = useTranslations("chat");
  const pageLabel = usePageLabel()(source);
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
          {source.index}
        </span>
        <div className="min-w-0">
          <p className="text-sm leading-5 font-bold text-secondary">{source.title}</p>
          {source.breadcrumb && (
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
              {source.breadcrumb}
            </p>
          )}
        </div>
      </div>
      {source.snippet && (
        <blockquote className="border-l-2 border-primary pl-3 text-sm leading-6 text-foreground">
          {source.snippet}
        </blockquote>
      )}
      {pageLabel && (
        <p className="text-xs font-semibold text-muted-foreground">
          <span className="sr-only">{t("sourceN", { n: source.index })} · </span>
          {pageLabel}
        </p>
      )}
    </div>
  );
}

/** Inline `[n]` citation marker rendered as a small badge; opens the source snippet. */
export function CitationBadge({ n, source }: { n: number; source?: Source }) {
  const t = useTranslations("chat");
  const badge =
    "mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-full px-1 align-middle text-[11px] leading-none font-bold";
  if (!source) {
    return <span className={cn(badge, "bg-muted text-muted-foreground")}>{n}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("sourceN", { n })}: ${source.title}`}
          className={cn(
            badge,
            "bg-secondary/10 text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none data-[state=open]:bg-secondary data-[state=open]:text-secondary-foreground"
          )}
        >
          {n}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="start">
        <SourceDetails source={source} />
      </PopoverContent>
    </Popover>
  );
}

/** Source chips under an answer: title, breadcrumb, page; click for the snippet. */
export function SourceChips({ sources }: { sources: Source[] }) {
  const t = useTranslations("chat");
  const pageLabel = usePageLabel();
  if (sources.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {t("sources")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source) => {
          const page = pageLabel(source);
          return (
            <li key={`${source.index}-${source.document_id}`} className="max-w-full">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="group flex max-w-[18rem] items-center gap-2 rounded-full border border-border bg-background py-1 pr-3 pl-1 text-left transition-colors hover:border-secondary/30 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none data-[state=open]:border-secondary/40 data-[state=open]:bg-muted"
                  >
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                      {source.index}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 truncate text-xs leading-4 font-semibold text-secondary">
                        <FileText className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{source.title}</span>
                      </span>
                      <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                        {[source.breadcrumb, page].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="start">
                  <SourceDetails source={source} />
                </PopoverContent>
              </Popover>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
