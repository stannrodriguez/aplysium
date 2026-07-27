/**
 * <axon-sim> — the action potential, computed rather than drawn.
 *
 * Every trace on screen comes out of the 1952 Hodgkin–Huxley equations,
 * integrated here at 5 µs steps. That is the point of the study and so it is
 * the point of the panel: nothing is a stored picture of a spike.
 *
 *   Cm dV/dt = I − gNa·m³h·(V−ENa) − gK·n⁴·(V−EK) − gL·(V−EL)
 *
 * with the six rate functions below. A blocker sets gNa or gK to zero, which
 * is what tetrodotoxin and TEA do to the axon.
 *
 * Traces accumulate faintly behind the live one, because the all-or-none
 * result is only visible as superposition: every suprathreshold run lands on
 * top of the last however hard you stimulate.
 */

import { SimElement, clamp, defineSim, prefersReducedMotion } from './base';

type Blocker = 'none' | 'ttx' | 'tea';

interface Sample {
  t: number;
  v: number;
  gNa: number;
  gK: number;
}

interface Run {
  amp: number;
  blocker: Blocker;
  samples: Sample[];
  peak: number;
  fired: boolean;
}

/* the axon's constants, in the paper's units */
const ENA = 50;
const EK = -77;
const EL = -54.387;
const GL = 0.3;
const CM = 1;
const V_REST = -65;

const DT = 0.005; // ms
const SPAN = 30; // ms
const PULSE_AT = 2;
const PULSE_MS = 0.5;
/** Above this peak the axon has fired rather than merely been pushed. */
const FIRED_ABOVE = 0;
const MAX_GHOSTS = 5;

/* Two rate functions are 0/0 at one particular voltage; hold the limit. */
const ratio = (num: number, den: number): number => (Math.abs(den) < 1e-7 ? num / 1e-7 : num / den);

const aN = (v: number): number => ratio(0.01 * (v + 55), 1 - Math.exp(-(v + 55) / 10));
const bN = (v: number): number => 0.125 * Math.exp(-(v + 65) / 80);
const aM = (v: number): number => ratio(0.1 * (v + 40), 1 - Math.exp(-(v + 40) / 10));
const bM = (v: number): number => 4 * Math.exp(-(v + 65) / 18);
const aH = (v: number): number => 0.07 * Math.exp(-(v + 65) / 20);
const bH = (v: number): number => 1 / (1 + Math.exp(-(v + 35) / 10));

const steady = (a: (v: number) => number, b: (v: number) => number, v: number): number =>
  a(v) / (a(v) + b(v));

function integrate(amp: number, blocker: Blocker): Run {
  const gNaMax = blocker === 'ttx' ? 0 : 120;
  const gKMax = blocker === 'tea' ? 0 : 36;

  let v = V_REST;
  let n = steady(aN, bN, v);
  let m = steady(aM, bM, v);
  let h = steady(aH, bH, v);

  const samples: Sample[] = [];
  const steps = Math.round(SPAN / DT);
  // One sample every ~0.1 ms is more than the 288px-wide plot can show.
  const keep = Math.round(0.1 / DT);
  let peak = V_REST;

  for (let i = 0; i <= steps; i++) {
    const t = i * DT;
    const gNa = gNaMax * m ** 3 * h;
    const gK = gKMax * n ** 4;
    if (i % keep === 0) samples.push({ t, v, gNa, gK });
    if (v > peak) peak = v;

    const I = t >= PULSE_AT && t < PULSE_AT + PULSE_MS ? amp : 0;
    const dv = (I - gNa * (v - ENA) - gK * (v - EK) - GL * (v - EL)) / CM;
    v += dv * DT;
    n += (aN(v) * (1 - n) - bN(v) * n) * DT;
    m += (aM(v) * (1 - m) - bM(v) * m) * DT;
    h += (aH(v) * (1 - h) - bH(v) * h) * DT;
  }

  return { amp, blocker, samples, peak, fired: peak > FIRED_ABOVE };
}

