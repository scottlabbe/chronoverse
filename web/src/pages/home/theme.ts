export const VERSIONS = ["Gallery", "Manuscript", "Zen"] as const;
export type Version = typeof VERSIONS[number];

export const THEMES = ["Paper", "Stone", "Ink", "Slate", "Mist"] as const;
export type Theme = typeof THEMES[number];

export type ThemeColors = {
  background: string;
  foreground: string;
  muted: string;
  menuBg: string;
  isDark: boolean;
};

export type ThemeAtmosphere = {
  gradient: string;
  halo: string;
  accent: string;
};

export type VersionTypography = {
  fontFamily: string;
  letterSpacing: string;
  lineHeight: number;
  align: "left" | "center";
  taglineSize: string;
  bodySize: string;
  titleScale: number;
  fontWeight?: number;
};

const THEME_STORAGE_KEY = "cv:theme";
const VERSION_STORAGE_KEY = "cv:version";

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  Paper: {
    background: "#FDF6F0",
    foreground: "#262320",
    muted: "#7E7369",
    menuBg: "rgba(253, 246, 240, 0.95)",
    isDark: false,
  },
  Stone: {
    background: "#ECEFF1",
    foreground: "#1F2328",
    muted: "#66707A",
    menuBg: "rgba(236, 239, 241, 0.95)",
    isDark: false,
  },
  Ink: {
    background: "#0A0A0A",
    foreground: "#F5F5F5",
    muted: "#888888",
    menuBg: "rgba(10, 10, 10, 0.95)",
    isDark: true,
  },
  Slate: {
    background: "#131417",
    foreground: "#ECEDEE",
    muted: "#9BA1A6",
    menuBg: "rgba(19, 20, 23, 0.95)",
    isDark: true,
  },
  Mist: {
    background: "#F5F9FF",
    foreground: "#1C2733",
    muted: "#6B7C8F",
    menuBg: "rgba(245, 249, 255, 0.95)",
    isDark: false,
  },
};

export const THEME_ATMOSPHERE: Record<Theme, ThemeAtmosphere> = {
  Paper: {
    gradient:
      "radial-gradient(circle at 20% 20%, rgba(255, 220, 188, 0.55), transparent 58%), radial-gradient(circle at 78% 32%, rgba(166, 200, 255, 0.38), transparent 52%), linear-gradient(180deg, #fdf6f0 0%, #f5ede3 100%)",
    halo: "rgba(255, 255, 255, 0.6)",
    accent: "rgba(196, 150, 116, 0.85)",
  },
  Stone: {
    gradient:
      "radial-gradient(circle at 22% 24%, rgba(210, 220, 228, 0.55), transparent 58%), radial-gradient(circle at 80% 28%, rgba(180, 200, 210, 0.35), transparent 55%), linear-gradient(180deg, #eceff1 0%, #e4eaef 100%)",
    halo: "rgba(255, 255, 255, 0.55)",
    accent: "rgba(120, 140, 158, 0.9)",
  },
  Ink: {
    gradient:
      "radial-gradient(circle at 22% 22%, rgba(64, 66, 78, 0.55), transparent 58%), radial-gradient(circle at 82% 30%, rgba(36, 56, 104, 0.35), transparent 55%), linear-gradient(180deg, #0b0c10 0%, #090909 100%)",
    halo: "rgba(255, 255, 255, 0.25)",
    accent: "rgba(163, 196, 255, 0.8)",
  },
  Slate: {
    gradient:
      "radial-gradient(circle at 20% 22%, rgba(58, 69, 92, 0.5), transparent 58%), radial-gradient(circle at 82% 34%, rgba(86, 96, 128, 0.38), transparent 55%), linear-gradient(180deg, #131417 0%, #101116 100%)",
    halo: "rgba(255, 255, 255, 0.32)",
    accent: "rgba(134, 171, 255, 0.8)",
  },
  Mist: {
    gradient:
      "radial-gradient(circle at 20% 20%, rgba(188, 218, 255, 0.55), transparent 58%), radial-gradient(circle at 75% 30%, rgba(255, 215, 231, 0.35), transparent 55%), linear-gradient(180deg, #f5f9ff 0%, #edf2ff 100%)",
    halo: "rgba(255, 255, 255, 0.65)",
    accent: "rgba(150, 181, 239, 0.85)",
  },
};

export const VERSION_TYPOGRAPHY: Record<Version, VersionTypography> = {
  Gallery: {
    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    letterSpacing: "0.03em",
    lineHeight: 1.35,
    align: "center",
    taglineSize: "clamp(1.7rem, 2.6vw + 1.05rem, 2.6rem)",
    bodySize: "clamp(1.05rem, 1.4vw + 0.9rem, 1.4rem)",
    titleScale: 1.5,
  },
  Manuscript: {
    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    letterSpacing: "0.01em",
    lineHeight: 1.45,
    align: "left",
    taglineSize: "clamp(1.65rem, 2.2vw + 1.05rem, 2.4rem)",
    bodySize: "clamp(1.05rem, 1.3vw + 0.9rem, 1.35rem)",
    titleScale: 1.5,
  },
  Zen: {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    letterSpacing: "0.05em",
    lineHeight: 1.6,
    align: "center",
    taglineSize: "clamp(1.6rem, 2.4vw + 1rem, 2.3rem)",
    bodySize: "clamp(0.98rem, 1.2vw + 0.85rem, 1.25rem)",
    titleScale: 1.5,
    fontWeight: 300,
  },
};

export const getVersionFromStorage = (): Version => {
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY) as Version | null;
    return stored && (VERSIONS as readonly string[]).includes(stored)
      ? (stored as Version)
      : "Gallery";
  } catch {
    return "Gallery";
  }
};

export const setVersionInStorage = (version: Version) => {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    /* noop */
  }
};

export const getThemeFromStorage = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    return stored && (THEMES as readonly string[]).includes(stored) ? (stored as Theme) : "Paper";
  } catch {
    return "Paper";
  }
};

export const setThemeInStorage = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* noop */
  }
};
