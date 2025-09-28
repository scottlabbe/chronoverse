import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { getPoem, createCheckout, me, getBillingPortal, verifyCheckout } from './lib/api';
import { supabase } from './lib/supabase';
import { Button } from './components/ui/button';
import ControlsRail from './components/ControlsRail';
import FeedbackDialog from './components/FeedbackDialog';
import SharePoemDialog from './components/SharePoemDialog';

// Utilities
const detectTimeFormat = (): '12h' | '24h' => {
  const testDate = new Date('2023-01-01 13:00:00');
  const formatted = testDate.toLocaleTimeString();
  return formatted.includes('PM') || formatted.includes('AM') ? '12h' : '24h';
};

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!target) return false;
  const element = target as HTMLElement;
  if (typeof element.tagName !== 'string') return false;
  if (element.isContentEditable) return true;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'textarea') {
    const textarea = element as HTMLTextAreaElement;
    return !textarea.readOnly && !textarea.disabled;
  }

  if (tagName === 'input') {
    const input = element as HTMLInputElement;
    if (input.readOnly || input.disabled) return false;
    const type = input.type || 'text';
    return TEXT_INPUT_TYPES.has(type);
  }

  return false;
};

const getToneFromStorage = (): string => {
  try {
    const stored = localStorage.getItem('pv:tone') || 'Wistful';
    // Ensure stored tone is one of the supported options
    if (!TONES.includes(stored)) {
      try { localStorage.setItem('pv:tone', 'Wistful'); } catch {}
      return 'Wistful';
    }
    return stored;
  } catch {
    return 'Wistful';
  }
};

const setToneInStorage = (tone: string): void => {
  try {
    localStorage.setItem('pv:tone', tone);
  } catch {
    // Silent fail
  }
};
const TONES = ['Whimsical', 'Wistful', 'Funny', 'Noir', 'Minimal', 'Cosmic', 'Nature', 'Romantic', 'Spooky'];
const VERSIONS = ['Gallery', 'Manuscript', 'Zen'] as const;
const THEMES = ['Paper', 'Stone', 'Ink', 'Slate', 'Mist'] as const;
const SHARE_STYLES = ['classic', 'polaroid'] as const;
type Version = typeof VERSIONS[number];
type Theme = typeof THEMES[number];
type ShareStyle = typeof SHARE_STYLES[number];

type ShareSnapshot = {
  poem: string;
  tone: string;
  version: Version;
  theme: Theme;
  colors: {
    background: string;
    foreground: string;
    muted: string;
  };
  font: Partial<CSSProperties>;
};

const getVersionFromStorage = (): Version => {
  try {
    const stored = localStorage.getItem('pv:version') as Version;
    return VERSIONS.includes(stored) ? stored : 'Gallery';
  } catch {
    return 'Gallery';
  }
};

const setVersionInStorage = (version: Version): void => {
  try {
    localStorage.setItem('pv:version', version);
  } catch {
    // Silent fail
  }
};

const getThemeFromStorage = (): Theme => {
  try {
    const stored = localStorage.getItem('pv:theme') as Theme;
    return THEMES.includes(stored) ? stored : 'Paper';
  } catch {
    return 'Paper';
  }
};

const setThemeInStorage = (theme: Theme): void => {
  try {
    localStorage.setItem('pv:theme', theme);
  } catch {
    // Silent fail
  }
};

const getShareStyleFromStorage = (): ShareStyle => {
  try {
    const stored = localStorage.getItem('pv:share-style');
    return SHARE_STYLES.includes(stored as ShareStyle) ? (stored as ShareStyle) : 'classic';
  } catch {
    return 'classic';
  }
};

const setShareStyleInStorage = (style: ShareStyle): void => {
  try {
    localStorage.setItem('pv:share-style', style);
  } catch {
    // Silent fail
  }
};

