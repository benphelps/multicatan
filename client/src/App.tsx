import { useEffect, useState } from 'react';
import { GameScreen } from './game/GameScreen.tsx';
import { IconSheet } from './IconSheet.tsx';
import { LobbyScreen } from './LobbyScreen.tsx';
import { MapBackdrop } from './MapBackdrop.tsx';
import { net, saveName, savedName, token, useNet } from './net.ts';
import { RulesList } from './RulesList.tsx';

export function App() {
  if (new URLSearchParams(location.search).has('icons')) return <IconSheet />;
  return <Root />;
}

function Root() {
  const state = useNet();
  const err = state.error;

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => net.clearError(), 4000);
    return () => clearTimeout(t);
  }, [err]);

  return (
    <>
      {state.view ? (
        <GameScreen view={state.view} clockOffset={state.clockOffset} />
      ) : (
        <div className="harbor">
          <MapBackdrop />
          {state.lobby ? <LobbyScreen lobby={state.lobby} /> : <Home />}
        </div>
      )}
      {state.status !== 'open' && <div className="conn">{state.status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting…'}</div>}
      {err && (
        <div className="error-toast" role="alert" onClick={() => net.clearError()}>
          {err.message}
        </div>
      )}
    </>
  );
}

function Home() {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') ?? '');
  const ok = name.trim().length > 0;
  const commitName = () => saveName(name.trim());

  return (
    <main className="home">
      <section className="home-card wood">
        <h1 className="wordmark">Multicatan</h1>
        <p className="lede">Six settlers. One uncharted ring of sea. Seventy-two rounds, everyone building at once.</p>
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Leif" autoFocus />
        </label>
        <button
          className="brass big"
          disabled={!ok}
          onClick={() => {
            commitName();
            net.send({ t: 'create', token, name: name.trim() });
          }}
        >
          Start a new game
        </button>
        <div className="join">
          <span className="or">or join with a code</span>
          <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" aria-label="Game code" />
          <button
            className="wood-btn"
            disabled={!ok || code.length !== 4}
            onClick={() => {
              commitName();
              net.send({ t: 'join', token, name: name.trim(), room: code });
            }}
          >
            Join
          </button>
        </div>
      </section>
      <section className="home-rules parchment">
        <h2>How Multicatan plays</h2>
        <RulesList />
        <p className="credit">
          A fan recreation of the real-time Multicatan scenario from the old Catan Online World (2007–2016).
        </p>
      </section>
    </main>
  );
}
