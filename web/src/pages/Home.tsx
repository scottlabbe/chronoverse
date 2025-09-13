import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);

  // Supabase auth wiring (read-only on this page)
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthedEmail(data?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthedEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStatus("Check your email for a magic sign-in link.");
    } catch (err: any) {
      setError(err?.message || "Could not send magic link. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubscribe() {
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      if (!res.ok) {
        setError("Subscriptions are not enabled yet.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        setError("Unable to start checkout. Please try again later.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
  }

  function handleSignOut() {
    supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen bg-background text-foreground"> 
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4 md:px-8">
        <div className="text-sm tracking-widest opacity-60">chronoverse</div>
      </header>

      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 pt-16 md:pt-20 pb-32 text-center">
        {/* Hero */}
        <h1 className="mb-8 md:mb-10 text-3xl md:text-5xl font-normal tracking-tight font-serif">ChronoVerse</h1>
        <p className="mb-12 md:mb-14 max-w-[48ch] text-pretty text-lg md:text-xl leading-relaxed text-muted-foreground">
          Living, minimalist time‑poems. Start free: 3 hours/month.
        </p>

        {/* CTAs depend on auth state */}
        <div className="mb-12 md:mb-14 flex flex-wrap items-center justify-center gap-5">
          {authedEmail ? (
            <a
              href="/app"
              className="inline-flex items-center rounded-md border border-primary bg-primary px-4 py-2.5 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Continue
            </a>
          ) : (
            <a
              href="/app"
              className="inline-flex items-center rounded-md border border-primary bg-primary px-4 py-2.5 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start free
            </a>
          )}
          <button
            type="button"
            onClick={handleSubscribe}
            className="inline-flex items-center rounded-md border border-border bg-transparent px-4 py-2 text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Subscribe
          </button>
        </div>

        {/* Auth block (compact) */}
        {!authedEmail && (
          <form onSubmit={handleSendLink} className="mt-14 md:mt-16 w-full max-w-md">
            <div className="rounded-xl border border-border p-5">
              <label htmlFor="email" className="mb-2 block text-left pl-3 text-xs tracking-wide text-muted-foreground">
                Email for magic link
              </label>
              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center rounded-md border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
                {status}
              </p>
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </div>
          </form>
        )}

        {/* Signed-in micro-copy */}
        {authedEmail && (
          <div className="mt-10 text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{authedEmail}</span>{" "}
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-2 underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign out
            </button>
          </div>
        )}

        {/* Meta note */}
        <p className="mt-14 text-xs tracking-wider text-muted-foreground">
          poems that refresh each minute
        </p>
      </main>

      <footer className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 px-4 py-4">
        <a href="/legal/terms" className="text-xs lowercase tracking-widest opacity-40 transition-opacity hover:opacity-70">
          terms
        </a>
        <a href="/legal/privacy" className="text-xs lowercase tracking-widest opacity-40 transition-opacity hover:opacity-70">
          privacy
        </a>
      </footer>
    </div>
  );
}