/* plot geometry */
const PW = 320;
const VH = 148;
const GH = 104;
const L = 30;
const R = 312;
const V_TOP = -80;
const V_BOT = 55;
const G_MAX = 40;

const px = (t: number): number => L + (t / SPAN) * (R - L);
const pv = (v: number): number => 12 + ((V_BOT - v) / (V_BOT - V_TOP)) * (VH - 30);
const pg = (g: number): number => 12 + (1 - clamp(g, 0, G_MAX) / G_MAX) * (GH - 30);

const line = (samples: Sample[], y: (s: Sample) => number): string =>
  samples.map(s => `${px(s.t).toFixed(1)},${y(s).toFixed(1)}`).join(' ');

class AxonSim extends SimElement {
  private amp = 8;
  private blocker: Blocker = 'none';
  private live: Run | null = null;
  private ghosts: Run[] = [];

  protected setup(): void {
    this.onClick('[data-sim-stimulate]', () => this.stimulate());
    this.onClick('[data-sim-clear]', () => this.clear());
    this.onClick('[data-sim-blocker]', el => {
      this.blocker = el.dataset.simBlocker as Blocker;
      this.render();
    });
    this.on('[data-sim-amp]', 'input', el => {
      this.amp = Number((el as HTMLInputElement).value);
      this.render();
    });
  }

  /* ── model ── */

  private stimulate(): void {
    if (this.live) this.ghosts = [...this.ghosts, this.live].slice(-MAX_GHOSTS);
    this.live = integrate(this.amp, this.blocker);
    this.render();
    this.emit(this.live.fired ? 'fired' : 'subthreshold', {
      amp: this.amp,
      blocker: this.blocker,
      peak: this.live.peak,
    });
  }

  private clear(): void {
    this.live = null;
    this.ghosts = [];
    this.render();
    this.emit('cleared');
  }

  /** How many of the runs on screen fired — the all-or-none tally. */
  private firedRuns(): Run[] {
    return [...this.ghosts, ...(this.live ? [this.live] : [])].filter(r => r.fired);
  }

  /* ── view ── */

