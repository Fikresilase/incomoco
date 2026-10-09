import {
  apiFetch,
  uploadWithProgress,
  type DocumentListParams,
  type DocumentListResponse,
  type KbDocument,
} from "@/lib/api";

export const documentKeys = {
  all: ["admin", "documents"] as const,
  list: (params: DocumentListParams) => ["admin", "documents", params] as const,
};

export const listDocuments = (params: DocumentListParams) =>
  apiFetch<DocumentListResponse>("/admin/documents", {
    query: { ...params },
  });

export const deleteDocument = (id: string) =>
  apiFetch<KbDocument>(`/admin/documents/${encodeURIComponent(id)}`, { method: "DELETE" });

/** `POST /admin/documents` (multipart field `file`) with upload progress. */
export function uploadDocument(file: File, onProgress: (fraction: number) => void) {
  const form = new FormData();
  form.append("file", file, file.name);
  return uploadWithProgress<KbDocument>("/admin/documents", form, onProgress);
}
