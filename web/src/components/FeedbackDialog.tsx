import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { sendFeedback, FeedbackContext } from '../lib/api';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone: string;
  version: 'Gallery' | 'Manuscript' | 'Zen';
  theme: 'Paper' | 'Stone' | 'Ink' | 'Slate' | 'Mist';
  poem: string;
  mutedColor: string; // for subtle labels
};

const detectTimeFormat = (): '12h' | '24h' => {
  const testDate = new Date('2023-01-01 13:00:00');
  const formatted = testDate.toLocaleTimeString();
  return formatted.includes('PM') || formatted.includes('AM') ? '12h' : '24h';
};

export default function FeedbackDialog({ open, onOpenChange, tone, version, theme, poem, mutedColor }: Props) {
  const [message, setMessage] = useState('');
  const [include, setInclude] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; emailed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context: FeedbackContext = useMemo(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const format = detectTimeFormat();
    return {
      tone,
      version,
      theme,
      poem,
      timezone,
      format,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    };
  }, [tone, version, theme, poem]);

  const onSubmit = async () => {
    if (!message.trim()) {
      setError('Please enter a short message.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await sendFeedback({ message: message.trim(), includeContext: include, context });
      setResult({ ok: res.ok, emailed: res.emailed });
      // Auto-close after brief delay
      setTimeout(() => {
        onOpenChange(false);
        setMessage('');
        setResult(null);
      }, 1200);
    } catch (e: any) {
      const status = e?.status;
      if (status === 401) setError('You need to be signed in.'); else if (status === 429) setError('Too many feedback requests. Please try again in a minute.'); else setError('Unable to send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { setMessage(''); setResult(null); setError(null); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>feedback</DialogTitle>
          <DialogDescription>
            Share an idea or report a glitch. We read everything.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            placeholder="your thoughts…"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <label className="flex items-center gap-3 select-none">
            <Switch checked={include} onCheckedChange={(v: boolean) => setInclude(v)} />
            <span className="text-sm" style={{ color: mutedColor }}>Include current poem & settings</span>
          </label>
          {result && (
            <div className="text-sm" style={{ color: mutedColor }}>
              Thanks — saved{result.emailed ? ' and emailed' : ''}.
            </div>
          )}
          {error && (
            <div className="text-sm" style={{ color: '#d33' }}>{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={submitting || !message.trim()}>
            {submitting ? 'sending…' : 'send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
