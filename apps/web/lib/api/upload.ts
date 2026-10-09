import { ApiError, NetworkError, apiUrl } from "./client";

export interface UploadHandle<T> {
  promise: Promise<T>;
  abort: () => void;
}

/**
 * Multipart upload with progress (fetch has no upload progress events, so this uses XHR).
 * Always sends cookies (`withCredentials`).
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", apiUrl(path));
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const text = xhr.responseText;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((text ? JSON.parse(text) : undefined) as T);
        } catch {
          resolve(undefined as T);
        }
        return;
      }
      let detail = xhr.statusText || `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(text) as { detail?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
      } catch {
        if (text) detail = text;
      }
      reject(new ApiError(xhr.status, detail));
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
