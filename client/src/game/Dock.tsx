import { useEffect, useRef, useState } from 'react';
import { COSTS, RESOURCES, ResMap } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { Avatar } from '../avatars.tsx';
import { GlyphName, Icon } from '../icons.tsx';
import { Cost, ResCard } from '../ui.tsx';
import type { Mode } from './Board.tsx';

interface Can {
  road: boolean;
  ship: boolean;
  settlement: boolean;
  city: boolean;
  dev: boolean;
  move: boolean;
  done: boolean;
}

export function Dock(props: {
  view: GameView;
  mode: Mode;
  can: Can;
  remaining: number | null;
  total: number;
  onToggle: (k: Mode['kind']) => void;
  onBuyDev: () => void;
  onKnight: () => void;
  onRoadBuilding: () => void;
  onDone: () => void;
  tradeOpen: boolean;
  onTrade: () => void;
  incoming: number;
}) {
  const { view, mode, can } = props;
  const me = view.me;
  const you = view.players[view.you];
  const free = me.freeBuilds > 0;
  const canAct = view.phase === 'playing' && !you.done;
  const knights = me.devCards.filter((d) => d.kind === 'knight').length;
  const roads = me.devCards.filter((d) => d.kind === 'roadBuilding').length;
  const vps = me.devCards.filter((d) => d.kind === 'victoryPoint').length;

  return (
    <footer className="dock wood">
      <Hand resources={me.resources} round={view.round} />

      <div className="devhand" aria-label="Development cards">
        <DevCard
          icon="knight"
          name="Knight"
          count={knights}
          hint={me.robberHex !== null ? 'Drive the robber off your island and take 1 resource from its hex' : 'Take 2 resources of your choice'}
          keyHint="K"
          onClick={canAct && knights ? props.onKnight : undefined}
          alert={me.robberHex !== null && knights > 0}
        />
        <DevCard icon="roadBuilding" name="Road building" count={roads} hint="Build 2 roads or ships for free" onClick={canAct && roads ? props.onRoadBuilding : undefined} />
        <DevCard icon="victoryPoint" name="Victory point" count={vps} hint="Counts toward your score automatically" />
      </div>

      <div className="buildbar" role="toolbar" aria-label="Build">
        <BuildTile icon="road" label="Road" keyHint="R" cost={COSTS.road} on={mode.kind === 'road'} enabled={can.road} free={free} color={you.color} onClick={() => props.onToggle('road')} />
        <BuildTile icon="ship" label="Ship" keyHint="S" cost={COSTS.ship} on={mode.kind === 'ship'} enabled={can.ship} free={free} color={you.color} onClick={() => props.onToggle('ship')} />
        <BuildTile
          icon="settlement"
          label="Settlement"
          keyHint="E"
          cost={COSTS.settlement}
          on={mode.kind === 'settlement'}
          enabled={can.settlement}
          color={you.color}
          note="1 VP · at most 5 on the board"
          onClick={() => props.onToggle('settlement')}
        />
        <BuildTile icon="city" label="City" keyHint="C" cost={COSTS.city} on={mode.kind === 'city'} enabled={can.city} color={you.color} note="+1 VP · doubles production" onClick={() => props.onToggle('city')} />
        <BuildTile icon="card" label="Dev card" keyHint="B" cost={COSTS.dev} enabled={can.dev} color="#d9c48f" note={`${me.deckLeft} left in your deck`} onClick={props.onBuyDev} />
        <BuildTile
          icon="moveShip"
          label="Move ship"
          keyHint="M"
          on={mode.kind === 'moveFrom' || mode.kind === 'moveTo'}
          enabled={can.move}
          color={you.color}
          note={me.canMoveShip ? 'One ship at an open end, every second round' : 'Available again next round'}
          onClick={() => props.onToggle('moveFrom')}
        />
        <BuildTile icon="trade" label="Trade" keyHint="T" on={props.tradeOpen} enabled={view.phase === 'playing'} color="var(--brass-hi)" badge={props.incoming} note="Bank, harbors and other settlers" onClick={props.onTrade} />
      </div>

      <DoneButton view={view} enabled={can.done} remaining={props.remaining} total={props.total} onDone={props.onDone} />
    </footer>
  );
}

