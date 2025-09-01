// src/lib/api.ts
// In dev, Vite proxies `/api` → http://127.0.0.1:8000
// In prod (same-origin), FastAPI serves `/api` alongside the SPA.
// Therefore, let VITE_API_BASE point to the API root (default '/api'),
// and append endpoint-specific paths (e.g., '/poem').

const base = ((import.meta as any).env?.VITE_API_BASE ?? '/api').replace(/\/$/, '');

export type PoemRequest = {
  tone: string;
  timezone: string;   // e.g., "America/Chicago"
  format: '12h' | '24h';
  forceNew?: boolean;
};

export type PoemResponse = {
  poem: string;
  model: string | null;
  generated_at_iso: string;
  time_used: string;
  tone: string;
  cached: boolean;
  status: 'ok' | 'fallback';
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  request_id: string;
  timezone: string;
  // optional telemetry may exist server-side but is not required here
};

export async function getPoem(body: PoemRequest): Promise<PoemResponse> {
  const url = `${base}/poem`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceNew: true, ...body }),
  });

  if (!res.ok) {
    // Try to surface a helpful error message
    let msg = `${res.status} ${res.statusText}`;
    try {
      const t = await res.text();
      msg = t || msg;
    } catch {}
    throw new Error(`ChronoVerse API error: ${msg}`);
  }

  return res.json();
}