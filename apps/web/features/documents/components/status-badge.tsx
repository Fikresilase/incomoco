"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocumentStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STYLES: Record<DocumentStatus, { className: string; Icon: typeof Clock; spin?: boolean }> = {
  queued: { className: "bg-muted text-secondary", Icon: Clock },
  processing: { className: "bg-info/15 text-violet", Icon: Loader2, spin: true },
  ready: { className: "bg-success/10 text-success", Icon: CheckCircle2 },
  failed: { className: "bg-destructive/10 text-destructive", Icon: AlertCircle },
  deleting: { className: "bg-muted text-muted-foreground", Icon: Loader2, spin: true },
  deleted: { className: "bg-muted text-muted-foreground", Icon: Trash2 },
};

/** Status pill (icon + label, never color alone). Failed documents show the error on hover/focus. */
export function StatusBadge({ status, error }: { status: DocumentStatus; error: string | null }) {
  const t = useTranslations("admin.documentsPage");
  const { className, Icon, spin } = STYLES[status];
  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        className
      )}
    >
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );

  if (status !== "failed" || !error) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label={`${t("status.failed")}. ${t("errorDetails")}: ${error}`}
        >
          {pill}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">{error}</TooltipContent>
    </Tooltip>
  );
}
