import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { toPng } from 'html-to-image';
import { Download, Copy, Share2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

type ThemeName = 'Paper' | 'Stone' | 'Ink' | 'Slate' | 'Mist';
type VersionName = 'Gallery' | 'Manuscript' | 'Zen';
type ShareStyle = 'classic' | 'polaroid';

type ThemeColors = {
  background: string;
  foreground: string;
  muted: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poem: string;
  tone: string;
  theme: ThemeName;
  version: VersionName;
  colors: ThemeColors;
  fontStyle: Partial<CSSProperties>;
  styleVariant: ShareStyle;
  onStyleChange?: (style: ShareStyle) => void;
};

type CaptureState = {
  dataUrl: string;
  blob: Blob;
  objectUrl: string;
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',', 2);
  const mimeMatch = /data:(.*?);/.exec(header || '');
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = typeof atob === 'function' ? atob(base64 || '') : '';
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
};

const detectTimeFormat = (): '12h' | '24h' => {
  const testDate = new Date('2023-01-01T13:00:00');
  const formatted = testDate.toLocaleTimeString();
  return formatted.includes('PM') || formatted.includes('AM') ? '12h' : '24h';
};

const formatTime = (): string => {
  const format = detectTimeFormat();
  const options: Intl.DateTimeFormatOptions =
    format === '12h'
      ? { hour: 'numeric', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit', hour12: false };
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
};

const toneTagline = (tone: string, version: VersionName, theme: ThemeName) => {
  return `${tone} • ${version} • ${theme}`;
};

const versionFontSize = (version: VersionName) => {
  switch (version) {
    case 'Gallery':
      return { fontSize: '56px', lineHeight: 1.4 };
    case 'Manuscript':
      return { fontSize: '42px', lineHeight: 1.5, textAlign: 'left' as const };
    case 'Zen':
    default:
      return { fontSize: '36px', lineHeight: 1.8 };
  }
};

const STYLE_OPTIONS: Array<{ value: ShareStyle; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'polaroid', label: 'Polaroid' },
];

