import { useState, useEffect, useRef } from 'react';
import { getPoem } from './lib/api';

// Utilities
const detectTimeFormat = (): '12h' | '24h' => {
  const testDate = new Date('2023-01-01 13:00:00');
  const formatted = testDate.toLocaleTimeString();
  return formatted.includes('PM') || formatted.includes('AM') ? '12h' : '24h';
};

const getToneFromStorage = (): string => {
  try {
    return localStorage.getItem('cv:tone') || 'Wistful';
  } catch {
    return 'Wistful';
  }
};

const setToneInStorage = (tone: string): void => {
  try {
    localStorage.setItem('cv:tone', tone);
  } catch {
    // Silent fail
  }
};


const TONES = ['Whimsical', 'Stoic', 'Wistful', 'Funny', 'Haiku', 'Noir', 'Minimal', 'Cosmic'];
const VERSIONS = ['Gallery', 'Manuscript', 'Zen'] as const;
const THEMES = ['Paper', 'Stone', 'Ink', 'Slate', 'Mist'] as const;
type Version = typeof VERSIONS[number];
type Theme = typeof THEMES[number];

const getVersionFromStorage = (): Version => {
  try {
    const stored = localStorage.getItem('cv:version') as Version;
    return VERSIONS.includes(stored) ? stored : 'Gallery';
  } catch {
    return 'Gallery';
  }
};

const setVersionInStorage = (version: Version): void => {
  try {
    localStorage.setItem('cv:version', version);
  } catch {
    // Silent fail
  }
};

const getThemeFromStorage = (): Theme => {
  try {
    const stored = localStorage.getItem('cv:theme') as Theme;
    return THEMES.includes(stored) ? stored : 'Paper';
  } catch {
    return 'Paper';
  }
};

const setThemeInStorage = (theme: Theme): void => {
  try {
    localStorage.setItem('cv:theme', theme);
  } catch {
    // Silent fail
  }
};

// --- Auto-refresh storage helpers ---
const getAutoFromStorage = (): boolean => {
  try {
    const v = localStorage.getItem('cv:auto');
    if (v === null) return true; // default ON
    return v === '1';
  } catch {
    return true;
  }
};


const setAutoInStorage = (on: boolean): void => {
  try {
    localStorage.setItem('cv:auto', on ? '1' : '0');
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
  const tickTimeoutRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<boolean>(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const versionButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const poemRef = useRef<HTMLDivElement>(null);

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
      await loadPoem(currentTone, true);
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
    } catch {
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

  // Ensure default autoRefresh persisted once
  useEffect(() => {
    try {
      if (localStorage.getItem('cv:auto') === null) setAutoInStorage(true);
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
          await loadPoem(currentTone, true);
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
    
    await loadPoem(newTone, true);
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
      if (document.documentElement.requestFullscreen) {
        try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
      }
      await requestWakeLock();
    } catch {
      // ignore
    }
  };

  const exitPresentation = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
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
          background: '#faf9f7',
          foreground: '#2c2c2c',
          muted: '#8b8680',
          menuBg: 'rgba(250, 249, 247, 0.95)'
        };
      case 'Stone':
        return {
          background: '#f8f9fa',
          foreground: '#1a1a1a',
          muted: '#6c757d',
          menuBg: 'rgba(248, 249, 250, 0.95)'
        };
      case 'Ink':
        return {
          background: '#0a0a0a',
          foreground: '#f5f5f5',
          muted: '#888888',
          menuBg: 'rgba(10, 10, 10, 0.95)'
        };
      case 'Slate':
        return {
          background: '#1e293b',
          foreground: '#f1f5f9',
          muted: '#94a3b8',
          menuBg: 'rgba(30, 41, 59, 0.95)'
        };
      case 'Mist':
        return {
          background: '#fbfcfd',
          foreground: '#1f2937',
          muted: '#6b7280',
          menuBg: 'rgba(251, 252, 253, 0.95)'
        };
    }
  };

  // Version-specific styles and layouts
  const getVersionStyles = () => {
    const colors = getThemeColors();
    
    switch (currentVersion) {
      case 'Gallery':
        return {
          container: "min-h-screen flex items-center justify-center relative",
          poemContainer: "max-w-4xl w-full px-20 py-40",
          poem: "text-4xl leading-loose tracking-wide whitespace-pre-line select-text text-center",
          font: { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', letterSpacing: '0.03em', lineHeight: '1.618' },
          loading: "text-4xl animate-pulse",
          colors
        };
      case 'Manuscript':
        return {
          container: "min-h-screen flex items-start justify-center relative pt-24",
          poemContainer: "max-w-2xl w-full px-12 py-16",
          poem: "text-2xl leading-relaxed tracking-normal whitespace-pre-line select-text text-left",
          font: { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', letterSpacing: '0.01em', lineHeight: '1.75' },
          loading: "text-2xl animate-pulse",
          colors
        };
      case 'Zen':
        return {
          container: "min-h-screen flex items-center justify-center relative",
          poemContainer: "max-w-xl w-full px-8 py-32",
          poem: "text-xl leading-loose tracking-wide whitespace-pre-line select-text text-center",
          font: { fontFamily: 'ui-sans-serif, system-ui, sans-serif', letterSpacing: '0.05em', lineHeight: '2', fontWeight: '300' },
          loading: "text-xl animate-pulse",
          colors
        };
    }
  };

  const styles = getVersionStyles();

  return (
    <div 
      className={styles.container}
      style={{ 
        backgroundColor: styles.colors.background, 
        color: styles.colors.foreground 
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

      {/* Presentation Toggle - Bottom left corner */}
      <div className="fixed bottom-8 left-8">
        <div className="relative">
          <button
            onClick={async () => { isPresenting ? await exitPresentation() : await enterPresentation(); }}
            className={`transition-all duration-700 ease-out ${
              showControls ? 'opacity-30 hover:opacity-60' : 'opacity-0 hover:opacity-30'
            } text-xs tracking-wider lowercase`}
            style={{ color: styles.colors.muted }}
            aria-pressed={isPresenting}
          >
            {isPresenting ? 'exit' : 'present'}
          </button>
        </div>
      </div>

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
      <div className={styles.poemContainer}>
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
            <div 
              className={styles.poem}
              data-poem
              style={{
                ...styles.font,
                color: styles.colors.foreground
              }}
            >
              {poem}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}