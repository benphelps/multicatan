import { ReactNode, useState } from 'react';
import { RESOURCES, ResMap, Resource, emptyRes, resTotal } from '../../shared/types.ts';
import { ResourceIcon } from './icons.tsx';

export const RES_LABEL: Record<Resource, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

/** Small round resource token, used in costs and inline lists. */
export function ResSwatch({ res, count, size = 'sm' }: { res: Resource; count?: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`swatch ${res} ${size} ${count === 0 ? 'zero' : ''}`} title={RES_LABEL[res]}>
      <ResourceIcon res={res} size="100%" />
      {count !== undefined && <b className="badge">{count}</b>}
    </span>
  );
}

/** A parchment resource card, stacked when you hold several. */
export function ResCard({
  res,
  count,
  delta,
  deltaKey,
  onClick,
  selected,
  size = 'md',
  sub,
}: {
  res: Resource;
  count: number;
  delta?: number;
  deltaKey?: number;
  onClick?: () => void;
  selected?: boolean;
  size?: 'sm' | 'md';
  sub?: ReactNode;
}) {
  const stack = Math.min(3, Math.max(0, count - 1));
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`rcard ${res} ${size} ${count === 0 ? 'zero' : ''} ${selected ? 'selected' : ''} stack${stack}`}
      onClick={onClick}
      title={`${RES_LABEL[res]}: ${count}`}
      aria-label={`${RES_LABEL[res]}: ${count}`}
    >
      <span className="rcard-face">
        <span className="rcard-art">
          <ResourceIcon res={res} size="100%" />
        </span>
        <span className="rcard-name">{RES_LABEL[res]}</span>
      </span>
      <b className="rcard-count">{count}</b>
      {sub && <span className="rcard-sub">{sub}</span>}
      {!!delta && (
        <span key={deltaKey} className={`gain ${delta > 0 ? 'up' : 'down'}`}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </Tag>
  );
}

export function Cost({ cost }: { cost: ResMap }) {
  return (
    <span className="cost">
      {RESOURCES.flatMap((r) => Array.from({ length: cost[r] }, (_, i) => <ResSwatch key={`${r}${i}`} res={r} />))}
    </span>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div className={`modal parchment ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {onClose && (
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** Pick exactly `count` cards, optionally limited to what you have. */
export function ResPicker({
  count,
  limit,
  confirm,
  onConfirm,
}: {
  count: number;
  limit?: ResMap;
  confirm: string;
  onConfirm: (picked: ResMap) => void;
}) {
  const [picked, setPicked] = useState<ResMap>(emptyRes());
  const total = resTotal(picked);
  const bump = (r: Resource, d: number) =>
    setPicked((p) => {
      const n = p[r] + d;
      if (n < 0 || (limit && n > limit[r]) || (d > 0 && total >= count)) return p;
      return { ...p, [r]: n };
    });
  return (
    <div className="picker">
      <div className="picker-row">
        {RESOURCES.map((r) => (
          <div key={r} className="picker-cell">
            <ResCard res={r} count={picked[r]} onClick={() => bump(r, 1)} selected={picked[r] > 0} sub={limit ? `of ${limit[r]}` : undefined} />
            <button className="mini" onClick={() => bump(r, -1)} disabled={!picked[r]} aria-label={`Remove ${r}`}>
              −
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        {limit && (
          <button
            className="ghost-ink"
            onClick={() => {
              // Take from the biggest piles first.
              const left = { ...limit };
              const out = emptyRes();
              for (let i = 0; i < count; i++) {
                const r = [...RESOURCES].sort((a, b) => left[b] - left[a])[0];
                if (left[r] <= 0) break;
                left[r]--;
                out[r]++;
              }
              setPicked(out);
            }}
          >
            Pick for me
          </button>
        )}
        <button className="brass" disabled={total !== count} onClick={() => onConfirm(picked)}>
          {confirm} ({total}/{count})
        </button>
      </div>
    </div>
  );
}

export const resList = (m: ResMap): Resource[] => RESOURCES.flatMap((r) => Array<Resource>(m[r]).fill(r));
