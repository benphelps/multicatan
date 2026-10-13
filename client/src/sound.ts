// Tiny synthesized sound effects (no audio files): dice clatter, chimes, ticks.

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('mc_muted') === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Browsers only allow audio after a user gesture; warm up on the first one.
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', () => audio(), { once: true, capture: true });

function noiseBurst(c: AudioContext, at: number, dur: number, freq: number, gain: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
}

function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** One clack of a die: a few short, inharmonic partials plus a click — wood on wood. */
function dieHit(c: AudioContext, at: number, gain: number, pitch: number, thump: boolean) {
  const out = c.createGain();
  out.gain.value = gain * 0.6;
  out.connect(c.destination);
  for (const [ratio, amp, decay] of [
    [1, 1, 0.05],
    [1.71, 0.55, 0.035],
    [2.83, 0.3, 0.025],
  ] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = pitch * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(amp * 0.35, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.02);
  }
  // contact click
  const len = Math.ceil(c.sampleRate * 0.008);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const cg = c.createGain();
  cg.gain.value = 0.5;
  src.connect(hp).connect(cg).connect(out);
  src.start(at);
  // the table itself on the first impact
  if (thump) tone(c, at, 150, 0.09, gain * 0.35, 'sine', 70);
}

export const sound = {
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem('mc_muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  roll() {
    const c = audio();
    if (!c) return;
    // Two dice hitting a wooden table: each bounces a few times, closer and softer each time.
    const t0 = c.currentTime + 0.01;
    for (let die = 0; die < 2; die++) {
      let t = t0 + die * (0.025 + Math.random() * 0.03);
      let gap = 0.1 + Math.random() * 0.04;
      let gain = 0.55;
      const pitch = 900 + Math.random() * 500;
      for (let bounce = 0; bounce < 6; bounce++) {
        dieHit(c, t, gain, pitch * (1 + (Math.random() - 0.5) * 0.12), bounce === 0);
        t += gap;
        gap *= 0.68 + Math.random() * 0.08;
        gain *= 0.62;
      }
      // a last little skitter as it settles
      for (let i = 0; i < 3; i++) dieHit(c, t + i * 0.018, gain * 0.5, pitch * 1.2, false);
    }
  },
  chime() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 784, 0.25, 0.12);
    tone(c, t + 0.11, 1175, 0.35, 0.1);
  },
  tick() {
    const c = audio();
    if (!c) return;
    tone(c, c.currentTime, 1400, 0.03, 0.05, 'square');
  },
  build() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 180, 0.14, 0.25, 'sine', 70);
    noiseBurst(c, t, 0.05, 900, 0.15);
  },
  coin() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 1320, 0.12, 0.06, 'triangle');
    tone(c, t + 0.06, 1760, 0.18, 0.05, 'triangle');
  },
};
