import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';
import { botConsiderTrades, botTakeTurn } from '../shared/bot.ts';
import {
  Action, GameState, allDone, applyAction, createGame, forceFinish, setupComplete, startRound,
} from '../shared/game.ts';
import { ClientMsg, LobbyView, MAX_PLAYERS, ServerMsg } from '../shared/protocol.ts';
import { randomSeed } from '../shared/rng.ts';
import { DEFAULT_OPTIONS, GameOptions, RESOURCES } from '../shared/types.ts';
import { viewFor } from '../shared/view.ts';

const DATA_DIR = path.resolve(process.env.MC_DATA_DIR ?? 'data/rooms');
const BOT_NAMES = ['Hilda', 'Gero', 'Arnd', 'Leif', 'Benny', 'Wolfram', 'Ragna', 'Sven'];
const AWAY_GRACE_MS = 20_000;
const NEXT_ROUND_DELAY_MS = 1200;

interface Seat {
  token: string;
  name: string;
  isBot: boolean;
}

interface Client {
  ws: WebSocket;
  token: string | null;
  room: Room | null;
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export class Room {
  seats: Seat[] = [];
  options: GameOptions = { ...DEFAULT_OPTIONS };
  game: GameState | null = null;
  deadline: number | null = null;
  lobbyChat: { name: string; text: string }[] = [];
  clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;
  private advancing = false;
  private botTimers: NodeJS.Timeout[] = [];

  constructor(
    public code: string,
    public hostToken: string,
  ) {}

  connected(token: string) {
    for (const c of this.clients) if (c.token === token) return true;
    return false;
  }

  seatOf(token: string) {
    return this.seats.findIndex((s) => s.token === token);
  }

  // ---------- broadcasting ----------

  broadcast() {
    if (this.game) {
      for (const p of this.game.players) if (!p.isBot) p.connected = this.connected(p.token);
      for (const c of this.clients) {
        const seat = c.token ? this.seatOf(c.token) : -1;
        if (seat >= 0) send(c.ws, { t: 'game', view: viewFor(this.game, seat, this.deadline) });
      }
      return;
    }
    for (const c of this.clients) send(c.ws, { t: 'lobby', lobby: this.lobbyView(c.token) });
  }

  lobbyView(token: string | null): LobbyView {
    return {
      code: this.code,
      seats: this.seats.map((s) => ({
        name: s.name,
        isBot: s.isBot,
        connected: s.isBot || this.connected(s.token),
        isHost: s.token === this.hostToken,
        isYou: s.token === token,
      })),
      options: this.options,
      isHost: token === this.hostToken,
      chat: this.lobbyChat.slice(-50),
    };
  }

  // ---------- lobby ----------

  join(client: Client, token: string, name: string): string | null {
    const seat = this.seatOf(token);
    if (seat >= 0) {
      if (!this.game) this.seats[seat].name = name;
    } else {
      if (this.game) return 'That game has already started';
      if (this.seats.length >= MAX_PLAYERS) return 'That game is full';
      this.seats.push({ token, name, isBot: false });
    }
    client.room = this;
    client.token = token;
    this.clients.add(client);
    if (!this.seats.some((s) => s.token === this.hostToken && !s.isBot)) this.hostToken = token;
    return null;
  }

  leave(client: Client) {
    this.clients.delete(client);
    client.room = null;
    if (!this.game && client.token) {
      const i = this.seatOf(client.token);
      if (i >= 0 && !this.connected(client.token)) this.seats.splice(i, 1);
      const human = this.seats.find((s) => !s.isBot);
      if (human && !this.seats.some((s) => s.token === this.hostToken)) this.hostToken = human.token;
    }
    this.onAwayChange();
  }

  disconnect(client: Client) {
    this.clients.delete(client);
    if (!this.game && client.token) {
      // Keep the seat briefly so a page reload doesn't kick you out of the lobby.
      const token = client.token;
      setTimeout(() => {
        if (this.game || this.connected(token)) return;
        const i = this.seatOf(token);
        if (i >= 0) this.seats.splice(i, 1);
        const human = this.seats.find((s) => !s.isBot);
        if (human && token === this.hostToken) this.hostToken = human.token;
        this.broadcast();
      }, 15_000);
    }
    this.onAwayChange();
  }

  handleLobby(client: Client, msg: ClientMsg): string | null {
    const isHost = client.token === this.hostToken;
    switch (msg.t) {
      case 'setOptions': {
        if (!isHost) return 'Only the host can change options';
        const o = msg.options;
        const clamp = (v: unknown, lo: number, hi: number, d: number) =>
          typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
        this.options = {
          layout: o.layout === 'classic' || o.layout === 'random' ? o.layout : this.options.layout,
          rounds: clamp(o.rounds, 5, 200, this.options.rounds),
          roundSeconds: clamp(o.roundSeconds, 0, 600, this.options.roundSeconds),
          setupSeconds: clamp(o.setupSeconds, 15, 600, this.options.setupSeconds),
          robberGraceRounds: clamp(o.robberGraceRounds, 0, 200, this.options.robberGraceRounds),
        };
        return null;
      }
      case 'addBot': {
        if (!isHost) return 'Only the host can add bots';
        if (this.seats.length >= MAX_PLAYERS) return 'The game is full';
        const used = new Set(this.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot';
        this.seats.push({ token: `bot-${Math.random().toString(36).slice(2)}`, name, isBot: true });
        return null;
      }
      case 'removeSeat': {
        if (!isHost) return 'Only the host can remove players';
        const s = this.seats[msg.index];
        if (!s || s.token === this.hostToken) return 'Cannot remove that seat';
        this.seats.splice(msg.index, 1);
        for (const c of this.clients)
          if (c.token === s.token) {
            send(c.ws, { t: 'left' });
            this.clients.delete(c);
            c.room = null;
          }
        return null;
      }
      case 'start': {
        if (!isHost) return 'Only the host can start';
        if (!this.seats.length) return 'Nobody is here';
        this.start();
        return null;
      }
      case 'chat': {
        const seat = client.token ? this.seatOf(client.token) : -1;
        const text = String(msg.text ?? '').slice(0, 300).trim();
        if (seat >= 0 && text) this.lobbyChat.push({ name: this.seats[seat].name, text });
        return null;
      }
    }
    return 'The game has not started yet';
  }

  // ---------- game flow ----------

  start() {
    this.game = createGame(
      this.code,
      this.seats.map((s) => ({ name: s.name, token: s.token, isBot: s.isBot })),
      this.options,
      randomSeed(),
    );
    this.setDeadline(this.options.setupSeconds);
    this.scheduleBots();
    this.save();
  }

  handleGame(client: Client, msg: ClientMsg): string | null {
    const game = this.game!;
    const seat = client.token ? this.seatOf(client.token) : -1;
    if (seat < 0) return 'You are not in this game';
    if (msg.t === 'chat') {
      const text = String(msg.text ?? '').slice(0, 300).trim();
      if (!text) return null;
      if (process.env.NODE_ENV !== 'production' && text.startsWith('/')) return devCommand(game, seat, text);
      const to = typeof msg.to === 'number' && game.players[msg.to] ? msg.to : null;
      game.chat.push({ id: game.nextId++, from: seat, to, text });
      if (game.chat.length > 300) game.chat.splice(0, game.chat.length - 300);
      return null;
    }
    if (msg.t !== 'action') return 'The game is already running';
    const err = applyAction(game, seat, msg.action as Action);
    if (err) return err;
    if (msg.action.type === 'offerTrade') this.botsReplyToTrades();
    this.maybeAdvance();
    return null;
  }

  private setDeadline(seconds: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = seconds > 0 ? Date.now() + seconds * 1000 : null;
    if (this.deadline) this.timer = setTimeout(() => this.onTimeout(), seconds * 1000);
  }

  private onTimeout() {
    const game = this.game;
    if (!game || game.phase === 'ended') return;
    for (const p of game.players) if (!p.done) forceFinish(game, p.seat);
    this.maybeAdvance();
    this.broadcast();
  }

  /** Players who drop out shouldn't stall the table. */
  private onAwayChange() {
    const game = this.game;
    if (!game || game.phase === 'ended') return;
    for (const p of game.players) {
      if (p.isBot || p.done || this.connected(p.token)) continue;
      const token = p.token;
      setTimeout(() => {
        const g = this.game;
        if (!g || g.phase === 'ended' || this.connected(token)) return;
        const q = g.players.find((x) => x.token === token);
        if (q && !q.done) {
          forceFinish(g, q.seat);
          this.maybeAdvance();
          this.broadcast();
        }
      }, AWAY_GRACE_MS);
    }
  }

  private maybeAdvance() {
    const game = this.game;
    if (!game || this.advancing || game.phase === 'ended') return;
    const ready = game.phase === 'setup' ? setupComplete(game) : allDone(game);
    if (!ready) return;
    this.advancing = true;
    setTimeout(() => {
      this.advancing = false;
      this.nextRound();
    }, NEXT_ROUND_DELAY_MS);
  }

  private nextRound() {
    const game = this.game;
    if (!game) return;
    const more = startRound(game);
    if (!more) {
      if (this.timer) clearTimeout(this.timer);
      this.deadline = null;
    } else {
      this.setDeadline(this.options.roundSeconds);
      this.scheduleBots();
      this.onAwayChange();
    }
    this.save();
    this.broadcast();
  }

  private botsReplyToTrades() {
    const game = this.game!;
    setTimeout(() => {
      if (this.game !== game) return;
      let changed = false;
      for (const p of game.players) if (p.isBot && botConsiderTrades(game, p.seat)) changed = true;
      if (changed) this.broadcast();
    }, 1200 + Math.random() * 1500);
  }

  private scheduleBots() {
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers = [];
    const game = this.game!;
    for (const p of game.players) {
      if (!p.isBot) continue;
      const delay = 800 + Math.random() * 2500;
      this.botTimers.push(
        setTimeout(() => {
          if (this.game !== game || game.phase === 'ended') return;
          botTakeTurn(game, p.seat);
          this.maybeAdvance();
          this.broadcast();
        }, delay),
      );
    }
  }

  // ---------- persistence ----------

  save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const data = { code: this.code, hostToken: this.hostToken, seats: this.seats, options: this.options, game: this.game };
      fs.writeFileSync(path.join(DATA_DIR, `${this.code}.json`), JSON.stringify(data));
    } catch (e) {
      console.error('save failed', e);
    }
  }

