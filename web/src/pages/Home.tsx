import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";

// Version & Theme definitions (match App.tsx)
const VERSIONS = ["Gallery", "Manuscript", "Zen"] as const;
type Version = typeof VERSIONS[number];

const THEMES = ["Paper", "Stone", "Ink", "Slate", "Mist"] as const;
type Theme = typeof THEMES[number];

const getVersionFromStorage = (): Version => {
  try {
    const stored = localStorage.getItem("cv:version") as Version;
    return VERSIONS.includes(stored) ? stored : "Gallery";
  } catch {
    return "Gallery";
  }
};
const setVersionInStorage = (v: Version) => { try { localStorage.setItem("cv:version", v); } catch {} };

const getThemeFromStorage = (): Theme => {
  try {
    const stored = localStorage.getItem("cv:theme") as Theme;
    return THEMES.includes(stored) ? stored : "Paper";
  } catch {
    return "Paper";
  }
};
const setThemeInStorage = (t: Theme) => { try { localStorage.setItem("cv:theme", t); } catch {} };

const getThemeColors = (theme: Theme) => {
  switch (theme) {
    case "Paper": return { background: "#FDF6F0", foreground: "#262320", muted: "#7E7369", menuBg: "rgba(253, 246, 240, 0.95)" } as const;
    case "Stone": return { background: "#ECEFF1", foreground: "#1F2328", muted: "#66707A", menuBg: "rgba(236, 239, 241, 0.95)" } as const;
    case "Ink":   return { background: "#0A0A0A", foreground: "#F5F5F5", muted: "#888888", menuBg: "rgba(10, 10, 10, 0.95)" } as const;
    case "Slate": return { background: "#131417", foreground: "#ECEDEE", muted: "#9BA1A6", menuBg: "rgba(19, 20, 23, 0.95)" } as const;
    case "Mist":  return { background: "#F5F9FF", foreground: "#1C2733", muted: "#6B7C8F", menuBg: "rgba(245, 249, 255, 0.95)" } as const;
  }
};

const getVersionStyles = (version: Version, theme: Theme) => {
  const isDark = theme === "Ink" || theme === "Slate";
  switch (version) {
    case "Gallery":
      return {
        fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
        letterSpacing: isDark ? "0.04em" : "0.03em",
        lineHeight: 1.618,
        align: "center" as const,
        titleSize: "text-4xl md:text-5xl",
        blurbSize: "text-lg md:text-xl",
      };
    case "Manuscript":
      return {
        fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
        letterSpacing: "0.01em",
        lineHeight: 1.75,
        align: "left" as const,
        titleSize: "text-3xl md:text-4xl",
        blurbSize: "text-base md:text-lg",
      };
    case "Zen":
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        letterSpacing: "0.05em",
        lineHeight: 2,
        align: "center" as const,
        titleSize: "text-3xl md:text-4xl",
        blurbSize: "text-base md:text-lg",
        fontWeight: 300,
      };
  }
};

