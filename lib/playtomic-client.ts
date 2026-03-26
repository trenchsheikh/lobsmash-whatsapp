/**
 * Playtomic Third Party API — org credentials from Playtomic Manager → Settings → Developer tools.
 * @see https://third-party.playtomic.io/endpoints/auth/
 */

const DEFAULT_BASE = "https://thirdparty.playtomic.io";

type TokenCache = { token: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

export function isPlaytomicApiConfigured(): boolean {
  return Boolean(process.env.PLAYTOMIC_CLIENT_ID && process.env.PLAYTOMIC_CLIENT_SECRET);
}

function apiBase(): string {
  return (process.env.PLAYTOMIC_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");
}

export async function getPlaytomicBearerToken(): Promise<string | null> {
  const clientId = process.env.PLAYTOMIC_CLIENT_ID;
  const secret = process.env.PLAYTOMIC_CLIENT_SECRET;
  if (!clientId || !secret) return null;

  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${apiBase()}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("playtomic oauth failed", res.status, t.slice(0, 300));
    return null;
  }

  const j = (await res.json()) as {
    token?: string;
    expires_in?: number;
  };
  if (!j.token) return null;

  const expiresInSec = typeof j.expires_in === "number" ? j.expires_in : 3600;
  tokenCache = {
    token: j.token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return j.token;
}

export async function playtomicAuthenticatedRequest(
  method: "GET" | "POST",
  path: string,
  jsonBody?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const token = await getPlaytomicBearerToken();
  if (!token) {
    return { ok: false, status: 0, text: "not configured or token failed" };
  }
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/** Optional smoke GET (e.g. set PLAYTOMIC_API_PROBE_PATH=/api/v1/venues). */
export async function playtomicProbe(): Promise<string | null> {
  const path = process.env.PLAYTOMIC_API_PROBE_PATH?.trim();
  if (!path) return null;
  const r = await playtomicAuthenticatedRequest("GET", path);
  if (!r.ok) {
    return `API probe ${path} → HTTP ${r.status}: ${r.text.slice(0, 500)}`;
  }
  return `API probe ${path} → OK (${r.text.slice(0, 800)}${r.text.length > 800 ? "…" : ""})`;
}
