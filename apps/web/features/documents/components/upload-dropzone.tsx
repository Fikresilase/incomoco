"use client";

import { AlertCircle, CheckCircle2, FileUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, useUploads } from "../hooks/use-uploads";

/** Drag-and-drop + click upload with per-file progress and errors. */
export function UploadDropzone() {
  const t = useTranslations("admin.documentsPage");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { items, upload, dismiss } = useUploads();

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <span
          className={cn(
            "mb-3 flex size-11 items-center justify-center rounded-full transition-colors",
            dragging ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}
          aria-hidden
        >
          <FileUp className="size-5" />
        </span>
        <p className="font-semibold text-secondary">{t("dropTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("dropOr")}</p>
        <Button className="mt-3" onClick={() => inputRef.current?.click()}>
          {t("browse")}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">{t("accepted")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("browse")}
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 animate-in fade-in slide-in-from-top-1"
            >
              {item.status === "error" ? (
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              ) : item.status === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-secondary">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {item.status === "uploading"
                      ? `${Math.round(item.progress * 100)}%`
                      : formatBytes(item.size)}
                  </span>
                </div>
                {item.status === "uploading" && (
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${t("uploading")} ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.progress * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.max(2, item.progress * 100)}%` }}
                    />
                  </div>
                )}
                {item.status === "error" && (
                  <p className="mt-0.5 text-xs text-destructive">{item.error}</p>
                )}
                {item.status === "done" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("uploaded")}</p>
                )}
              </div>
              {item.status !== "uploading" && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => dismiss(item.id)}
                  aria-label={`${t("dismiss")}: ${item.name}`}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
