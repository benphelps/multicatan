import { useState } from 'react';
import { MAX_PLAYERS, type LobbyView } from '../../shared/protocol.ts';
import { PLAYER_COLORS } from '../../shared/types.ts';
import { Avatar } from './avatars.tsx';
import { net } from './net.ts';

const TIMER_CHOICES = [30, 45, 60, 90, 120, 180, 0];

export function LobbyScreen({ lobby }: { lobby: LobbyView }) {
  const [chat, setChat] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?room=${lobby.code}`;
  const o = lobby.options;
  const set = (patch: Partial<typeof o>) => net.send({ t: 'setOptions', options: { ...o, ...patch } });
  const host = lobby.isHost;

  return (
    <main className="lobby">
      <header className="lobby-head wood">
        <h1 className="code">
          <span>Game</span> {lobby.code}
        </h1>
        <div className="invite">
          <code>{link}</code>
          <button
            className="brass sm"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
        </div>
      </header>

      <div className="lobby-grid">
        <section className="panel wood seats-panel">
          <h2>Settlers</h2>
          <ol className="seats">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => {
              const s = lobby.seats[i];
              return (
                <li key={i} className={`seat ${s ? '' : 'empty'}`} style={{ ['--pc' as string]: PLAYER_COLORS[i] }}>
                  {s ? <Avatar seat={i} color={PLAYER_COLORS[i]} size={44} /> : <span className="seat-ring" />}
                  <div className="seat-body">
                    {s ? (
                      <>
                        <b>
                          {s.name}
                          {s.isYou && <span className="tag">you</span>}
                        </b>
                        <small>{s.isHost ? 'Host' : s.isBot ? 'Bot settler' : s.connected ? 'Ready' : 'Reconnecting…'}</small>
                      </>
                    ) : (
                      <small>Open seat</small>
                    )}
                  </div>
                  {host && s && !s.isHost && (
                    <button className="link-light" onClick={() => net.send({ t: 'removeSeat', index: i })}>
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {host ? (
            <div className="row">
              <button className="wood-btn" onClick={() => net.send({ t: 'addBot' })} disabled={lobby.seats.length >= MAX_PLAYERS}>
                Add a bot
              </button>
              <button className="brass big grow" onClick={() => net.send({ t: 'start' })}>
                Set sail with {lobby.seats.length}
              </button>
            </div>
          ) : (
            <p className="muted">Waiting for the host to set sail…</p>
          )}
        </section>

        <section className="panel parchment">
          <h2>Rules of the voyage</h2>
          <div className="options">
            <label>
              <span>Map</span>
              <select value={o.layout} disabled={!host} onChange={(e) => set({ layout: e.target.value as typeof o.layout })}>
                <option value="random">Fair random islands</option>
                <option value="classic">Classic reference board</option>
              </select>
            </label>
            <label>
              <span>Rounds</span>
              <input type="number" min={5} max={200} value={o.rounds} disabled={!host} onChange={(e) => set({ rounds: Number(e.target.value) })} />
            </label>
            <label>
              <span>Seconds per round</span>
              <select value={o.roundSeconds} disabled={!host} onChange={(e) => set({ roundSeconds: Number(e.target.value) })}>
                {TIMER_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s ? `${s} s` : 'No timer'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Robber stays away until round</span>
              <input type="number" min={0} max={200} value={o.robberGraceRounds} disabled={!host} onChange={(e) => set({ robberGraceRounds: Number(e.target.value) })} />
            </label>
          </div>
          <p className="muted-ink small">
            The original ran 72 rounds and took 60–90 minutes. The browser version kept the robber away from home islands for the first 36 rolls.
          </p>
        </section>

        <section className="panel wood chat-panel">
          <h2>Harbor talk</h2>
          <div className="chat-lines">
            {!lobby.chat.length && <p className="muted small">Say hello while you wait.</p>}
            {lobby.chat.map((c, i) => (
              <p key={i}>
                <b>{c.name}</b> {c.text}
              </p>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (chat.trim()) net.send({ t: 'chat', text: chat, to: null });
              setChat('');
            }}
          >
            <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Message" maxLength={300} aria-label="Message" />
            <button type="submit" className="brass sm">
              Send
            </button>
          </form>
        </section>
      </div>
      <button className="link-light leave" onClick={() => net.send({ t: 'leave' })}>
        Leave this game
      </button>
    </main>
  );
}
