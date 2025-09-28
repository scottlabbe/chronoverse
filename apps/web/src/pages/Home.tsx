import React, { useEffect, useMemo, useState, type CSSProperties } from "react";

import { PoemSampler } from "../components/home/PoemSampler";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  THEME_ATMOSPHERE,
  THEME_COLORS,
  VERSION_TYPOGRAPHY,
  getThemeFromStorage,
  type Theme,
  type Version,
  type VersionTypography,
} from "./home/theme";
import { supabase } from "../lib/supabase";

const HERO_POINTS: Array<{ title: string; description: string }> = [
  {
    title: "Poetry in the Present Tense",
    description:
      "Each passing minute reveals a new, unique verse, transforming time into a gentle stream of inspiration.",
  },
  {
    title: "Fresh lines every sixty seconds",
    description:
      "Your screen becomes a living page. With a new stanza generated in real time, inspiration is always in motion.",
  },
  {
    title: "Shareable quiet moments",
    description:
      "Capture a verse that resonates and share it as a beautifully designed digital postcard.",
  },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);

  const version: Version = "Gallery";
  const [theme] = useState<Theme>(getThemeFromStorage);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthedEmail(data?.user?.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthedEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const colors = THEME_COLORS[theme];
    const root = document.documentElement;
    root.style.setProperty("--background", colors.background);
    root.style.setProperty("--foreground", colors.foreground);
  }, [theme]);

  const themeColors = THEME_COLORS[theme];
  const atmosphere = THEME_ATMOSPHERE[theme];
  const typography = useMemo<VersionTypography>(() => {
    const base = VERSION_TYPOGRAPHY[version];
    if (version === "Gallery" && themeColors.isDark) {
      return { ...base, letterSpacing: "0.04em" };
    }
    return base;
  }, [themeColors.isDark, version]);

  const heroStyle = useMemo<CSSProperties>(() => ({
    backgroundColor: themeColors.background,
    backgroundImage: atmosphere.gradient,
    backgroundSize: "200% 200%, 200% 200%, 100% 100%",
    backgroundPosition: "20% 20%, 80% 30%, center",
    color: themeColors.foreground,
    "--home-foreground": themeColors.foreground,
    "--home-muted": themeColors.muted,
    "--home-accent": atmosphere.accent,
    "--home-halo": atmosphere.halo,
    "--home-font-family": typography.fontFamily,
    "--home-letter-spacing": typography.letterSpacing,
    "--home-line-height": typography.lineHeight.toString(),
    "--home-title-weight": String(typography.fontWeight ?? 400),
    "--home-tagline-size": typography.taglineSize,
    "--home-body-size": typography.bodySize,
    "--home-title-scale": typography.titleScale.toString(),
    "--home-card-surface": themeColors.isDark
      ? "rgba(255, 255, 255, 0.05)"
      : "rgba(0, 0, 0, 0.04)",
    "--home-card-border": themeColors.isDark
      ? "rgba(255, 255, 255, 0.12)"
      : "rgba(0, 0, 0, 0.08)",
    "--home-glyph-shadow": themeColors.isDark
      ? "rgba(255, 255, 255, 0.12)"
      : "rgba(0, 0, 0, 0.08)",
    "--home-menu-bg": themeColors.menuBg,
  }), [atmosphere, themeColors, typography]);

  const alignClass = typography.align === "center" ? "is-center" : "is-left";
  const primaryCtaLabel = authedEmail ? "Continue in The Present Verse" : "Start free";

  async function handleSendLink(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/app`;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (authError) throw authError;
      setStatus("Check your inbox for a magic link to The Present Verse.");
      setEmail("");
    } catch (err: any) {
      setError(err?.message ?? "Could not send magic link. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubscribe() {
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      if (!response.ok) {
        setError("Subscriptions are not enabled yet.");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url as string;
        return;
      }
      setError("Unable to start checkout. Please try again later.");
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <>
      <a className="home-skip-link" href="#present-verse-main">
        Skip to main content
      </a>
      <div className={`home-landing ${alignClass}`} style={heroStyle}>
        <div aria-hidden className="home-halo" />

        <header className="home-shell home-header">
          <span aria-hidden className="home-mark">
            The Present Verse
          </span>
          <div className="home-utility">
            <div className="home-utility-links">
              <a href="/legal/terms">Terms</a>
              <span aria-hidden>•</span>
              <a href="/legal/privacy">Privacy</a>
            </div>
          </div>
        </header>

        <main className="home-shell home-main" id="present-verse-main">
          <section className={`home-hero-cluster ${alignClass}`}>
            <header className={`home-hero-heading ${alignClass}`}>
              <h1 className="home-hero-title text-balance">
                The Present Verse
              </h1>
              <h2 className="home-hero-tagline text-balance">
                Let every minute bloom into verse.
              </h2>
              <p className="home-hero-description">
                The Present Verse keeps time with language—opening a new stanza at every
                turn of the clock so you can pause, breathe, and share gentle
                insight with the people you care about most.
              </p>
            </header>

            <section
              className={`home-sampler-section ${alignClass}`}
              aria-label="Poem sampler"
            >
              <div className="home-sampler-heading">
                <h2>Discover your cadence</h2>
                <p>
                  Browse a rotating reel of sample poems inspired by The Present Verse
                  themes. Pause on your favorite vibe or let the verses drift on
                  their own.
                </p>
              </div>
              <PoemSampler colors={themeColors} typography={typography} />
            </section>

            <ul className={`home-value-list ${alignClass}`}>
              {HERO_POINTS.map((point) => (
                <li key={point.title} className="home-hero-point">
                  <div>
                    <p className="home-hero-point-title">{point.title.toLowerCase()}</p>
                    <p className="home-hero-point-copy">{point.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className={`home-cta ${alignClass}`}>
              <div className="home-cta-buttons">
                <Button asChild size="lg" className="home-cta-primary">
                  <a href="/app">{primaryCtaLabel}</a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  type="button"
                  className="home-cta-secondary"
                  onClick={handleSubscribe}
                >
                  Subscribe
                </Button>
              </div>
              {!authedEmail ? (
                <form
                  onSubmit={handleSendLink}
                  className="home-email-form"
                  aria-label="Get started with a magic link"
                >
                  <label className="sr-only" htmlFor="email">
                    Email address
                  </label>
                  <div className="home-email-input">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      disabled={sending}
                    />
                    <Button
                      type="submit"
                      size="lg"
                      className="home-email-submit"
                      disabled={sending}
                    >
                      {sending ? "Sending…" : "Email link to begin"}
                    </Button>
                  </div>
                  <p className="home-email-meta">
                    Free to explore for three hours—only $3/month after. Cancel
                    anytime.
                  </p>
                  {status && (
                    <p className="home-email-status" role="status" aria-live="polite">
                      {status}
                    </p>
                  )}
                  {error && <p className="home-email-error">{error}</p>}
                </form>
              ) : (
                <p className="home-cta-note">
                  Signed in as <span>{authedEmail}</span>
                </p>
              )}
            </div>
          </section>

        </main>
      </div>
    </>
  );
}
