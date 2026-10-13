import { useState } from 'react';
import { RESOURCES } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { Avatar } from '../avatars.tsx';
import { act, net } from '../net.ts';
import { setHint } from './anim.ts';
import { RulesList } from '../RulesList.tsx';
import { Modal, RES_LABEL, ResCard, ResPicker, resList } from '../ui.tsx';

export function Dialogs({ view, knightChoice, onKnightDone }: { view: GameView; knightChoice: boolean; onKnightDone: () => void }) {
  const me = view.me;
  if (me.pendingDiscard > 0)
    return (
      <Modal title="The robber strikes">
        <p>You hold more than 7 cards. Choose {me.pendingDiscard} to give up.</p>
        <ResPicker count={me.pendingDiscard} limit={me.resources} confirm="Discard" onConfirm={(res) => {
            setHint({ kind: 'discard' });
            act({ type: 'discard', res });
          }} />
      </Modal>
    );
  if (me.pendingGold > 0)
    return (
      <Modal title="Treasure! Choose 2 resources">
        <ResPicker
          count={2}
          confirm="Take them"
          onConfirm={(res) => {
            const l = resList(res);
            act({ type: 'chooseGold', res: [l[0], l[1]] });
          }}
        />
      </Modal>
    );
  if (me.pendingHarbor > 0)
    return (
      <Modal title="Choose your 2:1 harbor">
        <p>For the rest of the game you can trade 2 of this resource for any 1 other at the bank.</p>
        <div className="picker-row">
          {RESOURCES.map((r) => (
            <ResCard key={r} res={r} count={me.resources[r]} onClick={me.harbor2.includes(r) ? undefined : () => act({ type: 'chooseHarbor', res: r })} sub={me.harbor2.includes(r) ? 'have it' : RES_LABEL[r]} />
          ))}
        </div>
      </Modal>
    );
  if (knightChoice)
    return (
      <Modal title="Knight: take 2 resources" onClose={onKnightDone}>
        <p>No robber on your island, so your knight brings back 2 resources of your choice.</p>
        <ResPicker
          count={2}
          confirm="Play knight"
          onConfirm={(res) => {
            const l = resList(res);
            act({ type: 'playKnight', choice: [l[0], l[1]] });
            onKnightDone();
          }}
        />
      </Modal>
    );
  return null;
}

const SHORTCUTS: [string, string][] = [
  ['R', 'Build a road'],
  ['S', 'Build a ship'],
  ['E', 'Build a settlement'],
  ['C', 'Upgrade to a city'],
  ['B', 'Buy a development card'],
  ['K', 'Play a knight'],
  ['M', 'Move a ship'],
  ['T', 'Open trading'],
  ['Enter', 'Done for this round'],
  ['Esc', 'Cancel'],
  ['H', 'Center on your island'],
  ['+ / −', 'Zoom'],
];

export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How Multicatan works" onClose={onClose} wide>
      <div className="rules-grid">
        <RulesList />
        <div>
          <h3>Shortcuts</h3>
          <dl className="shortcuts">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="muted-ink small">Drag the sea to sail around the world — it wraps all the way round. Scroll or pinch to zoom.</p>
        </div>
      </div>
    </Modal>
  );
}

export function EndScreen({ view }: { view: GameView }) {
  const [hidden, setHidden] = useState(false);
  const ranking = view.ranking ?? [];
  if (hidden)
    return (
      <button className="brass show-results" onClick={() => setHidden(false)}>
        Show results
      </button>
    );
  const podium = ranking.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter((s) => s !== undefined);
  return (
    <Modal title="Final standings" wide>
      <div className="podium">
        {order.map((seat) => {
          const p = view.players[seat];
          const place = ranking.indexOf(seat);
          return (
            <div key={seat} className={`step place${place + 1}`} style={{ ['--pc' as string]: p.color }}>
              <Avatar seat={seat} color={p.color} size={place === 0 ? 76 : 58} />
              <b>{p.name}</b>
              <span className="podium-vp">{p.score?.vp} VP</span>
              <div className="block">{place + 1}</div>
            </div>
          );
        })}
      </div>
      <table className="results">
        <thead>
          <tr>
            <th></th>
            <th>Settler</th>
            <th>VP</th>
            <th title="Settlements">Settl.</th>
            <th title="Cities (2 VP each)">Cities</th>
            <th title="Bonus points for settling other islands">Islands</th>
            <th title="Victory point cards">VP cards</th>
            <th title="Longest route and largest army">Awards</th>
            <th title="Tiebreak: cards in hand">Hand</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((seat, i) => {
            const p = view.players[seat];
            const s = p.score!;
            return (
              <tr key={seat} style={{ ['--pc' as string]: p.color }}>
                <td>{i + 1}</td>
                <td className="who-cell">
                  <Avatar seat={seat} color={p.color} size={22} /> {p.name}
                </td>
                <td>
                  <b>{s.vp}</b>
                </td>
                <td>{s.settlements}</td>
                <td>{s.cities}</td>
                <td>{s.islands}</td>
                <td>{s.vpCards}</td>
                <td>{s.longest + s.army}</td>
                <td>{p.cards}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row end-actions">
        <button className="ghost-ink" onClick={() => setHidden(true)}>
          Look at the world
        </button>
        <button className="brass" onClick={() => net.send({ t: 'leave' })}>
          Back to the harbor
        </button>
      </div>
    </Modal>
  );
}
