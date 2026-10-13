import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameView } from '../../../shared/view.ts';
import { net } from '../net.ts';
import { sound } from '../sound.ts';

const SoundIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
    <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor" />
    {muted ? (
      <path d="M16 9 L21 15 M21 9 L16 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    ) : (
      <path d="M16 9 Q18.5 12 16 15 M18.5 6.5 Q23 12 18.5 17.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )}
  </svg>
);

/** Floating top-left corner of the board: game menu, round counter, quick toggles. */
export function Corner({ view, onRules, onCenter }: { view: GameView; onRules: () => void; onCenter: () => void }) {
  const muted = useSyncExternalStore(sound.subscribe, () => sound.muted);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setup = view.phase === 'setup';

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const leave = () => {
    if (view.phase === 'ended' || confirm('Leave this game? Your turns will be skipped automatically.')) net.send({ t: 'leave' });
  };
  const item = (f: () => void) => () => {
    setOpen(false);
    f();
  };

  return (
    <div className="corner" ref={ref}>
      <button className="corner-logo" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Game menu" title="Game menu">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
          <polygon points="31,16 23.5,29 8.5,29 1,16 8.5,3 23.5,3" fill="var(--brass)" stroke="#5c430f" strokeWidth="1.5" />
          <path d="M10 12 H22 M10 16 H22 M10 20 H22" stroke="#4a340b" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="corner-round" title={setup ? 'Setting up' : `Round ${view.round} of ${view.rounds}`}>
        <span className="corner-round-label">
          {setup ? (
            <b>Setup</b>
          ) : (
            <>
              Round <b>{view.round}</b>
              <span className="of"> / {view.rounds}</span>
            </>
          )}
        </span>
        <span className="round-track">
          <span className="round-fill" style={{ width: `${setup ? 0 : (view.round / view.rounds) * 100}%` }} />
        </span>
      </div>

      <button className="corner-icon" onClick={() => sound.setMuted(!muted)} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} title={muted ? 'Sound off' : 'Sound on'}>
        <SoundIcon muted={muted} />
      </button>
      <button className="corner-icon serif" onClick={onRules} aria-label="Rules and shortcuts" title="Rules and shortcuts (?)">
        ?
      </button>

      {open && (
        <div className="corner-menu" role="menu">
          <button role="menuitem" onClick={item(onRules)}>
            Rules and shortcuts <kbd>?</kbd>
          </button>
          <button role="menuitem" onClick={item(() => sound.setMuted(!muted))}>
            {muted ? 'Turn sound on' : 'Turn sound off'}
          </button>
          <button role="menuitem" onClick={item(onCenter)}>
            Center on my island <kbd>H</kbd>
          </button>
          <hr />
          <button role="menuitem" className="danger" onClick={item(leave)}>
            Leave game
          </button>
        </div>
      )}
    </div>
  );
}