export default function SharePoemDialog({
  open,
  onOpenChange,
  poem,
  tone,
  theme,
  version,
  colors,
  fontStyle,
  styleVariant,
  onStyleChange,
}: Props) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const poemLines = useMemo(() => {
    if (!poem) return [] as string[];
    return poem.split(/\r?\n/);
  }, [poem]);

  const tagline = useMemo(() => toneTagline(tone, version, theme), [tone, version, theme]);
  const timeStamp = useMemo(() => formatTime(), [open]);

  const resetState = useCallback(() => {
    setError(null);
    setInfo(null);
    setCapture((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const performCapture = useCallback(async (attempt = 0): Promise<void> => {
    const node = shareCardRef.current;
    if (!node) {
      if (attempt >= 5) {
        setError('Unable to prepare the share card. Close and try again.');
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100 + attempt * 60));
      return performCapture(attempt + 1);
    }

    setIsCapturing(true);
    setError(null);
    setInfo(null);

    try {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          await (document as any).fonts.ready;
        } catch {
          // ignore font readiness failures
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const captureBackground = styleVariant === 'polaroid' ? '#000000' : colors.background;
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: Math.min(2.5, window.devicePixelRatio || 2),
        backgroundColor: captureBackground,
      });
      const blob = dataUrlToBlob(dataUrl);
      const objectUrl = URL.createObjectURL(blob);
      setCapture((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return { dataUrl, blob, objectUrl };
      });
    } catch (err) {
      console.error('poem capture failed', err);
      setError('Unable to render the poem card. Try again in a moment.');
    } finally {
      setIsCapturing(false);
    }
  }, [colors.background, styleVariant]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    resetState();
    if (!poem.trim()) {
      setError('No poem to share yet. Generate one first.');
      return;
    }
    let cancelled = false;
    const kick = () => {
      if (cancelled) return;
      void performCapture();
    };
    const id = window.setTimeout(kick, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, poem, styleVariant, performCapture, resetState]);

  useEffect(() => {
    return () => {
      setCapture((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
    };
  }, []);

  const handleDownload = useCallback(() => {
    if (!capture) return;
    const link = document.createElement('a');
    link.href = capture.objectUrl || capture.dataUrl;
    link.download = `chronoverse-${tone.toLowerCase()}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setInfo('Saved to downloads.');
  }, [capture, tone]);

  const handleCopy = useCallback(async () => {
    if (!capture || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
      setError('Copying images is not supported here. Try downloading instead.');
      return;
    }
    try {
      const item = new ClipboardItem({ 'image/png': capture.blob });
      await navigator.clipboard.write([item]);
      setInfo('Copied image to clipboard.');
    } catch (err) {
      console.error('copy failed', err);
      setError('Clipboard permission denied. Try another option.');
    }
  }, [capture]);

  const handleNativeShare = useCallback(async () => {
    if (!capture || !canNativeShare) {
      setError('Share is not available on this device.');
      return;
    }
    try {
      const file = new File([capture.blob], 'chronoverse-poem.png', { type: 'image/png' });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        throw new Error('unsupported');
      }
      await navigator.share({
        files: [file],
        text: `A ${tone.toLowerCase()} time poem from ChronoVerse.`,
        title: 'ChronoVerse poem',
      });
      setInfo('Shared successfully.');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('share failed', err);
      setError('Sharing failed. Try another option.');
    }
  }, [capture, tone, canNativeShare]);

  const shareText = useMemo(() => {
    const flat = poem.replace(/\s+/g, ' ').trim();
    return `${flat}\n— ChronoVerse (${tagline})`;
  }, [poem, tagline]);

  const handlePostToX = useCallback(() => {
    if (!capture || typeof window === 'undefined') return;
    const encoded = encodeURIComponent(shareText);
    const url = `https://twitter.com/intent/tweet?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setInfo('Opened X compose window.');
  }, [capture, shareText]);

  const renderShareCard = () => {
    if (styleVariant === 'polaroid') {
      const baseFontFamily = fontStyle.fontFamily || 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
      const joinedPoem = poemLines.length ? poemLines.join('\n') : 'Time moves in mysterious ways…';
      return (
        <div
          ref={shareCardRef}
          style={{
            width: '820px',
            padding: '40px',
            paddingBottom: '56px',
            borderRadius: '28px',
            backgroundColor: '#000000',
            color: '#f4f4f4',
            boxShadow: '0 40px 140px rgba(0,0,0,0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
            alignItems: 'center',
            transform: 'rotate(1.5deg)',
            transformOrigin: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              minHeight: '420px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
              borderRadius: '18px',
              padding: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontFamily: baseFontFamily,
                fontSize: '32px',
                lineHeight: 1.6,
                textAlign: 'center',
                letterSpacing: '0.04em',
                whiteSpace: 'pre-line',
                maxWidth: '100%',
                color: '#f8f8f8',
              }}
            >
              {joinedPoem}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              textTransform: 'uppercase',
            }}
          >
            <div style={{ letterSpacing: '0.35em', fontSize: '14px', color: '#e9e9e9' }}>ChronoVerse</div>
            <div style={{ letterSpacing: '0.08em', fontSize: '16px', color: '#b9b9b9', textTransform: 'none' }}>
              {timeStamp} • {tone}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={shareCardRef}
        style={{
          width: '960px',
          padding: '88px',
          borderRadius: '36px',
          backgroundColor: colors.background,
          color: colors.foreground,
          boxShadow: '0 30px 120px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
          alignItems: version === 'Manuscript' ? 'flex-start' : 'center',
          fontFamily: fontStyle.fontFamily || 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
          letterSpacing: fontStyle.letterSpacing,
          lineHeight: fontStyle.lineHeight,
          fontWeight: fontStyle.fontWeight,
        }}
      >
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', textTransform: 'uppercase', fontSize: '18px', letterSpacing: '0.3em', color: colors.muted }}>
          <span>ChronoVerse</span>
          <span>{timeStamp}</span>
        </div>
        <div
          style={{
            width: '100%',
            whiteSpace: 'pre-line',
            color: colors.foreground,
            ...versionFontSize(version),
            fontWeight: version === 'Zen' ? 300 : fontStyle.fontWeight || 400,
          }}
        >
          {poemLines.length ? poemLines.join('\n') : 'Time moves in mysterious ways…'}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>share poem</DialogTitle>
          <DialogDescription>
            Save or share a snapshot of this minute&apos;s poem.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-[0.35em]" style={{ color: colors.muted }}>layout</span>
            <div className="flex gap-2">
              {STYLE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={styleVariant === option.value ? 'default' : 'outline'}
                  type="button"
                  aria-pressed={styleVariant === option.value}
                  onClick={() => {
                    if (option.value !== styleVariant) onStyleChange?.(option.value);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {isCapturing && (
            <div className="text-sm text-neutral-500">rendering preview…</div>
          )}
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          {info && (
            <div className="text-sm text-emerald-600">{info}</div>
          )}
          {capture && !error && (
            <div className="border rounded-lg overflow-hidden">
              <img
                src={capture.dataUrl}
                alt={`ChronoVerse ${tone} poem`}
                className="w-full h-auto"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={handleDownload} disabled={!capture}>
              <Download className="size-4 mr-2" /> download
            </Button>
            <Button variant="outline" onClick={handleCopy} disabled={!capture}>
              <Copy className="size-4 mr-2" /> copy
            </Button>
            <Button onClick={handleNativeShare} disabled={!capture || !canNativeShare}>
              <Share2 className="size-4 mr-2" /> share
            </Button>
            <Button variant="outline" onClick={handlePostToX} disabled={!capture}>
              <ExternalLink className="size-4 mr-2" /> post to x
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Hidden share card rendered off-screen for image capture */}
      <div style={{ position: 'fixed', top: '-10000px', left: '-10000px', pointerEvents: 'none' }} aria-hidden>
        {renderShareCard()}
      </div>
    </Dialog>
  );
}
