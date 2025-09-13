// src/lib/api.ts
// In dev, Vite proxies `/api` → http://127.0.0.1:8000
// In prod (same-origin), FastAPI serves `/api` alongside the SPA.
// Therefore, let VITE_API_BASE point to the API root (default '/api'),
// and append endpoint-specific paths (e.g., '/poem').

import { supabase } from "./supabase";

const base = ((import.meta as any).env?.VITE_API_BASE ?? '/api').replace(/\/$/, '');

async function apiFetch(path: string, init: RequestInit = {}) {
  const auth = await authHeader();
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
    ...auth,
  } as Record<string, string>;
  return fetch(`${base}${path}`, { ...init, headers });
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type CheckoutResponse = { url: string };
export type MeResponse = { userId?: string; email?: string; subscribed: boolean };

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
  const res = await apiFetch('/poem', {
    method: 'POST',
    body: JSON.stringify({ forceNew: true, ...body }),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { msg = (await res.text()) || msg; } catch {}
    throw new Error(`ChronoVerse API error: ${msg}`);
  }
  return res.json();
}

export async function createCheckout(): Promise<CheckoutResponse> {
  const res = await apiFetch('/billing/checkout', { method: 'POST' });
  return res.json();
}
export async function me(): Promise<MeResponse> {
  const res = await apiFetch('/me', { method: 'GET' });
  return res.json();
}
