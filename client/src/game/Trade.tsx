import { useState } from 'react';
import { RESOURCES, ResMap, Resource, emptyRes, hasRes, resTotal } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { Avatar } from '../avatars.tsx';
import { Cost, ResCard } from '../ui.tsx';
import { act } from '../net.ts';
import { centerOf, setHint } from './anim.ts';

/** What a bank trade would look like for this give/want, or why it isn't one. */
function bankPlan(view: GameView, give: ResMap, want: ResMap): { ok: true; give: Resource; ratio: number } | { ok: false } {
  const kinds = RESOURCES.filter((r) => give[r] > 0);
  if (kinds.length !== 1) return { ok: false };
  const g = kinds[0];
  const ratio = view.me.ratios[g];
  const k = resTotal(want);
  if (k < 1 || want[g] > 0 || give[g] !== ratio * k) return { ok: false };
  return { ok: true, give: g, ratio };
}

export function TradeDrawer({ view, onClose }: { view: GameView; onClose: () => void }) {
  const me = view.me;
  const you = view.players[view.you];
  const [give, setGive] = useState<ResMap>(emptyRes());
  const [want, setWant] = useState<ResMap>(emptyRes());
  const [to, setTo] = useState<number | null>(null);
  const discovered = view.players.filter((p) => p.seat !== view.you && p.discovered);
  const playing = view.phase === 'playing';
  const bank = bankPlan(view, give, want);
  const canOffer = playing && discovered.length > 0 && resTotal(give) > 0 && resTotal(want) > 0 && hasRes(me.resources, give);

  const bump = (which: 'give' | 'want', r: Resource, d: number) => {
    const set = which === 'give' ? setGive : setWant;
    set((m) => {
      const n = Math.max(0, m[r] + d);
      if (which === 'give' && n > me.resources[r]) return m;
      if (n > 12) return m;
      return { ...m, [r]: n };
    });
    // A resource can't be on both sides.
    (which === 'give' ? setWant : setGive)((m) => (d > 0 && m[r] ? { ...m, [r]: 0 } : m));
  };
  const clear = () => {
    setGive(emptyRes());
    setWant(emptyRes());
  };

  return (
    <section className="trade-drawer parchment" aria-label="Trade">
      <header>
        <h3>Trade</h3>
        <button className="modal-x" onClick={onClose} aria-label="Close trade">
          ×
        </button>
      </header>
      <div className="trade-rows">
        <div className="trade-row">
          <span className="row-label">You give</span>
          {RESOURCES.map((r) => (
            <div key={r} className="trade-cell">
              <ResCard res={r} size="sm" count={give[r]} selected={give[r] > 0} onClick={() => bump('give', r, 1)} sub={`${me.ratios[r]}:1`} />
              <button className="mini" disabled={!give[r]} onClick={() => bump('give', r, -1)} aria-label={`Give one less ${r}`}>
                −
              </button>
            </div>
          ))}
        </div>
        <div className="trade-row">
          <span className="row-label">You get</span>
          {RESOURCES.map((r) => (
            <div key={r} className="trade-cell">
              <ResCard res={r} size="sm" count={want[r]} selected={want[r] > 0} onClick={() => bump('want', r, 1)} />
              <button className="mini" disabled={!want[r]} onClick={() => bump('want', r, -1)} aria-label={`Get one less ${r}`}>
                −
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="trade-foot">
        <div className="trade-targets" role="radiogroup" aria-label="Offer to">
          {discovered.length === 0 ? (
            <span className="muted-ink">Discover another settler to trade with them. The bank always trades.</span>
          ) : (
            <>
              <button role="radio" aria-checked={to === null} className={`chip ${to === null ? 'on' : ''}`} onClick={() => setTo(null)}>
                Everyone you've met
              </button>
              {discovered.map((p) => (
                <button key={p.seat} role="radio" aria-checked={to === p.seat} className={`chip ${to === p.seat ? 'on' : ''}`} onClick={() => setTo(p.seat)} title={p.name}>
                  <Avatar seat={p.seat} color={p.color} size={22} />
                  {p.name}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="trade-actions">
          <button className="ghost-ink" onClick={clear} disabled={!resTotal(give) && !resTotal(want)}>
            Clear
          </button>
          <button
            className="wood-btn"
            disabled={!playing || you.done || !bank.ok}
            title={bank.ok ? '' : 'Give 4 of one resource per card wanted (3 with a 3:1 harbor, 2 with a matching 2:1 harbor)'}
            onClick={(e) => {
              if (!bank.ok) return;
              const at = centerOf(e.currentTarget);
              if (at) setHint({ kind: 'bank', at });
              for (const r of RESOURCES) if (want[r] > 0) act({ type: 'bankTrade', give: bank.give, get: r, count: want[r] });
              clear();
            }}
          >
            Bank {bank.ok ? `${bank.ratio}:1` : ''}
          </button>
          <button
            className="brass"
            disabled={!canOffer}
            onClick={() => {
              act({ type: 'offerTrade', to, give, want });
              clear();
            }}
          >
            Offer
          </button>
        </div>
      </div>
    </section>
  );
}

export function OfferStack({ view }: { view: GameView }) {
  const me = view.me;
  const you = view.players[view.you];
  const offers = view.trades.filter((t) => t.from === view.you || !t.declined.includes(view.you));
  if (!offers.length) return null;
  return (
    <div className="offers" aria-label="Trade offers">
      {offers.slice(-4).map((t) => {
        const from = view.players[t.from];
        const mine = t.from === view.you;
        if (mine)
          return (
            <div key={t.id} className="offer parchment mine">
              <div className="offer-head">
                <span>
                  Your offer{t.to !== null && <> to {view.players[t.to].name}</>}
                </span>
                <button className="link-ink" onClick={() => act({ type: 'cancelTrade', id: t.id })}>
                  Withdraw
                </button>
              </div>
              <OfferLine give={t.give} want={t.want} />
              {t.accepted.length ? (
                <div className="acceptors">
                  {t.accepted.map((s) => {
                    const p = view.players[s];
                    return (
                      <button key={s} className="brass sm" onClick={() => act({ type: 'confirmTrade', id: t.id, with: s })}>
                        <Avatar seat={s} color={p.color} size={20} /> Trade with {p.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="muted-ink small">
                  Waiting for answers…{t.declined.length ? ` ${t.declined.length} declined.` : ''}
                </div>
              )}
            </div>
          );
        const accepted = t.accepted.includes(view.you);
        const afford = hasRes(me.resources, t.want);
        const bothDone = from.done && you.done;
        return (
          <div key={t.id} className="offer parchment" style={{ ['--pc' as string]: from.color }}>
            <div className="offer-head">
              <Avatar seat={from.seat} color={from.color} size={26} />
              <span>
                <b style={{ color: 'var(--pc)' }}>{from.name}</b> offers{t.to === view.you ? ' you' : ''}
              </span>
            </div>
            <OfferLine give={t.give} want={t.want} theirs />
            <div className="offer-actions">
              {accepted ? (
                <span className="muted-ink small">Accepted — waiting for {from.name}</span>
              ) : (
                <button className="brass sm" disabled={!afford || bothDone} onClick={() => act({ type: 'acceptTrade', id: t.id })} title={!afford ? "You don't have the cards they want" : bothDone ? 'You have both finished this round' : ''}>
                  Accept
                </button>
              )}
              <button className="ghost-ink sm" onClick={() => act({ type: 'declineTrade', id: t.id })}>
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OfferLine({ give, want, theirs }: { give: ResMap; want: ResMap; theirs?: boolean }) {
  return (
    <div className="offer-line">
      <span className="side">
        <small>{theirs ? 'You get' : 'You give'}</small>
        <Cost cost={give} />
      </span>
      <span className="arrow" aria-hidden>
        ⇄
      </span>
      <span className="side">
        <small>{theirs ? 'You give' : 'You get'}</small>
        <Cost cost={want} />
      </span>
    </div>
  );
}

