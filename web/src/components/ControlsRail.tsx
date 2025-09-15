import React, { useState, useRef, useEffect } from 'react';

type Props = {
  showControls: boolean;
  isPresenting: boolean;
  onTogglePresent: () => void;
  isSubscribed: boolean;
  onUpgrade: () => void;
  onManageBilling: () => void;
  onSignOut: () => void;
  onOpenFeedback?: () => void;
  mutedColor: string;
  menuBg: string;
};

export default function ControlsRail({
  showControls,
  isPresenting,
  onTogglePresent,
  isSubscribed,
  onUpgrade,
  onManageBilling,
  onSignOut,
  onOpenFeedback,
  mutedColor,
  menuBg,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const fade = showControls || open ? 'opacity-30 hover:opacity-60' : 'opacity-0 hover:opacity-30';

  return (
    <div className="fixed bottom-8 left-8" ref={containerRef}>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setOpen((v) => !v)}
          className={`transition-all duration-700 ease-out ${fade} text-xs tracking-wider lowercase`}
          style={{ color: mutedColor }}
          aria-expanded={open}
          aria-haspopup="true"
        >
          menu
        </button>

        {open && (
          <div
            className="absolute bottom-full left-0 mb-4 backdrop-blur-sm"
            style={{ backgroundColor: menuBg }}
            role="menu"
          >
            <div className="flex flex-col space-y-1 p-1">
              <button
                onClick={() => { onTogglePresent(); setOpen(false); }}
                className="text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 opacity-80 hover:opacity-100"
                style={{ color: mutedColor }}
                role="menuitem"
              >
                {isPresenting ? 'exit' : 'present'}
              </button>
              <button
                onClick={() => { onOpenFeedback?.(); setOpen(false); }}
                className="text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 opacity-80 hover:opacity-100"
                style={{ color: mutedColor }}
                role="menuitem"
              >
                feedback
              </button>
              {/* Manage billing visible regardless of subscribed state */}
              <button
                onClick={() => { onManageBilling(); setOpen(false); }}
                className="text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 opacity-80 hover:opacity-100"
                style={{ color: mutedColor }}
                role="menuitem"
              >
                manage billing
              </button>
              {!isSubscribed && (
                <button
                  onClick={() => { onUpgrade(); setOpen(false); }}
                  className="text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 opacity-80 hover:opacity-100"
                  style={{ color: mutedColor }}
                  role="menuitem"
                >
                  upgrade
                </button>
              )}
              <button
                onClick={() => { onSignOut(); setOpen(false); }}
                className="text-xs tracking-wider lowercase transition-all duration-300 text-left py-1 opacity-80 hover:opacity-100"
                style={{ color: mutedColor }}
                role="menuitem"
              >
                sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