// --- Auto-refresh storage helpers ---
const getAutoFromStorage = (): boolean => {
  try {
    const v = localStorage.getItem('pv:auto');
    if (v === null) return true; // default ON
    return v === '1';
  } catch {
    return true;
  }
};


const setAutoInStorage = (on: boolean): void => {
  try {
    localStorage.setItem('pv:auto', on ? '1' : '0');
  } catch {
    // Silent fail
  }
};

// Ensure each line doesn't orphan its last word: join the final two words with NBSP
const applyWidowGuard = (text: string): string => {
  return text.split('\n').map((line) => {
    const trimmed = line.replace(/\s+$/, '');
    const words = trimmed.split(' ');
    if (words.length >= 3) {
      const last = words.pop()!;
      const secondLast = words.pop()!;
      return [...words, `${secondLast}\u00A0${last}`].join(' ');
    }
    return trimmed;
  }).join('\n');
};

export default function App() {
  const [poem, setPoem] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentTone, setCurrentTone] = useState(getToneFromStorage());
  const [currentVersion, setCurrentVersion] = useState<Version>(getVersionFromStorage());
  const [currentTheme, setCurrentTheme] = useState<Theme>(getThemeFromStorage());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(getAutoFromStorage());
  const [showFeedback, setShowFeedback] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSnapshot, setShareSnapshot] = useState<ShareSnapshot | null>(null);
  const [shareStyle, setShareStyle] = useState<ShareStyle>(getShareStyleFromStorage());
  const tickTimeoutRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<boolean>(false);
  const [upgradeInfo, setUpgradeInfo] = useState<{ needed: boolean; used?: number; limit?: number }>({ needed: false });
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const versionButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const poemRef = useRef<HTMLDivElement>(null); // transition wrapper
  const poemElRef = useRef<HTMLDivElement>(null); // actual poem element
  const containerRef = useRef<HTMLDivElement>(null); // inner app container
  const poemContainerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null); // optional preview viewport wrapper

  // Device preview (simulated viewport) and simulated presentation
  const [previewDims, setPreviewDims] = useState<{w: number; h: number; name: string} | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [simulatePresentation, setSimulatePresentation] = useState<boolean>(false);

  // --- Presentation mode state & Wake Lock ---
  const [isPresenting, setIsPresenting] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // --- Minute tick scheduler (default ON, pauses when hidden) ---
  const JITTER_MIN_MS = 250;
  const JITTER_MAX_MS = 500;

  const clearTick = () => {
    if (tickTimeoutRef.current !== undefined) {
      clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = undefined;
    }
  };

  const msToNextMinute = () => {
    const now = Date.now();
    const base = 60000 - (now % 60000);
    return base === 60000 ? 0 : base; // if exactly on boundary
  };

  const jitterMs = () => JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));

  const scheduleNextTick = () => {
    clearTick();
    const delay = msToNextMinute() + jitterMs();
    tickTimeoutRef.current = window.setTimeout(doTick, delay);
  };

  const doTick = async () => {
    if (document.hidden || !autoRefresh) {
      scheduleNextTick();
      return;
    }
    if (inFlightRef.current) {
      scheduleNextTick();
      return;
    }
    inFlightRef.current = true;
    try {
      setIsTransitioning(true);
      // Use cache for the current minute; do not force bypass
      await loadPoem(currentTone, false);
    } finally {
      inFlightRef.current = false;
      scheduleNextTick();
    }
  };

  // Fetch poem from backend
  const loadPoem = async (tone: string, forceNew: boolean = false) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const format = detectTimeFormat();
    try {
      const res = await getPoem({ tone, timezone, format, forceNew });
      setPoem(applyWidowGuard(res.poem));
      setUpgradeInfo({ needed: false });
    } catch (err: any) {
      const status = err?.status;
      const detail = err?.detail;
      if (status === 402 && detail && detail.reason === 'free_limit_reached') {
        setUpgradeInfo({ needed: true, used: detail.minutesUsed, limit: detail.limit });
      } else {
        setUpgradeInfo({ needed: false });
      }
      setPoem(applyWidowGuard('Time moves in mysterious ways...'));
    } finally {
      setIsLoading(false);
      setIsTransitioning(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadPoem(currentTone);
  }, []);

  // If returning from Stripe Checkout, verify and refresh subscription state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    if (!sid) return;
    (async () => {
      try { await verifyCheckout(sid); } catch {}
      try {
        const m = await me();
        setIsSubscribed(!!m?.subscribed);
        setUpgradeInfo({ needed: false });
      } catch {}
      // Remove session_id from the URL to keep things clean
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('session_id');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    })();
  }, []);

  // Query subscription status for showing Manage Billing
  useEffect(() => {
    me().then((m) => setIsSubscribed(!!m?.subscribed)).catch(() => setIsSubscribed(false));
  }, []);

  const handleUpgrade = async () => {
    try {
      const { url } = await createCheckout();
      if (url) window.location.href = url;
    } catch {}
  };

  const handleManageBilling = async () => {
    try {
      const { url } = await getBillingPortal();
      if (url) {
        window.location.href = url;
      } else {
        alert('Unable to open billing portal. Please try again or contact support.');
      }
    } catch {
      alert('Unable to open billing portal. Please try again or contact support.');
    }
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/';
  };

  const handleOpenShare = () => {
    if (!poem.trim()) return;
    const snapshotFont = computePoemFontStyle();
    setShareSnapshot({
      poem,
      tone: currentTone,
      version: currentVersion,
      theme: currentTheme,
      colors: {
        background: styles.colors.background,
        foreground: styles.colors.foreground,
        muted: styles.colors.muted,
      },
      font: snapshotFont,
    });
    setShareOpen(true);
  };

  const handleShareOpenChange = (next: boolean) => {
    if (!next) {
      setShareOpen(false);
      setShareSnapshot(null);
    } else {
      setShareOpen(true);
    }
  };

  const handleShareStyleChange = (style: ShareStyle) => {
    if (style === shareStyle) return;
    setShareStyle(style);
    setShareStyleInStorage(style);
  };

  // Ensure default autoRefresh persisted once
  useEffect(() => {
    try {
      if (localStorage.getItem('pv:auto') === null) setAutoInStorage(true);
    } catch {}
  }, []);

  // Start/stop scheduler based on visibility and autoRefresh
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        clearTick();
      } else if (autoRefresh) {
        // Fetch immediately on resume, then realign
        void (async () => {
          setIsTransitioning(true);
          // Use cache on resume to avoid redundant LLM calls
          await loadPoem(currentTone, false);
          scheduleNextTick();
        })();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    if (autoRefresh && !document.hidden) {
      scheduleNextTick();
    } else {
      clearTick();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTick();
    };
  }, [autoRefresh, currentTone]);

  // Handle tone change
  const handleToneChange = async (newTone: string) => {
    if (newTone === currentTone) {
      setIsMenuOpen(false);
      return;
    }

    setIsTransitioning(true);
    setIsMenuOpen(false);
    setCurrentTone(newTone);
    setToneInStorage(newTone);
    
    // Allow cache to serve the minute's poem for the new tone
    await loadPoem(newTone, false);
  };

  // Handle version change
  const handleVersionChange = (newVersion: Version) => {
    if (newVersion === currentVersion) {
      setIsVersionMenuOpen(false);
      return;
    }

    setCurrentVersion(newVersion);
    setVersionInStorage(newVersion);
    setIsVersionMenuOpen(false);
  };

  // Handle theme change
  const handleThemeChange = (newTheme: Theme) => {
    if (newTheme === currentTheme) {
      setIsThemeMenuOpen(false);
      return;
    }

    setCurrentTheme(newTheme);
    setThemeInStorage(newTheme);
    setIsThemeMenuOpen(false);
  };

  // Focus trap for menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const menu = menuRef.current;
        if (!menu) return;

        const focusableElements = menu.querySelectorAll('button');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
          } else {
            const currentIndex = Array.from(focusableElements).indexOf(document.activeElement as HTMLButtonElement);
            focusableElements[currentIndex - 1]?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
          } else {
            const currentIndex = Array.from(focusableElements).indexOf(document.activeElement as HTMLButtonElement);
            focusableElements[currentIndex + 1]?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  // Focus first menu item when opened
  useEffect(() => {
    if (isMenuOpen) {
      const firstButton = menuRef.current?.querySelector('button');
      firstButton?.focus();
    }
  }, [isMenuOpen]);

  // Click outside to close menus
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (isVersionMenuOpen && versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node) &&
          versionButtonRef.current && !versionButtonRef.current.contains(e.target as Node)) {
        setIsVersionMenuOpen(false);
      }
      if (isThemeMenuOpen && themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node) &&
          themeButtonRef.current && !themeButtonRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isMenuOpen, isVersionMenuOpen, isThemeMenuOpen]);

  // Fullscreen + presentation helpers
  const requestWakeLock = async () => {
    try {
      // @ts-ignore
      if (navigator?.wakeLock?.request) {
        // @ts-ignore
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        if (lock && typeof lock.addEventListener === 'function') {
          lock.addEventListener('release', () => {
            // no-op; we can re-acquire on visibilitychange
          });
        }
      }
    } catch {
      // Ignore wake lock errors
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current && typeof wakeLockRef.current.release === 'function') {
        await wakeLockRef.current.release();
      }
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
  };

  const enterPresentation = async () => {
    try {
      document.body.classList.add('presenting');
      setIsPresenting(true);
      if (!simulatePresentation && document.documentElement.requestFullscreen) {
        try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
      }
      await requestWakeLock();
    } catch {
      // ignore
    }
  };

  const exitPresentation = async () => {
    try {
      if (!simulatePresentation && document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch { /* ignore */ }
      }
    } finally {
      document.body.classList.remove('presenting');
      setIsPresenting(false);
      await releaseWakeLock();
    }
  };

  // Sync with native fullscreen changes (Esc, browser UI)
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      if (!fs) {
        // Exited fullscreen (via Esc or browser controls)
        document.body.classList.remove('presenting');
        setIsPresenting(false);
        void releaseWakeLock();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Re-acquire wake lock if needed when tab becomes visible
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && isPresenting) {
        void requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isPresenting]);

  // Keyboard shortcuts: F toggle fullscreen/presentation, N new poem, Esc exit
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditableEventTarget(e.target)) return;
      if (e.key === 'F' || e.key === 'f') {
        e.preventDefault();
        if (isPresenting) await exitPresentation(); else await enterPresentation();
      } else if (e.key === 'Escape') {
        if (isPresenting) {
          e.preventDefault();
          await exitPresentation();
        }
      } else if (e.key === 'N' || e.key === 'n') {
        e.preventDefault();
        setIsTransitioning(true);
        await loadPoem(currentTone, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPresenting, currentTone]);

  // Theme-specific colors
  const getThemeColors = () => {
    switch (currentTheme) {
      case 'Paper':
        return {
          background: '#FDF6F0',
          foreground: '#262320',
          muted: '#7E7369',
          menuBg: 'rgba(253, 246, 240, 0.95)'
        } as const;
      case 'Stone':
        return {
          background: '#ECEFF1',
          foreground: '#1F2328',
          muted: '#66707A',
          menuBg: 'rgba(236, 239, 241, 0.95)'
        } as const;
      case 'Ink':
        return {
          background: '#0A0A0A',
          foreground: '#F5F5F5',
          muted: '#888888',
          menuBg: 'rgba(10, 10, 10, 0.95)'
        } as const;
      case 'Slate': // replaced with "Charcoal" palette
        return {
          background: '#131417',
          foreground: '#ECEDEE',
          muted: '#9BA1A6',
          menuBg: 'rgba(19, 20, 23, 0.95)'
        } as const;
      case 'Mist':
        return {
          background: '#F5F9FF',
          foreground: '#1C2733',
          muted: '#6B7C8F',
          menuBg: 'rgba(245, 249, 255, 0.95)'
        } as const;
    }
  };

  // Parse query params for preview and simulated presentation
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const present = p.get('present');
      const preview = p.get('preview'); // e.g., iphone8 | ipad9 | ipad11 | tablet10
      const orient = (p.get('orientation') || 'portrait').toLowerCase();
      const scaleMode = (p.get('scale') || 'fit').toLowerCase();

      if (present === '1' || present === 'true') {
        setSimulatePresentation(true);
        document.body.classList.add('presenting');
        setIsPresenting(true);
      }

      const dimsFor = (key: string | null): {w: number; h: number; name: string} | null => {
        switch ((key || '').toLowerCase()) {
          case 'iphone8': return { w: 375, h: 667, name: 'iPhone 8' };
          case 'iphonese': return { w: 320, h: 568, name: 'iPhone SE' };
          case 'ipad9': return { w: 768, h: 1024, name: 'iPad 9.7”' };
          case 'ipad10':
          case 'ipad11': return { w: 834, h: 1194, name: 'iPad 11”' };
          case 'tablet10': return { w: 800, h: 1280, name: 'Android 10”' };
          default: return null;
        }
      };

      const dd = dimsFor(preview);
      if (dd) {
        const d = (orient === 'landscape') ? { w: dd.h, h: dd.w, name: `${dd.name} (landscape)` } : dd;
        setPreviewDims(d);
        const recalc = () => {
          if (!d) return;
          if (scaleMode === 'fit') {
            const sw = window.innerWidth / d.w;
            const sh = window.innerHeight / d.h;
            setPreviewScale(Math.min(sw, sh));
          } else {
            setPreviewScale(1);
          }
        };
        recalc();
        window.addEventListener('resize', recalc);
        window.addEventListener('orientationchange', recalc);
        return () => {
          window.removeEventListener('resize', recalc);
          window.removeEventListener('orientationchange', recalc);
        };
      }
    } catch {}
  }, []);

  // Version-specific styles and layouts
  const getVersionStyles = () => {
    const colors = getThemeColors();
    
    switch (currentVersion) {
      case 'Gallery':
        return {
          container: isPresenting ? "min-h-[100svh] flex items-center justify-center relative" : "min-h-screen flex items-center justify-center relative",
          poemContainer: isPresenting ? "w-full px-6 py-6" : "max-w-4xl w-full px-20 py-40",
          poem: "text-4xl leading-loose tracking-wide whitespace-pre-line select-text text-center",
          font: { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', letterSpacing: '0.03em', lineHeight: '1.618' },
          loading: "text-4xl animate-pulse",
          colors
        };
      case 'Manuscript':
        return {
          container: isPresenting ? "min-h-[100svh] flex items-center justify-center relative" : "min-h-screen flex items-start justify-center relative pt-24",
          poemContainer: isPresenting ? "w-full px-6 py-6" : "max-w-2xl w-full px-12 py-16",
          poem: "text-2xl leading-relaxed tracking-normal whitespace-pre-line select-text text-left",
          font: { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', letterSpacing: '0.01em', lineHeight: '1.75' },
          loading: "text-2xl animate-pulse",
          colors
        };
      case 'Zen':
        return {
          container: isPresenting ? "min-h-[100svh] flex items-center justify-center relative" : "min-h-screen flex items-center justify-center relative",
          poemContainer: isPresenting ? "w-full px-6 py-6" : "max-w-xl w-full px-8 py-32",
          poem: "text-xl leading-loose tracking-wide whitespace-pre-line select-text text-center",
          font: { fontFamily: 'ui-sans-serif, system-ui, sans-serif', letterSpacing: '0.05em', lineHeight: '2', fontWeight: '300' },
          loading: "text-xl animate-pulse",
          colors
        };
    }
  };

  const styles = getVersionStyles();

  const bumpLetterSpacing = (ls: string, deltaEm = 0.01) => {
    const match = /^(-?\d*\.?\d+)em$/.exec((ls || '').trim());
    if (!match) return ls;
    const value = parseFloat(match[1]);
    return `${(value + deltaEm).toFixed(3)}em`;
  };

  const computePoemFontStyle = () => {
    const font: any = { ...styles.font };
    const isDarkTheme = currentTheme === 'Ink' || currentTheme === 'Slate';
    if (isDarkTheme && typeof font.letterSpacing === 'string') {
      font.letterSpacing = bumpLetterSpacing(font.letterSpacing, 0.01);
    }
    return font;
  };

  // Sync CSS variables for background/foreground with the chosen theme colors
  useEffect(() => {
    const root = document.documentElement;
    try {
      root.style.setProperty('--background', styles.colors.background);
      root.style.setProperty('--foreground', styles.colors.foreground);
    } catch {}
  }, [styles.colors.background, styles.colors.foreground]);

  // Fit poem to viewport (presentation or simulated preview) so it never overflows the screen
  useEffect(() => {
    const el = poemElRef.current;
    const pc = poemContainerRef.current;
    if (!el) return;

    const computeAvailHeight = () => {
      const host = previewRef.current || pc || containerRef.current;
      if (!host) return window.innerHeight;
      const h = host.clientHeight || window.innerHeight;
      try {
        const cs = window.getComputedStyle(host);
        const pad = (parseFloat(cs.paddingTop || '0') || 0) + (parseFloat(cs.paddingBottom || '0') || 0);
        return Math.max(0, h - pad);
      } catch {
        return h;
      }
    };

    const fitOnce = () => {
      if (!isPresenting && !previewDims) {
        // Clear any previous fit overrides
        el.style.removeProperty('--poem-fit-size');
        el.style.removeProperty('letterSpacing');
        el.style.removeProperty('lineHeight');
        return;
      }

      const avail = Math.max(0, computeAvailHeight() - 8); // small safety margin
      const MIN = 20; // px
      const MAX = 46; // px (cap consistent with globals CSS clamp)

      let low = MIN;
      let high = MAX;
      let best = MIN;

      // Reset tightening overrides before search
      el.style.removeProperty('letterSpacing');
      // Keep line-height consistent with presentation target during fitting
      el.style.lineHeight = '1.3';

      for (let i = 0; i < 9 && low <= high; i++) {
        const mid = Math.floor((low + high) / 2);
        el.style.setProperty('--poem-fit-size', `${mid}px`);
        const needed = el.scrollHeight;
        if (needed <= avail) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      el.style.setProperty('--poem-fit-size', `${best}px`);

      // If still overflows at min size, apply gentle tightening
      if (el.scrollHeight > avail) {
        el.style.letterSpacing = '-0.005em';
        el.style.lineHeight = '1.25';
        // Try a final nudge down within safe bounds
        const final = Math.max(MIN - 2, 18);
        el.style.setProperty('--poem-fit-size', `${final}px`);
      }
    };

    // Debounce and schedule
    let t: number | undefined;
    const schedule = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        requestAnimationFrame(fitOnce);
      }, 50);
    };

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [poem, isPresenting, styles.poemContainer]);

  const AppBody = (
    <div
      ref={containerRef}
      className={styles.container}
      style={{
        backgroundColor: styles.colors.background,
        color: styles.colors.foreground,
      }}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => !isMenuOpen && !isVersionMenuOpen && !isThemeMenuOpen && setShowControls(false)}
    >
      {/* Version Selector - Top left corner */}
      <div className="fixed top-8 left-8">
        <div className="relative">
          <button
            ref={versionButtonRef}
            onClick={() => setIsVersionMenuOpen(!isVersionMenuOpen)}
            className={`transition-all duration-700 ease-out ${
              showControls || isVersionMenuOpen 
                ? 'opacity-30 hover:opacity-60' 
                : 'opacity-0 hover:opacity-30'
            } text-xs tracking-wider lowercase`}
            style={{ color: styles.colors.muted }}
            aria-expanded={isVersionMenuOpen}
            aria-haspopup="true"
          >
            {currentVersion.toLowerCase()}
          </button>
          
          {isVersionMenuOpen && (
            <div
              ref={versionMenuRef}
              className="absolute top-full left-0 mt-4 backdrop-blur-sm"
              style={{ backgroundColor: styles.colors.menuBg }}
              role="menu"
            >
              <div className="flex flex-col space-y-1">
                {VERSIONS.map((version) => (
                  <button
                    key={version}
                    onClick={() => handleVersionChange(version)}
                    className={`text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 ${
                      version === currentVersion ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                    }`}
                    style={{ 
                      color: version === currentVersion ? styles.colors.foreground : styles.colors.muted 
                    }}
                    role="menuitem"
                  >
                    {version.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Theme Selector - Top right corner */}
      <div className="fixed top-8 right-8">
        <div className="relative">
          <button
            ref={themeButtonRef}
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            className={`transition-all duration-700 ease-out ${
              showControls || isThemeMenuOpen 
                ? 'opacity-30 hover:opacity-60' 
                : 'opacity-0 hover:opacity-30'
            } text-xs tracking-wider lowercase`}
            style={{ color: styles.colors.muted }}
            aria-expanded={isThemeMenuOpen}
            aria-haspopup="true"
          >
            {currentTheme.toLowerCase()}
          </button>
          
          {isThemeMenuOpen && (
            <div
              ref={themeMenuRef}
              className="absolute top-full right-0 mt-4 backdrop-blur-sm"
              style={{ backgroundColor: styles.colors.menuBg }}
              role="menu"
            >
              <div className="flex flex-col space-y-1">
                {THEMES.map((theme) => (
                  <button
                    key={theme}
                    onClick={() => handleThemeChange(theme)}
                    className={`text-xs tracking-wider lowercase transition-all duration-300 text-right py-1 ${
                      theme === currentTheme ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                    }`}
                    style={{ 
                      color: theme === currentTheme ? styles.colors.foreground : styles.colors.muted 
                    }}
                    role="menuitem"
                  >
                    {theme.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unified controls */}
      <ControlsRail
        showControls={showControls}
        isPresenting={isPresenting}
        onTogglePresent={async () => { isPresenting ? await exitPresentation() : await enterPresentation(); }}
        isSubscribed={isSubscribed}
        onUpgrade={handleUpgrade}
        onManageBilling={handleManageBilling}
        onSignOut={handleSignOut}
        onOpenFeedback={() => setShowFeedback(true)}
        onOpenShare={handleOpenShare}
        canShare={poem.trim().length > 0}
        mutedColor={styles.colors.muted}
        menuBg={styles.colors.menuBg}
      />

      {/* Tone Selector - Bottom right corner */}
      <div className="fixed bottom-8 right-8">
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`transition-all duration-700 ease-out ${
              showControls || isMenuOpen 
                ? 'opacity-30 hover:opacity-60' 
                : 'opacity-0 hover:opacity-30'
            } text-xs tracking-wider lowercase`}
            style={{ color: styles.colors.muted }}
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
          >
            {currentTone.toLowerCase()}
          </button>
          
          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute bottom-full right-0 mb-4 backdrop-blur-sm"
              style={{ backgroundColor: styles.colors.menuBg }}
              role="menu"
            >
              <div className="flex flex-col space-y-1">
                {TONES.map((tone) => (
                  <button
                    key={tone}
                    onClick={() => handleToneChange(tone)}
                    className={`text-xs tracking-wider lowercase transition-all duration-300 text-right py-1 ${
                      tone === currentTone ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                    }`}
                    style={{ 
                      color: tone === currentTone ? styles.colors.foreground : styles.colors.muted 
                    }}
                    role="menuitem"
                  >
                    {tone.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
      </div>

      

      {/* Poem Display */}
      <div className={styles.poemContainer} ref={poemContainerRef}>
        {isLoading ? (
          <div className={currentVersion === 'Manuscript' ? 'text-left' : 'text-center'}>
            <div 
              className={styles.loading}
              style={{ color: styles.colors.muted, opacity: 0.3 }}
            >
              ···
            </div>
          </div>
        ) : (
          <div
            ref={poemRef}
            className={`transition-all duration-1000 ease-out ${
              isTransitioning 
                ? 'opacity-0 blur-sm transform translate-y-2' 
                : 'opacity-100 blur-0 transform translate-y-0'
            }`}
          >
            {upgradeInfo.needed ? (
              <div className={styles.poem} style={{ color: styles.colors.foreground, textAlign: 'center' }}>
                <div style={{ opacity: 0.7, marginBottom: '0.75rem' }}>
                  You’ve reached the free tier limit
                  {typeof upgradeInfo.used === 'number' && typeof upgradeInfo.limit === 'number' ? (
                    <span>{` (${upgradeInfo.used}/${upgradeInfo.limit} minutes)`}</span>
                  ) : null}
                  .
                </div>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <Button onClick={handleUpgrade}>upgrade</Button>
                  <Button
                    variant="outline"
                    onClick={async () => { try { await me(); } catch {}; await loadPoem(currentTone, false); }}
                  >
                    already upgraded? try again
                  </Button>
                </div>
              </div>
            ) : (() => {
              const fontStyle: any = computePoemFontStyle();
              const lines = poem.split(/\r?\n/);
              return (
                <div 
                  className={styles.poem}
                  data-poem
                  style={{
                    ...fontStyle,
                    ...(isPresenting ? { lineHeight: 1.3 } : {}),
                    color: styles.colors.foreground
                  }}
                  ref={poemElRef}
                >
                  {lines.map((line, idx) => {
                    const isBlank = line.trim().length === 0;
                    return (
                      <span
                        key={`poem-line-${idx}`}
                        className="poem-line"
                        aria-hidden={isBlank || undefined}
                      >
                        {isBlank ? '\u00A0' : line}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {/* Feedback Dialog */}
      <SharePoemDialog
        open={!!shareSnapshot && shareOpen}
        onOpenChange={handleShareOpenChange}
        poem={shareSnapshot?.poem ?? poem}
        tone={shareSnapshot?.tone ?? currentTone}
        version={shareSnapshot?.version ?? currentVersion}
        theme={shareSnapshot?.theme ?? currentTheme}
        colors={shareSnapshot?.colors ?? {
          background: styles.colors.background,
          foreground: styles.colors.foreground,
          muted: styles.colors.muted,
        }}
        fontStyle={shareSnapshot?.font ?? computePoemFontStyle()}
        styleVariant={shareStyle}
        onStyleChange={handleShareStyleChange}
      />
      <FeedbackDialog
        open={showFeedback}
        onOpenChange={setShowFeedback}
        tone={currentTone}
        version={currentVersion}
        theme={currentTheme}
        poem={poem}
        mutedColor={styles.colors.muted}
      />
    </div>
  );

  // When preview is active, wrap the app in a simulated viewport with optional scale-to-fit
  if (previewDims) {
    return (
      <div className="min-h-[100svh] w-full grid place-items-center bg-black/10">
        <div
          ref={previewRef}
          style={{
            width: `${previewDims.w}px`,
            height: `${previewDims.h}px`,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            background: styles.colors.background,
          }}
        >
          {AppBody}
        </div>
      </div>
    );
  }

  return AppBody;
}
