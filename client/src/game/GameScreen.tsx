import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COSTS, RESOURCES, ResMap, hasRes } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { act } from '../net.ts';
import { sound } from '../sound.ts';
import { centerOf, els, setHint } from './anim.ts';
import { Board, BoardApi, Mode } from './Board.tsx';
import { Corner } from './Corner.tsx';
import { DICE_SETTLE_MS, DiceRoll } from './DiceRoll.tsx';
import { Dialogs, EndScreen, RulesDialog } from './Dialogs.tsx';
import { Dock } from './Dock.tsx';
import { FlyLayer } from './FlyLayer.tsx';
import { Rail } from './Rail.tsx';
import { Toasts, useToasts } from './Toasts.tsx';
import { OfferStack, TradeDrawer } from './Trade.tsx';
import { useFlights } from './useFlights.ts';

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const SETUP_HINTS = [
  'Place your first settlement on your home island',
  'Add a road or a ship beside it',
  'Place your second settlement — it pays one resource per neighbouring hex',
  'Add a road or a ship beside it',
  'Choose which settlement becomes your city',
  'Waiting for the other settlers to finish setting up…',
];

export function GameScreen({ view, clockOffset }: { view: GameView; clockOffset: number }) {
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [centerKey, setCenterKey] = useState(0);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [knightChoice, setKnightChoice] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const firstRound = useRef(view.round); // rounds after this one were rolled while we watched
  const [settling, setSettling] = useState(false); // dice still in the air
  const zoomRef = useRef<((f: number) => void) | null>(null);
  const boardApi = useRef<BoardApi | null>(null);
  const toasts = useToasts();
  const now = useNow();

  const me = view.me;
  const you = view.players[view.you];
  const setup = view.phase === 'setup';
  useFlights(view, boardApi);
  const blocked = me.pendingDiscard > 0 || me.pendingGold > 0 || me.pendingHarbor > 0;
  const canAct = view.phase === 'playing' && !you.done && !blocked;
  const free = me.freeBuilds > 0;

  const effectiveMode: Mode = setup
    ? me.setupStep === 0 || me.setupStep === 2
      ? { kind: 'settlement' }
      : me.setupStep === 1 || me.setupStep === 3
        ? { kind: 'route' }
        : me.setupStep === 4
          ? { kind: 'city' }
          : { kind: 'none' }
    : canAct
      ? mode
      : { kind: 'none' };

  useEffect(() => {
    if (!canAct && mode.kind !== 'none') setMode({ kind: 'none' });
  }, [canAct, mode.kind]);
  // Placing free roads/ships: stay in a route mode until they're used up.
  useEffect(() => {
    if (canAct && free && mode.kind === 'none') setMode({ kind: view.legal.roads.length ? 'road' : 'ship' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.freeBuilds, canAct]);

  // ---- new round: dice sound, highlight the rolled number ----
  const roll = view.dice ? view.dice[0] + view.dice[1] : null;
  const freshRoll = view.phase === 'playing' && view.round !== firstRound.current;
  useLayoutEffect(() => {
    if (!freshRoll || roll === null) return;
    setMode({ kind: 'none' });
    setSettling(true);
    const timers = [
      setTimeout(() => sound.roll(), 300), // the dice hit the table
      setTimeout(() => setHighlight(roll), DICE_SETTLE_MS - 100),
      setTimeout(() => setSettling(false), DICE_SETTLE_MS + 300),
      setTimeout(() => setHighlight(null), DICE_SETTLE_MS + 3000),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.round]);

  // ---- toasts for things that happen to you ----
  const lastLog = useRef<number | null>(null);
  useEffect(() => {
    const newest = view.log[view.log.length - 1]?.id ?? 0;
    if (lastLog.current === null) {
      lastLog.current = newest;
      return;
    }
    for (const l of view.log) {
      if (l.id <= lastLog.current) continue;
      const mine = l.to?.includes(view.you);
      if (mine && /discovered/.test(l.text)) {
        toasts.push(l.text, 'discover');
        sound.chime();
      } else if (mine && /Treasure/.test(l.text)) {
        toasts.push(l.text, 'treasure');
        sound.coin();
      } else if (mine && /robber/i.test(l.text)) toasts.push(l.text, 'robber');
      else if (mine && /traded/.test(l.text)) {
        toasts.push(l.text, 'trade');
        sound.coin();
      } else if (!l.to && /(now holds|special VP|Game over)/.test(l.text)) toasts.push(l.text, 'award');
    }
    lastLog.current = newest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log]);

  // ---- chime on incoming offers ----
  const seenOffers = useRef(new Set<number>());
  useEffect(() => {
    for (const t of view.trades)
      if (!seenOffers.current.has(t.id)) {
        seenOffers.current.add(t.id);
        if (t.from !== view.you) sound.chime();
      }
  }, [view.trades, view.you]);

  // ---- timer ----
  const remaining = view.deadline ? Math.max(0, (view.deadline - (now + clockOffset)) / 1000) : null;
  const total = setup ? view.options.setupSeconds : view.options.roundSeconds;
  const lastTick = useRef(-1);
  useEffect(() => {
    if (remaining === null || you.done) return;
    const s = Math.ceil(remaining);
    if (s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      sound.tick();
    }
  }, [remaining, you.done]);

  // ---- actions ----
  const afford = (cost: ResMap) => hasRes(me.resources, cost);
  const toggle = (kind: Mode['kind']) => setMode((m) => (m.kind === kind ? { kind: 'none' } : ({ kind } as Mode)));
  const can = {
    road: canAct && (free || afford(COSTS.road)) && view.legal.roads.length > 0,
    ship: canAct && (free || afford(COSTS.ship)) && view.legal.ships.length > 0,
    settlement: canAct && afford(COSTS.settlement) && view.legal.settlements.length > 0,
    city: canAct && afford(COSTS.city) && view.legal.cities.length > 0,
    dev: canAct && afford(COSTS.dev) && me.deckLeft > 0,
    move: canAct && Object.keys(view.legal.shipMoves).length > 0,
    done: canAct && !free,
  };

  const onVertex = (v: number) => {
    sound.build();
    const at = boardApi.current?.vertex(v);
    if (at) setHint({ kind: 'spend', at });
    if (setup) act(me.setupStep === 4 ? { type: 'setupCity', vertex: v } : { type: 'setupSettlement', vertex: v });
    else if (effectiveMode.kind === 'settlement') act({ type: 'buildSettlement', vertex: v });
    else if (effectiveMode.kind === 'city') act({ type: 'buildCity', vertex: v });
    if (!setup) setMode({ kind: 'none' });
  };
  const onEdge = (e: number, kind: 'road' | 'ship') => {
    sound.build();
    const at = boardApi.current?.edge(e);
    if (at) setHint({ kind: 'spend', at });
    if (setup) return act({ type: 'setupRoute', edge: e, kind });
    act({ type: 'buildRoute', edge: e, kind });
    const left = { ...me.resources };
    if (!free) RESOURCES.forEach((r) => (left[r] -= COSTS[kind][r]));
    if (me.freeBuilds <= 1 && !hasRes(left, COSTS[kind])) setMode({ kind: 'none' });
  };
  const onShip = (e: number) => {
    if (effectiveMode.kind === 'moveFrom') setMode({ kind: 'moveTo', from: e });
    else if (effectiveMode.kind === 'moveTo') {
      sound.build();
      const at = boardApi.current?.edge(e);
      if (at) setHint({ kind: 'spend', at });
      act({ type: 'moveShip', from: effectiveMode.from, to: e });
      setMode({ kind: 'none' });
    }
  };
  const playKnight = () => {
    const at = (me.robberHex !== null ? boardApi.current?.hex(me.robberHex) : null) ?? boardApi.current?.center();
    if (at) setHint({ kind: 'knight', at });
    if (me.robberHex !== null) act({ type: 'playKnight' });
    else setKnightChoice(true);
  };
  const buyDev = () => {
    const at = centerOf(els.tile('Dev card'));
    if (at) setHint({ kind: 'spend', at });
    sound.coin();
    act({ type: 'buyDev' });
  };

  // ---- keyboard shortcuts ----
  const keys = useRef<Record<string, () => void>>({});
  keys.current = {
    r: () => can.road && toggle('road'),
    s: () => can.ship && toggle('ship'),
    e: () => can.settlement && toggle('settlement'),
    c: () => can.city && toggle('city'),
    b: () => can.dev && buyDev(),
    m: () => can.move && toggle('moveFrom'),
    t: () => setTradeOpen((o) => !o),
    k: () => canAct && me.devCards.some((d) => d.kind === 'knight') && playKnight(),
    h: () => setCenterKey((k) => k + 1),
    '+': () => zoomRef.current?.(1.2),
    '=': () => zoomRef.current?.(1.2),
    '-': () => zoomRef.current?.(1 / 1.2),
    Enter: () => can.done && act({ type: 'endTurn' }),
    Escape: () => {
      setMode({ kind: 'none' });
      setTradeOpen(false);
      setRulesOpen(false);
    },
    '?': () => setRulesOpen((o) => !o),
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : document.body;
      if (e.key === 'Escape' && el.closest('input, textarea, select')) {
        el.blur();
        keys.current.Escape();
        return;
      }
      if (el.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const f = keys.current[e.key] ?? keys.current[e.key.toLowerCase()];
      if (f) {
        e.preventDefault();
        f();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- instruction pill ----
  const waitingFor = view.players.filter((p) => !p.done).length;
  const hint = useMemo(() => {
    if (view.phase === 'ended') return null;
    if (setup) return SETUP_HINTS[me.setupStep];
    if (me.pendingDiscard) return `The robber strikes — discard ${me.pendingDiscard} cards`;
    if (you.done) return waitingFor ? `Waiting for ${waitingFor} settler${waitingFor > 1 ? 's' : ''}… you can still accept trades` : 'Rolling the dice…';
    if (free) return `Place ${me.freeBuilds} free road${me.freeBuilds > 1 ? 's' : ''} or ship${me.freeBuilds > 1 ? 's' : ''}`;
    switch (effectiveMode.kind) {
      case 'settlement':
        return 'Pick a glowing corner for your settlement';
      case 'city':
        return 'Pick a settlement to upgrade';
      case 'road':
        return 'Pick an edge for your road';
      case 'ship':
        return 'Pick an edge for your ship';
      case 'moveFrom':
        return 'Pick a ship at the open end of a route';
      case 'moveTo':
        return 'Pick where the ship sails to';
    }
    return null;
  }, [view.phase, setup, me, you.done, waitingFor, free, effectiveMode.kind]);

  const incoming = view.trades.filter((t) => t.from !== view.you && !t.declined.includes(view.you)).length;

  return (
    <div className={`game ${view.phase}`}>
      <main className="stage">
        <Board
          view={view}
          mode={effectiveMode}
          onVertex={onVertex}
          onEdge={onEdge}
          onShip={onShip}
          centerKey={centerKey}
          highlight={highlight}
          zoomRef={zoomRef}
          apiRef={boardApi}
        />
        {hint && (
          <div className={`pill ${setup ? 'setup' : ''} ${effectiveMode.kind !== 'none' ? 'mode' : ''}`} role="status">
            {hint}
            {!setup && effectiveMode.kind !== 'none' && (
              <button className="pill-x" onClick={() => setMode({ kind: 'none' })} aria-label="Cancel">
                Esc
              </button>
            )}
          </div>
        )}
        <Corner view={view} onRules={() => setRulesOpen(true)} onCenter={() => setCenterKey((k) => k + 1)} />
        {view.dice && view.phase !== 'setup' && <DiceRoll key={view.round} dice={view.dice} animate={freshRoll} />}
        <Toasts toasts={toasts.list} players={view.players} />
        <OfferStack view={view} />
        <div className="map-controls">
          <button onClick={() => zoomRef.current?.(1.25)} aria-label="Zoom in" title="Zoom in (+)">
            +
          </button>
          <button onClick={() => zoomRef.current?.(0.8)} aria-label="Zoom out" title="Zoom out (−)">
            −
          </button>
          <button onClick={() => setCenterKey((k) => k + 1)} aria-label="Center on my island" title="Center on my island (H)" className="home-btn">
            ⌂
          </button>
        </div>
      </main>
      <Rail view={view} />
      <Dock
        view={view}
        mode={effectiveMode}
        can={can}
        remaining={remaining}
        total={total}
        onToggle={toggle}
        onBuyDev={buyDev}
        onKnight={playKnight}
        onRoadBuilding={() => act({ type: 'playRoadBuilding' })}
        onDone={() => act({ type: 'endTurn' })}
        tradeOpen={tradeOpen}
        onTrade={() => setTradeOpen((o) => !o)}
        incoming={incoming}
      />
      {tradeOpen && <TradeDrawer view={view} onClose={() => setTradeOpen(false)} />}
      {/* Let the dice land before the robber demands cards. */}
      {(!settling || !me.pendingDiscard) && <Dialogs view={view} knightChoice={knightChoice} onKnightDone={() => setKnightChoice(false)} />}
      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
      {view.phase === 'ended' && <EndScreen view={view} />}
      <FlyLayer />
    </div>
  );
}