// --- Sampler data (static examples) ---
const SAMPLE_POEMS: Array<{ id: string; lines: string[]; vibe: "Whimsical"|"Noir"|"Minimal"|"Wistful"|"Cosmic" }> = [
  { id:"h1", vibe:"Whimsical", lines:["At 12:22, the sun slips a denim string through the clouds, midday humming, whiskers of light tickle the grass, birds grin, mischief in their wings."] },
  { id:"n1", vibe:"Noir",  lines:["The morning fog clung to the street as the clock sneaked to 9:55, a cigarette glow in a rain-wet alley."] },
  { id:"m1", vibe:"Minimal", lines:["The clock lunges noonward, shrugs, and in 1:51 the afternoon snaps a spark and runs."] },
  { id:"w1", vibe:"Wistful", lines:["Evening dims the street; a bicycle hisses past at 8:27, lilac glow slipping into the window."] },
  { id:"c1", vibe:"Cosmic", lines:["Morning yawns as suns align; at 10:41, a marigold comet seeds the sky. Space-time hums, and I ride the pulse."] },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(!!mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function useRotator(len: number, ms = 5000){
  const [i, setI] = useState(0);
  const hover = useRef(false);
  const focus = useRef(false);
  useEffect(() => {
    let t: number | undefined;
    const tick = () => {
      if (!document.hidden && !hover.current && !focus.current) {
        setI((x) => (x + 1) % len);
      }
      t = window.setTimeout(tick, ms);
    };
    t = window.setTimeout(tick, ms);
    return () => { if (t) clearTimeout(t); };
  }, [len, ms]);
  return { i, hover, focus } as const;
}

function PoemSampler({ version, theme }:{version: Version; theme: Theme}){
  const { fontFamily, lineHeight, letterSpacing, blurbSize, align } = getVersionStyles(version, theme);
  const colors = getThemeColors(theme);
  const reduced = usePrefersReducedMotion();
  const { i, hover, focus } = useRotator(SAMPLE_POEMS.length, 7000);
  const s = SAMPLE_POEMS[i];

  return (
    <div
      className="mx-auto w-full max-w-xl select-none"
      aria-label="Poem sampler"
      onMouseEnter={() => { hover.current = true; }}
      onMouseLeave={() => { hover.current = false; }}
      onFocus={() => { focus.current = true; }}
      onBlur={() => { focus.current = false; }}
      tabIndex={0}
    >
      <div
        key={s.id}
        className="rounded-xl px-8 py-6 sampler-fade"
        style={{
          background: theme==="Ink"||theme==="Slate" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
          border: theme==="Ink"||theme==="Slate" ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
          animation: reduced ? 'none' : undefined,
        }}
      >
        <div
          className="mb-1 uppercase opacity-60"
          style={{ color: colors.muted, textAlign: align, fontSize: 10, letterSpacing: '0.2em' }}
        >
          {s.vibe}
        </div>
        <div
          className={`${blurbSize} whitespace-pre-line`}
          style={{ fontFamily, lineHeight, letterSpacing, color: colors.foreground, textAlign: align }}
        >
          {s.lines.join("\n")}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);

  // Version/Theme state
  const [version, setVersion] = useState<Version>(getVersionFromStorage());
  const [theme, setTheme] = useState<Theme>(getThemeFromStorage());

  // Corner menus
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const versionBtnRef = useRef<HTMLButtonElement>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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

  // Sync theme to CSS variables
  useEffect(() => {
    const colors = getThemeColors(theme);
    const root = document.documentElement;
    try {
      root.style.setProperty("--background", colors.background);
      root.style.setProperty("--foreground", colors.foreground);
    } catch {}
  }, [theme]);

  // Close menus on outside click / Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        isVersionMenuOpen &&
        versionMenuRef.current &&
        !versionMenuRef.current.contains(e.target as Node) &&
        !versionBtnRef.current?.contains(e.target as Node)
      ) {
        setIsVersionMenuOpen(false);
      }
      if (
        isThemeMenuOpen &&
        themeMenuRef.current &&
        !themeMenuRef.current.contains(e.target as Node) &&
        !themeBtnRef.current?.contains(e.target as Node)
      ) {
        setIsThemeMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsVersionMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isVersionMenuOpen, isThemeMenuOpen]);

  // Focus management: when a menu opens, focus first item; trap Tab within the open menu
  useEffect(() => {
    const focusFirst = (menu: HTMLDivElement | null) => {
      const first = menu?.querySelector('button');
      (first as HTMLButtonElement | null)?.focus?.();
    };
    if (isVersionMenuOpen) focusFirst(versionMenuRef.current);
    if (isThemeMenuOpen) focusFirst(themeMenuRef.current);

    const onKeyDown = (e: KeyboardEvent) => {
      const menu = isVersionMenuOpen ? versionMenuRef.current : isThemeMenuOpen ? themeMenuRef.current : null;
      if (!menu) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        const items = Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[];
        if (!items.length) return;
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.shiftKey) {
          const next = currentIndex <= 0 ? items[items.length - 1] : items[currentIndex - 1];
          next?.focus();
        } else {
          const next = currentIndex < 0 || currentIndex === items.length - 1 ? items[0] : items[currentIndex + 1];
          next?.focus();
        }
      } else if (e.key === 'Escape') {
        setIsVersionMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isVersionMenuOpen, isThemeMenuOpen]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/app`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
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

  const colors = getThemeColors(theme);
  const vs = getVersionStyles(version, theme);

  return (
    <div className="min-h-svh bg-background text-foreground relative">
      {/* Top-left: version */}
      <div className="fixed top-8 left-8">
        <div className="relative">
          <button
            ref={versionBtnRef}
            onClick={() => setIsVersionMenuOpen((v) => !v)}
            className="transition-all duration-700 ease-out opacity-30 hover:opacity-60 text-xs tracking-wider lowercase"
            aria-expanded={isVersionMenuOpen}
            aria-haspopup="true"
            style={{ color: colors.muted }}
          >
            {version.toLowerCase()}
          </button>
          {isVersionMenuOpen && (
            <div
              ref={versionMenuRef}
              className="absolute top-full left-0 mt-4 backdrop-blur-sm p-1"
              style={{ backgroundColor: colors.menuBg }}
              role="menu"
            >
              <div className="flex flex-col space-y-1">
                {VERSIONS.map((v) => (
                  <button
                    key={v}
                    onClick={() => { setVersion(v); setVersionInStorage(v); setIsVersionMenuOpen(false); }}
                    className={`text-xs tracking-wider lowercase text-left py-1 transition-opacity ${v === version ? 'opacity-100' : 'opacity-60 hover:opacity-90'}`}
                    role="menuitem"
                  >
                    {v.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top-right: theme */}
      <div className="fixed top-8 right-8">
        <div className="relative">
          <button
            ref={themeBtnRef}
            onClick={() => setIsThemeMenuOpen((v) => !v)}
            className="transition-all duration-700 ease-out opacity-30 hover:opacity-60 text-xs tracking-wider lowercase"
            aria-expanded={isThemeMenuOpen}
            aria-haspopup="true"
            style={{ color: colors.muted }}
          >
            {theme.toLowerCase()}
          </button>
          {isThemeMenuOpen && (
            <div
              ref={themeMenuRef}
              className="absolute top-full right-0 mt-4 backdrop-blur-sm p-1"
              style={{ backgroundColor: colors.menuBg }}
              role="menu"
            >
              <div className="flex flex-col space-y-1">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTheme(t); setThemeInStorage(t); setIsThemeMenuOpen(false); }}
                    className={`text-xs tracking-wider lowercase text-right py-1 transition-opacity ${t === theme ? 'opacity-100' : 'opacity-60 hover:opacity-90'}`}
                    role="menuitem"
                  >
                    {t.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right: legal */}
      <div className="fixed bottom-8 right-8 flex items-center gap-6">
        <a href="/legal/terms" className="text-xs lowercase tracking-widest opacity-40 transition-opacity hover:opacity-70">terms</a>
        <a href="/legal/privacy" className="text-xs lowercase tracking-widest opacity-40 transition-opacity hover:opacity-70">privacy</a>
      </div>

      {/* Bottom-left: sign out (when authed) */}
      {authedEmail && (
        <div className="fixed bottom-8 left-8">
          <button
            onClick={handleSignOut}
            className="transition-all duration-700 ease-out opacity-30 hover:opacity-60 text-xs tracking-wider lowercase"
            style={{ color: colors.muted }}
          >
            sign out
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 pt-20 pb-32">
        {/* Hero */}
        <div className="mb-8 md:mb-10 w-full" style={{ textAlign: vs.align }}>
          <h1
            className={`text-balance ${vs.titleSize} font-normal`}
            style={{ fontFamily: vs.fontFamily as string, letterSpacing: vs.letterSpacing as string, lineHeight: vs.lineHeight as number, ...(vs as any).fontWeight ? { fontWeight: (vs as any).fontWeight } : {}, color: colors.foreground }}
          >
            ChronoVerse
          </h1>
          <p
            className={`mt-4 mx-auto max-w-xl ${vs.blurbSize}`}
            style={{ fontFamily: vs.fontFamily as string, lineHeight: vs.lineHeight as number, letterSpacing: vs.letterSpacing as string, textAlign: vs.align, color: colors.foreground }}
          >
            Every minute, a poem.
          </p>
          <p
            className={`mt-4 mx-auto max-w-xl ${vs.blurbSize}`}
            style={{ fontFamily: vs.fontFamily as string, lineHeight: vs.lineHeight as number, letterSpacing: vs.letterSpacing as string, textAlign: vs.align, color: colors.muted }}
          >
            AI-generated poem clock—fresh short verse at the turn of every minute. Calm, surprising, shareable.
          </p>
          <p className="mt-4 text-xs opacity-80" style={{ textAlign: vs.align, color: colors.foreground }}>
            Free trial: 3 hours of active use (no card). · $3/month · cancel anytime
          </p>
          <p className="mt-2 mb-4 text-xs opacity-70" style={{ textAlign: vs.align, color: colors.muted, lineHeight: 1.6 }}>
            Time only accrues while the app is open and visible; background tabs pause automatically.
          </p>
        </div>

        {/* CTAs depend on auth state */}
        <div className="mb-12 md:mb-14 mt-4 flex flex-wrap items-center justify-center gap-5">
          <Button asChild>
            <a href="/app">{authedEmail ? "Continue" : "Start free"}</a>
          </Button>
          <Button variant="outline" className="text-muted-foreground" type="button" onClick={handleSubscribe}>
            Subscribe
          </Button>
        </div>

        {/* Sampler showcase with eyebrow and more space */}
        <div className="w-full home-spacer-md">
          <div className="text-center mb-4">
            <h2 className="uppercase text-xs tracking-widest" style={{ color: colors.muted }}>A Glimpse</h2>
          </div>
          <PoemSampler version={version} theme={theme} />
        </div>

        {/* Auth block (lightweight) */}
        {!authedEmail && (
          <form onSubmit={handleSendLink} className="w-full max-w-sm home-spacer-lg">
            <div className="text-center mb-4">
              <h2 className="uppercase text-xs tracking-widest" style={{ color: colors.muted }}>Get a magic link</h2>
            </div>
            <label htmlFor="email" className="mb-2 block text-left pl-1 text-xs tracking-wide" style={{ color: colors.muted }}>
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
                className="min-w-0 flex-1 rounded-md border px-3 py-2.5 text-sm outline-none focus-visible:ring-2"
                style={{ backgroundColor: "var(--input-background)" }}
              />
              <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send"}</Button>
            </div>
            {status && (
              <p role="status" aria-live="polite" className="mt-2 text-xs" style={{ color: colors.muted }}>
                {status}
              </p>
            )}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </form>
        )}

        {/* Signed-in micro-copy */}
        {authedEmail && (
          <div className="mt-10 text-sm" style={{ color: colors.muted }}>
            Signed in as <span style={{ color: colors.foreground }}>{authedEmail}</span>
          </div>
        )}
      </main>
    </div>
  );
}
