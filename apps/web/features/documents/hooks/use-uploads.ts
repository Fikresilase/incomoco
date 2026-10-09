"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError } from "@/lib/api";
import { documentKeys, uploadDocument } from "../api";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;
export const ACCEPT_ATTR = [
  ...ACCEPTED_EXTENSIONS,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
].join(",");

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error: string | null;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** Client-side validation + parallel uploads with per-file progress and mapped errors. */
export function useUploads() {
  const t = useTranslations("admin.documentsPage.errors");
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const patch = useCallback((id: string, update: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...update } : i)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const describe = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.status === 409) return t("duplicate");
        if (err.status === 413) return t("tooLarge");
        if (err.status === 415) return t("unsupported");
        return err.detail || t("failed");
      }
      if (err instanceof NetworkError) return t("failed");
      return t("failed");
    },
    [t]
  );

  const upload = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
        const base: UploadItem = {
          id,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "uploading",
          error: null,
        };
        const ext = extensionOf(file.name);
        if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
          setItems((prev) => [{ ...base, status: "error", error: t("unsupported") }, ...prev]);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setItems((prev) => [{ ...base, status: "error", error: t("tooLarge") }, ...prev]);
          continue;
        }
        setItems((prev) => [base, ...prev]);
        const handle = uploadDocument(file, (fraction) => patch(id, { progress: fraction }));
        handle.promise
          .then(() => {
            patch(id, { status: "done", progress: 1 });
            void queryClient.invalidateQueries({ queryKey: documentKeys.all });
            const timer = setTimeout(() => {
              timers.current.delete(timer);
              dismiss(id);
            }, 4000);
            timers.current.add(timer);
          })
          .catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 401) {
              window.location.replace("/admin/login?expired=1&next=/admin/documents");
              return;
            }
            patch(id, { status: "error", error: describe(err) });
          });
      }
    },
    [describe, dismiss, patch, queryClient, t]
  );

  return { items, upload, dismiss };
}
