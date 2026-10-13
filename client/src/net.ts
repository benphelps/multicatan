import { useSyncExternalStore } from 'react';
import type { Action } from '../../shared/game.ts';
import type { ClientMsg, LobbyView, ServerMsg } from '../../shared/protocol.ts';
import type { GameView } from '../../shared/view.ts';

export interface NetState {
  status: 'connecting' | 'open' | 'closed';
  lobby: LobbyView | null;
  view: GameView | null;
  clockOffset: number; // serverNow - Date.now()
  error: { message: string; at: number } | null;
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export const token = (() => {
  let t = ls.get('mc_token');
  if (!t) {
    t = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    ls.set('mc_token', t);
  }
  return t;
})();

export const savedName = () => ls.get('mc_name') ?? '';
export const saveName = (n: string) => ls.set('mc_name', n);

class Net {
  state: NetState = { status: 'connecting', lobby: null, view: null, clockOffset: 0, error: null };
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private retry = 0;
  room: string | null = ls.get('mc_room');

  constructor() {
    this.connect();
  }

  private set(patch: Partial<NetState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.set({ status: 'connecting' });
    ws.onopen = () => {
      this.retry = 0;
      this.set({ status: 'open' });
      if (this.room) this.send({ t: 'join', token, name: savedName() || 'Settler', room: this.room });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMsg;
      switch (msg.t) {
        case 'lobby':
          this.setRoom(msg.lobby.code);
          this.set({ lobby: msg.lobby, view: null });
          break;
        case 'game':
          this.setRoom(msg.view.gameId);
          this.set({ view: msg.view, lobby: null, clockOffset: msg.view.serverNow - Date.now() });
          break;
        case 'left':
          this.setRoom(null);
          this.set({ lobby: null, view: null });
          break;
        case 'error':
          // The server forgot this game (restart, or everyone left): go back to the start screen.
          if (msg.message === 'No game with that code' || msg.message === 'Join a game first') {
            this.setRoom(null);
            this.set({ lobby: null, view: null, error: { message: 'That game is no longer running.', at: Date.now() } });
            break;
          }
          this.set({ error: { message: msg.message, at: Date.now() } });
          break;
      }
    };
    ws.onclose = () => {
      this.set({ status: 'closed' });
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private setRoom(code: string | null) {
    this.room = code;
    ls.set('mc_room', code);
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  clearError() {
    this.set({ error: null });
  }
}

export const net = new Net();
export const useNet = () => useSyncExternalStore(net.subscribe, () => net.state);

export const act = (action: Action) => net.send({ t: 'action', action });
