"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Search, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocumentListResponse, DocumentStatus, KbDocument } from "@/lib/api";
import { errorMessage, formatBytes, formatDateTime, formatNumber } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { documentKeys, deleteDocument, listDocuments } from "../api";
import { StatusBadge } from "./status-badge";
import { UploadDropzone } from "./upload-dropzone";

const PAGE_SIZE = 20;
const STATUSES: DocumentStatus[] = ["queued", "processing", "ready", "failed", "deleting", "deleted"];
const ACTIVE: DocumentStatus[] = ["queued", "processing", "deleting"];

function fileType(doc: KbDocument): string {
  const dot = doc.filename.lastIndexOf(".");
  if (dot !== -1) return doc.filename.slice(dot + 1).toUpperCase();
  return doc.mime.split("/").pop()?.toUpperCase() ?? "—";
}

export function DocumentsManager() {
  const t = useTranslations("admin.documentsPage");
  const tc = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<KbDocument | null>(null);
  const q = useDebouncedValue(search.trim(), 300);

  const params = {
    q: q || undefined,
    status: status === "all" ? undefined : status,
    page,
    page_size: PAGE_SIZE,
  };

  const docs = useQuery({
    queryKey: documentKeys.list(params),
    queryFn: () => listDocuments(params),
    placeholderData: keepPreviousData,
    meta: { requiresAdmin: true },
    // Auto-poll every 3 s while anything is still being processed or deleted.
    refetchInterval: (query) =>
      query.state.data?.items.some((d) => ACTIVE.includes(d.status)) ? 3000 : false,
  });

  const remove = useMutation({
    mutationFn: (doc: KbDocument) => deleteDocument(doc.id),
    meta: { requiresAdmin: true },
    onSuccess: (updated, doc) => {
      queryClient.setQueryData<DocumentListResponse>(documentKeys.list(params), (prev) =>
        prev
          ? { ...prev, items: prev.items.map((d) => (d.id === doc.id ? { ...d, ...updated } : d)) }
          : prev
      );
      void queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(t("deleteStarted", { title: doc.title || doc.filename }));
    },
    onError: (err) => toast.error(errorMessage(err, t("deleteError"))),
  });

  const total = docs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(q) || status !== "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <UploadDropzone />

      <section className="rounded-xl border border-border bg-card" aria-labelledby="docs-table-title">
        <h2 id="docs-table-title" className="sr-only">
          {t("title")}
        </h2>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-10 rounded-full pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as DocumentStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-full sm:w-48" aria-label={t("statusFilter")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {docs.isPending ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <span className="sr-only">{tc("loading")}</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : docs.isError && !docs.data ? (
          <div role="alert" className="p-8 text-center">
            <AlertCircle className="mx-auto mb-2 size-6 text-destructive" aria-hidden />
            <p className="font-semibold text-secondary">
              {errorMessage(docs.error, t("loadError"), tc("networkError"))}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => docs.refetch()}>
              {tc("retry")}
            </Button>
          </div>
        ) : docs.data.items.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto mb-3 size-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">{filtered ? t("noResults") : t("empty")}</p>
          </div>
        ) : (
          <>
            <Table aria-busy={docs.isFetching}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t("columns.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("columns.type")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("columns.size")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("columns.language")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("columns.chunks")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("columns.uploaded")}</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.data.items.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-[16rem] pl-4 sm:max-w-sm">
                      <p className="truncate font-semibold text-secondary" title={doc.title}>
                        {doc.title || doc.filename}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={doc.filename}>
                        {doc.filename}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-secondary">
                        {fileType(doc)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                      {formatBytes(doc.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {doc.lang ? t(`lang.${doc.lang}`) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} error={doc.error} />
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {doc.status === "ready" ? formatNumber(doc.chunk_count, locale) : "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {formatDateTime(doc.uploaded_at, locale)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setToDelete(doc)}
                            disabled={doc.status === "deleting" || doc.status === "deleted"}
                            aria-label={`${t("delete")}: ${doc.title || doc.filename}`}
                          >
                            <Trash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("delete")}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground tabular-nums">
                {t("showing", { from, to, total })}
              </span>
              <div className="flex items-center gap-2">
                <span className="hidden text-muted-foreground sm:inline">
                  {t("pageOf", { page, pages })}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label={t("previous")}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  aria-label={t("next")}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteTitle", { title: toDelete?.title || toDelete?.filename || "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete)}
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
