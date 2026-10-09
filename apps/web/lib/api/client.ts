import { API_BASE } from "@/lib/env";

/** Error thrown for any non-2xx response. `detail` comes from `{ "detail": string }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Network failure (offline, CORS, server down). */
export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serialized unless it is FormData/Blob. */
  body?: unknown;
  query?: Query;
}

export function apiUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
      if (Array.isArray(parsed.detail)) {
        // FastAPI validation errors: [{ msg, loc }]
        return parsed.detail
          .map((d: { msg?: string }) => d?.msg)
          .filter(Boolean)
          .join("; ");
      }
      return text;
    } catch {
      return text;
    }
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** Low-level request: returns the raw Response after checking status. */
export async function apiRequest(
  path: string,
  { body, query, headers, ...init }: RequestOptions = {}
): Promise<Response> {
  const isRaw =
    body instanceof FormData || body instanceof Blob || body === undefined;
  let res: Response;
  try {
    res = await fetch(apiUrl(path, query), {
      ...init,
      credentials: "include",
      headers: {
        ...(isRaw ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: isRaw ? (body as BodyInit | undefined) : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  return res;
}

/** JSON request. Resolves to `undefined` for 204 / empty bodies. */
export async function apiFetch<T>(
  path: string,
  options?: RequestOptions
): Promise<T> {
  const res = await apiRequest(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Binary request (e.g. audio/wav). */
export async function apiBlob(
  path: string,
  options?: RequestOptions
): Promise<Blob> {
  const res = await apiRequest(path, options);
  return res.blob();
}

export function isApiError(err: unknown, status?: number): err is ApiError {
  return err instanceof ApiError && (status === undefined || err.status === status);
}
