/** Public origin of the FastAPI service as seen from the browser. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

/** REST base: every endpoint in docs/api-contract.md lives under /api/v1. */
export const API_BASE = `${API_URL}/api/v1`;

/** WebSocket base derived from the HTTP origin (http→ws, https→wss). */
export const WS_BASE = API_BASE.replace(/^http/, "ws");