  static load(file: string): Room | null {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data.game || data.game.phase === 'ended') return null;
      const room = new Room(data.code, data.hostToken);
      room.seats = data.seats;
      room.options = data.options;
      room.game = data.game;
      // Resume with a fresh timer for the current round.
      const g = room.game!;
      room.setDeadline(g.phase === 'setup' ? room.options.setupSeconds : room.options.roundSeconds);
      room.scheduleBots();
      room.onAwayChange();
      return room;
    } catch {
      return null;
    }
  }
}

/** Development-only cheats for testing the UI: /give, /reveal, /cards. */
function devCommand(game: GameState, seat: number, text: string): string | null {
  const p = game.players[seat];
  if (text === '/give') {
    for (const r of RESOURCES) p.resources[r] += 5;
    return null;
  }
  if (text === '/reveal') {
    p.revealed = p.revealed.map(() => true);
    return null;
  }
  if (text === '/cards') {
    p.devCards.push({ kind: 'knight', round: game.round }, { kind: 'roadBuilding', round: game.round }, { kind: 'victoryPoint', round: game.round });
    return null;
  }
  return 'Dev commands: /give, /reveal, /cards';
}

// ---------- registry ----------

export class Lobby {
  rooms = new Map<string, Room>();

  constructor() {
    if (!fs.existsSync(DATA_DIR)) return;
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith('.json')) continue;
      const room = Room.load(path.join(DATA_DIR, f));
      if (room) this.rooms.set(room.code, room);
      else fs.rmSync(path.join(DATA_DIR, f), { force: true });
    }
    if (this.rooms.size) console.log(`Restored ${this.rooms.size} game(s).`);
  }

  newCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  connect(ws: WebSocket) {
    const client: Client = { ws, token: null, room: null };
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const err = this.handle(client, msg);
      if (err) send(ws, { t: 'error', message: err });
      client.room?.broadcast();
    });
    ws.on('close', () => {
      const room = client.room;
      if (room) {
        room.disconnect(client);
        room.broadcast();
      }
    });
  }

  private handle(client: Client, msg: ClientMsg): string | null {
    const name = (n: unknown) => String(n ?? '').trim().slice(0, 24) || 'Settler';
    const token = (t: unknown) => String(t ?? '').slice(0, 64);
    switch (msg.t) {
      case 'create': {
        if (client.room) client.room.leave(client);
        const room = new Room(this.newCode(), token(msg.token));
        this.rooms.set(room.code, room);
        return room.join(client, token(msg.token), name(msg.name));
      }
      case 'join': {
        const room = this.rooms.get(String(msg.room ?? '').toUpperCase());
        if (!room) return 'No game with that code';
        if (client.room && client.room !== room) client.room.leave(client);
        return room.join(client, token(msg.token), name(msg.name));
      }
      case 'leave': {
        const room = client.room;
        if (!room) return null;
        room.leave(client);
        send(client.ws, { t: 'left' });
        room.broadcast();
        if (!room.clients.size && !room.game) this.rooms.delete(room.code);
        return null;
      }
    }
    const room = client.room;
    if (!room) return 'Join a game first';
    return room.game ? room.handleGame(client, msg) : room.handleLobby(client, msg);
  }
}