function Hand({ resources, round }: { resources: ResMap; round: number }) {
  const prev = useRef<ResMap | null>(null);
  const [gains, setGains] = useState<{ key: number; diff: Partial<ResMap> } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { ...resources };
    if (!p) return;
    const diff: Partial<ResMap> = {};
    let any = false;
    for (const r of RESOURCES)
      if (resources[r] !== p[r]) {
        diff[r] = resources[r] - p[r];
        any = true;
      }
    if (!any) return;
    const key = Date.now();
    setGains({ key, diff });
    const t = setTimeout(() => setGains((g) => (g?.key === key ? null : g)), 1800);
    return () => clearTimeout(t);
  }, [resources, round]);

  const total = RESOURCES.reduce((s, r) => s + resources[r], 0);
  return (
    <div className="hand" aria-label="Your resources">
      {RESOURCES.map((r) => (
        <ResCard key={r} res={r} count={resources[r]} delta={gains?.diff[r]} deltaKey={gains?.key} />
      ))}
      <div className={`hand-total ${total > 7 ? 'risky' : ''}`} title={total > 7 ? 'More than 7 cards: a 7 will cost you half' : 'Cards in hand'}>
        <b>{total}</b>
        <small>{total > 7 ? 'at risk' : 'cards'}</small>
      </div>
    </div>
  );
}

function DevCard({ icon, name, count, hint, onClick, keyHint, alert }: { icon: GlyphName; name: string; count: number; hint: string; onClick?: () => void; keyHint?: string; alert?: boolean }) {
  return (
    <button className={`devcard ${count ? '' : 'none'} ${alert ? 'alert' : ''}`} data-kind={icon} disabled={!onClick} onClick={onClick} aria-label={`${name}: ${count}`}>
      <Icon name={icon} size={26} className={`dv ${icon}`} />
      <b className="dev-count">{count}</b>
      <span className="tip">
        <strong>
          {name}
          {keyHint && <kbd>{keyHint}</kbd>}
        </strong>
        {hint}
      </span>
    </button>
  );
}

function BuildTile(props: {
  icon: GlyphName;
  label: string;
  keyHint: string;
  cost?: ResMap;
  on?: boolean;
  enabled: boolean;
  free?: boolean;
  color: string;
  note?: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className={`tile ${props.on ? 'on' : ''}`} disabled={!props.enabled && !props.on} onClick={props.onClick} aria-pressed={props.on} aria-label={props.label}>
      <Icon name={props.icon} size={28} style={{ color: props.color }} />
      <span className="tile-label">{props.label}</span>
      {props.free && <span className="free-tag">free</span>}
      {!!props.badge && <span className="count-badge">{props.badge}</span>}
      <span className="tip">
        <strong>
          {props.label}
          <kbd>{props.keyHint}</kbd>
        </strong>
        {props.cost && (props.free ? <em>Free right now</em> : <Cost cost={props.cost} />)}
        {props.note && <span>{props.note}</span>}
      </span>
    </button>
  );
}

function DoneButton({ view, enabled, remaining, total, onDone }: { view: GameView; enabled: boolean; remaining: number | null; total: number; onDone: () => void }) {
  const you = view.players[view.you];
  const waiting = view.players.filter((p) => !p.done && p.seat !== view.you);
  const frac = remaining !== null && total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 1;
  const low = remaining !== null && remaining <= 10;
  const R = 42;
  const C = 2 * Math.PI * R;
  const secs = remaining === null ? null : Math.ceil(remaining);
  const ended = view.phase === 'ended';
  return (
    <div className="done-wrap">
      {!ended && waiting.length > 0 && (you.done || view.phase === 'setup') && (
        <div className="waiting-on" aria-label="Still building">
          {waiting.slice(0, 5).map((p) => (
            <Avatar key={p.seat} seat={p.seat} color={p.color} size={24} fogged={!p.discovered} title={`${p.name} is still building`} />
          ))}
        </div>
      )}
      <button className={`done-btn ${you.done ? 'is-done' : ''} ${low ? 'low' : ''}`} disabled={!enabled} onClick={onDone} aria-label={you.done ? 'Waiting for others' : 'Done — end your round'}>
        <svg viewBox="0 0 100 100" className="ring" aria-hidden>
          <circle cx="50" cy="50" r={R} className="ring-track" />
          <circle cx="50" cy="50" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 50 50)" />
        </svg>
        <span className="done-face">
          {you.done && !ended ? (
            <>
              <svg className="done-check" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="done-sub">{view.phase === 'setup' ? 'ready' : 'waiting'}</span>
            </>
          ) : (
            <span className="done-label">{ended ? 'Over' : 'Done'}</span>
          )}
          {secs !== null && !ended && (
            <span className="done-time">
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
          )}
          {secs === null && !ended && !you.done && <kbd>Enter</kbd>}
        </span>
      </button>
    </div>
  );
}
