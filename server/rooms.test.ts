import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, ServerMsg } from '../shared/protocol.ts';
import { emptyRes } from '../shared/types.ts';
import type { GameView } from '../shared/view.ts';
import { Lobby } from './rooms.ts';

class FakeWs extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  inbox: ServerMsg[] = [];
  send(data: string) {
    this.inbox.push(JSON.parse(data));
  }
  client(msg: ClientMsg) {
    this.emit('message', JSON.stringify(msg));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
  view(): GameView {
    return this.last('game')!.view;
  }
}

function connect(lobby: Lobby) {
  const ws = new FakeWs();
  lobby.connect(ws as never);
  return ws;
}

describe('rooms over the wire', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs a lobby, setup, rounds, trades and reconnects', () => {
    const lobby = new Lobby();
    const alice = connect(lobby);
    alice.client({ t: 'create', token: 'alice', name: 'Alice' });
    const code = alice.last('lobby')!.lobby.code;

    const bob = connect(lobby);
    bob.client({ t: 'join', token: 'bob', name: 'Bob', room: code });
    alice.client({ t: 'addBot' });
    expect(alice.last('lobby')!.lobby.seats.map((s) => s.name)).toEqual(['Alice', 'Bob', 'Hilda']);

    bob.client({ t: 'start' });
    expect(bob.last('error')?.message).toMatch(/host/);
    alice.client({ t: 'setOptions', options: { rounds: 6, roundSeconds: 30, setupSeconds: 60, robberGraceRounds: 0 } });
    alice.client({ t: 'start' });
    expect(alice.view().phase).toBe('setup');

    // Humans place their pieces through the protocol.
    for (const ws of [alice, bob]) {
      for (let step = 0; step < 5; step++) {
        const v = ws.view();
        if (step === 0 || step === 2) ws.client({ t: 'action', action: { type: 'setupSettlement', vertex: v.legal.settlements[0] } });
        else if (step === 4) ws.client({ t: 'action', action: { type: 'setupCity', vertex: v.legal.cities[0] } });
        else {
          const edge = v.legal.ships[0] ?? v.legal.roads[0];
          ws.client({ t: 'action', action: { type: 'setupRoute', edge, kind: v.legal.ships.length ? 'ship' : 'road' } });
        }
      }
      expect(ws.view().me.setupStep).toBe(5);
    }
    vi.advanceTimersByTime(5000); // bot sets up, round 1 rolls
    expect(alice.view().phase).toBe('playing');
    expect(alice.view().round).toBe(1);

    // Bob can't see Alice's island yet (different home islands).
    const a = alice.view();
    expect(a.players[1].discovered).toBe(false);
    expect(a.players[1].vp).toBeUndefined();

    // Ending turns rolls the next round once the bot has also finished.
    alice.client({ t: 'action', action: { type: 'endTurn' } });
    bob.client({ t: 'action', action: { type: 'endTurn' } });
    vi.advanceTimersByTime(6000);
    expect(alice.view().round).toBe(2);

    // The timer finishes idle players.
    vi.advanceTimersByTime(31_000 + 2000);
    expect(alice.view().round).toBe(3);

    // Reconnecting with the same token resumes the seat.
    bob.emit('close');
    const bob2 = connect(lobby);
    bob2.client({ t: 'join', token: 'bob', name: 'Bob', room: code });
    expect(bob2.view().you).toBe(1);

    // Trades between undiscovered players are refused.
    bob2.client({ t: 'action', action: { type: 'offerTrade', to: 0, give: { ...emptyRes(), brick: 1 }, want: { ...emptyRes(), ore: 1 } } });
    expect(bob2.last('error')?.message).toMatch(/discover|cards/);

    // Play out the remaining rounds on the timer.
    vi.advanceTimersByTime(10 * 35_000);
    expect(alice.view().phase).toBe('ended');
    expect(alice.view().ranking?.length).toBe(3);
    expect(alice.view().players.every((p) => p.discovered)).toBe(true);
  });

  it('rejects joining a started game with a new token', () => {
    const lobby = new Lobby();
    const host = connect(lobby);
    host.client({ t: 'create', token: 'h', name: 'H' });
    const code = host.last('lobby')!.lobby.code;
    host.client({ t: 'start' });
    const late = connect(lobby);
    late.client({ t: 'join', token: 'late', name: 'Late', room: code });
    expect(late.last('error')?.message).toMatch(/started/);
  });
});
