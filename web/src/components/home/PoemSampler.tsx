import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { SAMPLE_POEMS } from "../../pages/home/content";
import type { ThemeColors, VersionTypography } from "../../pages/home/theme";

const getSamplerSurface = (colors: ThemeColors) => {
  const background = colors.isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)";
  const border = colors.isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)";
  return { background, border };
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
};

const useRotator = (length: number, intervalMs = 7000) => {
  const [index, setIndex] = useState(0);
  const hover = useRef(false);
  const focus = useRef(false);

  useEffect(() => {
    let timer: number | undefined;

    const tick = () => {
      if (!document.hidden && !hover.current && !focus.current) {
        setIndex((value) => (value + 1) % length);
      }
      timer = window.setTimeout(tick, intervalMs);
    };

    timer = window.setTimeout(tick, intervalMs);
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [intervalMs, length]);

  return { index, setIndex, hover, focus } as const;
};

export type PoemSamplerProps = {
  colors: ThemeColors;
  typography: VersionTypography;
};

export const PoemSampler: React.FC<PoemSamplerProps> = ({ colors, typography }) => {
  const reducedMotion = usePrefersReducedMotion();
  const { index, setIndex, hover, focus } = useRotator(SAMPLE_POEMS.length);
  const poem = SAMPLE_POEMS[index];
  const surface = getSamplerSurface(colors);
  const alignClass = typography.align === "center" ? "is-center" : "is-left";

  const samplerVars = {
    "--sampler-foreground": colors.foreground,
    "--sampler-muted": colors.muted,
    "--sampler-font-family": typography.fontFamily,
    "--sampler-letter-spacing": typography.letterSpacing,
    "--sampler-line-height": String(typography.lineHeight),
    "--sampler-body-size": typography.bodySize,
    "--sampler-surface": surface.background,
    "--sampler-border": surface.border,
  } as CSSProperties;

  return (
    <div
      aria-label="Poem sampler"
      className={`home-sampler mx-auto w-full max-w-2xl select-none ${alignClass}`}
      onMouseEnter={() => {
        hover.current = true;
      }}
      onMouseLeave={() => {
        hover.current = false;
      }}
      onFocus={() => {
        focus.current = true;
      }}
      onBlur={() => {
        focus.current = false;
      }}
      style={samplerVars}
      tabIndex={0}
    >
      <div className={`home-sampler-card sampler-fade ${reducedMotion ? "sampler-no-motion" : ""}`} key={poem.id}>
        <div className="home-sampler-eyebrow" aria-hidden>
          {poem.vibe}
        </div>
        <p className="home-sampler-text">
          {poem.lines.join("\n")}
        </p>
      </div>
      <div aria-label="Select a poem style" className="home-sampler-dots" role="group">
        {SAMPLE_POEMS.map((item, idx) => {
          const active = index === idx;
          return (
            <button
              aria-label={`Show ${item.vibe.toLowerCase()} sample`}
              aria-pressed={active}
              className={`home-sampler-dot ${active ? "is-active" : ""}`}
              key={item.id}
              onClick={() => setIndex(idx)}
              type="button"
            />
          );
        })}
      </div>
    </div>
  );
};

export default PoemSampler;
