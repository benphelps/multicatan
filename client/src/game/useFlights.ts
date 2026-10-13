import { MutableRefObject, useEffect, useRef } from 'react';
import { GEO } from '../../../shared/board.ts';
import { DevCard, RESOURCES, ResMap, TERRAIN_RESOURCE, emptyRes } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { Pt, centerOf, els, fly, takeHint } from './anim.ts';
import type { BoardApi } from './Board.tsx';
import { DICE_SETTLE_MS } from './DiceRoll.tsx';

const STEP = 75; // ms between tokens in a burst

/**
 * Watches your hand and dev cards between server updates and sends tokens flying to explain each
 * change: production from the rolled hexes, costs to whatever you built, trades to and from the
 * other player's portrait, and so on.
 */
export function useFlights(view: GameView, board: MutableRefObject<BoardApi | null>) {
  const prev = useRef<{ res: ResMap; round: number; logId: number; dev: DevCard[] } | null>(null);

  useEffect(() => {
    const p = prev.current;
    const cur = { res: { ...view.me.resources }, round: view.round, logId: view.log[view.log.length - 1]?.id ?? 0, dev: view.me.devCards };
    prev.current = cur;
    if (!p) return;
    const api = board.current;

    const gains = emptyRes();
    const losses = emptyRes();
    for (const r of RESOURCES) {
      const d = cur.res[r] - p.res[r];
      if (d > 0) gains[r] = d;
      if (d < 0) losses[r] = -d;
    }
    const changed = RESOURCES.some((r) => gains[r] || losses[r]) || cur.dev.length !== p.dev.length;
    if (!changed) return;

    // Big bursts (a long trade, a treasure, a discard) squeeze together so they don't drag on.
    const total = RESOURCES.reduce((s, r) => s + gains[r] + losses[r], 0);
    const step = Math.max(28, Math.min(STEP, 1100 / Math.max(1, total)));
    let delay = 0;
    const toHand = (r: (typeof RESOURCES)[number], from: Pt | null) => {
      const card = els.handCard(r);
      const to = centerOf(card);
      if (!from || !to) return;
      fly({ what: { res: r }, from, to, delay, land: card });
      delay += step;
    };
    const fromHand = (r: (typeof RESOURCES)[number], to: Pt | null, fade: boolean, land?: Element | null) => {
      const from = centerOf(els.handCard(r));
      if (!from || !to) return;
      fly({ what: { res: r }, from, to, delay, fade, land });
      delay += step;
    };

    // 1. Production: each producing hex next to your buildings sends its resources.
    if (view.round !== p.round && view.dice && api && view.phase === 'playing') {
      const roll = view.dice[0] + view.dice[1];
      delay = DICE_SETTLE_MS; // wait for the dice to land
      view.hexes.forEach((hex, h) => {
        if (!hex || hex.number !== roll || view.robbers.includes(h)) return;
        const res = TERRAIN_RESOURCE[hex.terrain];
        if (!res) return;
        for (const v of GEO.hexes[h].vertices) {
          const b = view.buildings.find((x) => x.vertex === v && x.owner === view.you);
          if (!b) continue;
          for (let i = 0; i < (b.kind === 'city' ? 2 : 1) && gains[res] > 0; i++) {
            toHand(res, api.hex(h));
            gains[res]--;
          }
        }
      });
      delay = 0;
    }

    // 2. Work out where everything else came from or went to.
    const hint = takeHint();
    const newLogs = view.log.filter((l) => l.id > p.logId);
    const trade = newLogs.find((l) => / traded /.test(l.text) && l.to?.includes(view.you) && !l.text.startsWith('You traded'));
    const partner = trade ? view.players.find((q) => q.seat !== view.you && trade.text.includes(q.name)) : undefined;
    const boardCenter = api?.center() ?? null;
    let source: Pt | null = boardCenter;
    let sink: Pt | null = boardCenter;
    let sinkEl: Element | null = null;
    let fade = true;
    if (partner) {
      sinkEl = els.player(partner.seat);
      source = sink = centerOf(sinkEl);
      fade = false;
    } else if (hint && hint.kind !== 'discard') {
      source = sink = hint.at;
      if (hint.kind === 'knight') sink = boardCenter;
    }

    for (const r of RESOURCES) for (let i = 0; i < gains[r]; i++) toHand(r, source);
    delay = Math.max(0, delay - step * 2);
    for (const r of RESOURCES) for (let i = 0; i < losses[r]; i++) fromHand(r, sink, fade, sinkEl);

    // 3. Development cards: bought cards fly into the hand, played ones fly onto the board.
    if (cur.dev.length > p.dev.length) {
      const added = cur.dev.slice(p.dev.length);
      const from = centerOf(els.tile('Dev card'));
      added.forEach((d, i) => {
        const slot = els.devSlot(d.kind);
        const to = centerOf(slot);
        if (from && to) fly({ what: { dev: 'back' }, from, to, delay: delay + i * 120, land: slot, dur: 650 });
      });
    } else if (cur.dev.length < p.dev.length) {
      const count = (ds: DevCard[], k: string) => ds.filter((d) => d.kind === k).length;
      for (const k of ['knight', 'roadBuilding'] as const) {
        if (count(cur.dev, k) < count(p.dev, k)) {
          const from = centerOf(els.devSlot(k));
          const to = k === 'knight' && hint?.kind === 'knight' ? hint.at : boardCenter;
          if (from && to) fly({ what: { dev: k }, from, to, delay: 0, fade: true, dur: 700 });
        }
      }
    }
  }, [view, board]);
}