  protected render(): void {
    this.text('[data-sim-amp-value]', `${this.amp} µA/cm²`);
    this.pressed('[data-sim-blocker]', 'simBlocker', this.blocker);

    const live = this.live;
    this.text('[data-sim-status]', !live ? 'resting' : live.fired ? 'spike' : 'no spike');
    this.text('[data-sim-peak]', live ? `${live.peak.toFixed(1)} mV` : '−65.0 mV');

    this.html('[data-sim-vplot]', this.vPlot());
    this.html('[data-sim-gplot]', this.gPlot());
    this.text('[data-sim-v-note]', this.vNote());
    this.text('[data-sim-g-note]', this.gNote());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private axes(height: number, labels: Array<[number, string]>, unit: string): string {
    const ticks = labels
      .map(
        ([y, text]) =>
          `<line class="hh-grid" x1="${L}" y1="${y.toFixed(1)}" x2="${R}" y2="${y.toFixed(1)}"/>` +
          `<text class="hh-tick" x="${L - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${text}</text>`,
      )
      .join('');
    const stim =
      `<rect class="hh-pulse" x="${px(PULSE_AT).toFixed(1)}" y="8" ` +
      `width="${(px(PULSE_AT + PULSE_MS) - px(PULSE_AT)).toFixed(1)}" height="${height - 26}"/>`;
    return (
      ticks +
      stim +
      `<text class="hh-tick" x="${R}" y="${height - 5}" text-anchor="end">${SPAN} ms</text>` +
      `<text class="hh-tick" x="${L}" y="${height - 5}">${unit}</text>`
    );
  }

  private vPlot(): string {
    const grid = this.axes(
      VH,
      [
        [pv(50), '+50'],
        [pv(0), '0'],
        [pv(V_REST), '−65'],
      ],
      'mV',
    );

    const ghosts = this.ghosts
      .map(r => `<polyline class="hh-line hh-ghost" points="${line(r.samples, s => pv(s.v))}"/>`)
      .join('');

    const live = this.live
      ? `<polyline class="hh-line hh-live${this.live.fired ? ' is-spike' : ''}" pathLength="1000" points="${line(
          this.live.samples,
          s => pv(s.v),
        )}"/>`
      : '';

    return this.svg(VH, grid + ghosts + live, this.vLabel());
  }

  private gPlot(): string {
    const grid = this.axes(
      GH,
      [
        [pg(G_MAX), '40'],
        [pg(0), '0'],
      ],
      'mS/cm²',
    );

    const live = this.live
      ? `<polyline class="hh-line hh-na" pathLength="1000" points="${line(this.live.samples, s => pg(s.gNa))}"/>` +
        `<polyline class="hh-line hh-k" pathLength="1000" points="${line(this.live.samples, s => pg(s.gK))}"/>`
      : '';

    return this.svg(
      GH,
      grid + live,
      this.live
        ? 'Sodium conductance rises first and shuts itself off; potassium rises later and stays up.'
        : 'Stimulate the axon to separate the two currents.',
    );
  }

  private svg(height: number, body: string, label: string): string {
    const still = prefersReducedMotion() ? ' data-still' : '';
    return `<svg class="hh-plot" viewBox="0 0 ${PW} ${height}"${still} role="img" aria-label="${label}">${body}</svg>`;
  }

  private vLabel(): string {
    if (!this.live) return 'Membrane potential at rest, −65 mV.';
    return `Membrane potential after a ${this.amp} microamp pulse: ${
      this.live.fired ? `a spike peaking at ${this.live.peak.toFixed(0)} millivolts` : 'no spike, only a passive bump'
    }.`;
  }

  private vNote(): string {
    const live = this.live;
    if (!live) return 'Set a stimulus strength and fire it. The pulse itself is the shaded band.';
    if (live.blocker === 'ttx')
      return 'With sodium blocked there is no spike at any strength — only the passive bump the pulse itself makes, leaking away.';
    if (live.blocker === 'tea' && live.fired)
      return 'It fired, and then had nothing to bring it back down. Potassium is what repolarises the membrane.';
    if (!live.fired)
      return 'Below threshold: the membrane charges a little and leaks straight back. Nothing regenerative happened.';
    return 'All the way to +40 mV and back, with an undershoot below rest. Push the stimulus harder and the spike does not get bigger.';
  }

  private gNote(): string {
    const live = this.live;
    if (!live || !live.fired) return 'Nothing regenerative to separate yet.';
    if (live.blocker === 'ttx') return 'Sodium blocked: no inward current, so nothing to counter.';
    if (live.blocker === 'tea')
      return 'Potassium blocked: sodium opens and inactivates as usual, but nothing opens behind it.';
    return 'Sodium leads and inactivates on its own; potassium follows and holds. The offset between them is the shape of the spike.';
  }

  private verdict(): string {
    const fired = this.firedRuns();
    if (this.blocker === 'ttx')
      return 'Tetrodotoxin blocks the sodium channel and the action potential disappears entirely. The spike is not the membrane being pushed — it is sodium being let in.';
    if (this.blocker === 'tea')
      return 'TEA blocks the potassium channel. The axon still fires, but cannot get back down: the falling phase is a separate current, not the sodium current running out.';
    if (fired.length < 2)
      return 'Fire it at two different strengths above threshold and leave both traces on screen.';
    const amps = fired.map(r => r.amp);
    const peaks = fired.map(r => r.peak);
    const spread = Math.max(...peaks) - Math.min(...peaks);
    return `${fired.length} spikes from stimuli of ${Math.min(...amps)} to ${Math.max(...amps)} µA/cm² — a ${(
      Math.max(...amps) / Math.max(1, Math.min(...amps))
    ).toFixed(1)}× range — and their peaks differ by ${spread.toFixed(1)} mV. All-or-none: the stimulus decides whether, never how much.`;
  }
}

defineSim('axon-sim', AxonSim);
