import { useEffect, useRef, useState } from 'react';
import type { GameView, PlayerView } from '../../../shared/view.ts';
import { Avatar } from '../avatars.tsx';
import { Icon } from '../icons.tsx';
import { net } from '../net.ts';
import { RichText } from '../RichText.tsx';

export function Rail({ view }: { view: GameView }) {
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const lastChat = view.chat[view.chat.length - 1];
  const [seenChat, setSeenChat] = useState(lastChat?.id ?? 0);
  useEffect(() => {
    if (tab === 'chat' && lastChat) setSeenChat(lastChat.id);
  }, [tab, lastChat]);
  const unread = !!lastChat && lastChat.id > seenChat && lastChat.from !== view.you;
  const ordered = [view.players[view.you], ...view.players.filter((p) => p.seat !== view.you)];

  return (
    <aside className="rail wood">
      <ul className="pcards">
        {ordered.map((p) => (
          <PlayerCard key={p.seat} p={p} you={p.seat === view.you} phase={view.phase} rank={view.ranking?.indexOf(p.seat)} />
        ))}
      </ul>
      <div className="rail-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          Log
        </button>
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          Chat{unread && <span className="dot-badge" aria-label="new messages" />}
        </button>
      </div>
      <div className="rail-body">{tab === 'log' ? <LogPanel view={view} /> : <ChatPanel view={view} />}</div>
    </aside>
  );
}

function PlayerCard({ p, you, phase, rank }: { p: PlayerView; you: boolean; phase: GameView['phase']; rank?: number }) {
  const status = !p.connected ? 'away' : phase === 'ended' ? (rank === 0 ? 'winner' : '') : p.done ? (phase === 'setup' ? 'ready' : 'done') : 'building';
  const label = { away: 'Away', winner: 'Winner', ready: 'Ready', done: 'Done', building: phase === 'setup' ? 'Setting up' : 'Building', '': '' }[status];
  return (
    <li className={`pcard ${you ? 'me' : ''} ${p.discovered ? '' : 'fog'} ${p.done ? 'is-done' : ''}`} data-seat={p.seat} style={{ ['--pc' as string]: p.color }}>
      <div className="pcard-portrait">
        <Avatar seat={p.seat} color={p.color} size={46} fogged={!p.discovered} title={p.name} />
        <span className={`status-dot ${status}`} aria-hidden />
      </div>
      <div className="pcard-body">
        <div className="pcard-name">
          <span className="nm">{p.name}</span>
          {you && <span className="tag">you</span>}
          {p.isBot && <span className="tag">bot</span>}
        </div>
        <div className={`pcard-status ${status}`}>{label}</div>
        {p.discovered ? (
          <div className="pcard-stats">
            <span title="Resource cards in hand">
              <Icon name="card" size={14} className="si res" />
              {p.cards}
            </span>
            <span title="Development cards">
              <Icon name="card" size={14} className="si dev" />
              {p.devCards}
            </span>
            <span title="Knights played" className={p.hasArmy ? 'award' : ''}>
              <Icon name="knight" size={14} className="si" />
              {p.knights}
            </span>
            <span title="Longest trade route" className={p.hasLongest ? 'award' : ''}>
              <Icon name="road" size={14} className="si" />
              {p.longest}
            </span>
          </div>
        ) : (
          <div className="pcard-stats uncharted">Uncharted waters</div>
        )}
      </div>
      <div className="pcard-vp" title="Victory points">
        <b>{p.discovered ? p.vp : '?'}</b>
        <small>VP</small>
      </div>
      {(p.hasLongest || p.hasArmy) && (
        <div className="ribbons">
          {p.hasLongest && <span className="ribbon">Longest route</span>}
          {p.hasArmy && <span className="ribbon">Largest army</span>}
        </div>
      )}
    </li>
  );
}

/** Keep a scroll container pinned to its newest entry. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function LogPanel({ view }: { view: GameView }) {
  const ref = useStickToBottom(view.log[view.log.length - 1]?.id);
  let lastRound = -1;
  return (
    <div className="log" ref={ref}>
      {view.log.map((l) => {
        const header = l.round !== lastRound && l.round > 0;
        lastRound = l.round;
        return (
          <div key={l.id}>
            {header && <div className="log-round">Round {l.round}</div>}
            <p className={l.to ? 'private' : ''}>
              <RichText text={l.text} players={view.players} />
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ChatPanel({ view }: { view: GameView }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState<number | null>(null);
  const ref = useStickToBottom(view.chat[view.chat.length - 1]?.id);
  return (
    <div className="chat">
      <div className="chat-lines" ref={ref}>
        {!view.chat.length && <p className="muted small">Messages reach every settler, even ones you haven't discovered. Pick a name to whisper.</p>}
        {view.chat.map((c) => {
          const from = view.players[c.from];
          return (
            <div key={c.id} className={`msg ${c.from === view.you ? 'mine' : ''} ${c.to !== null ? 'whisper' : ''}`}>
              <Avatar seat={from.seat} color={from.color} size={22} />
              <div>
                <b style={{ color: from.color }}>{from.name}</b>
                {c.to !== null && <span className="muted"> → {c.to === view.you ? 'you' : view.players[c.to].name}</span>}
                <p>{c.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) net.send({ t: 'chat', text, to });
          setText('');
        }}
      >
        <select value={to ?? ''} onChange={(e) => setTo(e.target.value === '' ? null : Number(e.target.value))} aria-label="Send to">
          <option value="">All</option>
          {view.players
            .filter((p) => p.seat !== view.you)
            .map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.name}
              </option>
            ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={300} aria-label="Message" />
        <button type="submit" className="brass sm">
          Send
        </button>
      </form>
    </div>
  );
}
