import { useCallback, useMemo, useRef, useState } from 'react';
import type { PlayerView } from '../../../shared/view.ts';
import { Icon, GlyphName } from '../icons.tsx';
import { RichText } from '../RichText.tsx';

export type ToastKind = 'discover' | 'treasure' | 'robber' | 'trade' | 'award';
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

const ICON: Record<ToastKind, GlyphName> = {
  discover: 'anchor',
  treasure: 'treasure',
  robber: 'robber',
  trade: 'trade',
  award: 'victoryPoint',
};

export function useToasts() {
  const [list, setList] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, kind: ToastKind) => {
    const id = next.current++;
    setList((l) => [...l.slice(-3), { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4800);
  }, []);
  return useMemo(() => ({ list, push }), [list, push]);
}

export function Toasts({ toasts, players }: { toasts: Toast[]; players: PlayerView[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`game-toast ${t.kind}`}>
          <Icon name={ICON[t.kind]} size={22} />
          <span>
            <RichText text={t.text} players={players} />
          </span>
        </div>
      ))}
    </div>
  );
}
