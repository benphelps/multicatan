// Flying tokens: resources and cards travelling between the board, your hand and other players.
import type { DevKind, Resource } from '../../../shared/types.ts';

export type Pt = { x: number; y: number };

export interface Flight {
  id: number;
  what: { res: Resource } | { dev: DevKind | 'back' };
  from: Pt;
  to: Pt;
  delay: number;
  dur: number;
  fade?: boolean; // vanish at the end instead of landing (spent resources, played cards)
}

let flights: Flight[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const flightStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => flights,
};

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Launch one flight; `land` (if given) gets a little bump when it arrives. */
export function fly(f: Omit<Flight, 'id' | 'dur'> & { dur?: number; land?: Element | null }) {
  if (reduced()) return;
  const dist = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y);
  const dur = f.dur ?? Math.min(900, 420 + dist * 0.45);
  const flight: Flight = { id: nextId++, what: f.what, from: f.from, to: f.to, delay: f.delay, dur, fade: f.fade };
  flights = [...flights, flight];
  emit();
  setTimeout(() => {
    flights = flights.filter((x) => x.id !== flight.id);
    emit();
    f.land?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14) translateY(-2px)' }, { transform: 'scale(1)' }], {
      duration: 240,
      easing: 'ease-out',
    });
  }, f.delay + dur);
}

export function centerOf(el: Element | null | undefined): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export const els = {
  handCard: (r: Resource) => document.querySelector(`.hand .rcard.${r} .rcard-face`),
  devSlot: (k: DevKind) => document.querySelector(`.devcard[data-kind="${k}"]`),
  tile: (label: string) => document.querySelector(`.tile[aria-label="${label}"]`),
  player: (seat: number) => document.querySelector(`.pcard[data-seat="${seat}"] .pcard-portrait`),
  stage: () => document.querySelector('.stage'),
};

// ---- what the player just did, so resource changes can fly to/from the right place ----

export type Hint =
  | { kind: 'spend'; at: Pt } // building: cost flies to the spot; treasure gains fly back from it
  | { kind: 'bank'; at: Pt } // bank trade
  | { kind: 'knight'; at: Pt } // gains fly from the robber / board
  | { kind: 'discard' };

let hint: { h: Hint; time: number } | null = null;
export const setHint = (h: Hint) => {
  hint = { h, time: Date.now() };
};
export const takeHint = (): Hint | null => {
  const h = hint && Date.now() - hint.time < 3000 ? hint.h : null;
  hint = null;
  return h;
};
