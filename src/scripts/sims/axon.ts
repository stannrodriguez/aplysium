/**
 * <axon-sim> — the action potential, computed rather than drawn.
 *
 * The markup is server-rendered by AxonSim.astro; this class attaches to it and
 * drives the readouts. Rather than one free-play instrument, the panel is a
 * guided path: three mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Sub-threshold   — push the stimulus up; below threshold nothing regenerates.
 *   Fire a spike    — cross threshold and it is all-or-none; every spike the same
 *                     size however hard you push. Channel blockers take out Na or
 *                     K one at a time to show each ion's role.
 *   The two currents — the insight: the spike's shape is two conductances on
 *                     different timers, sodium fast then off, potassium slow.
 *
 * Every trace comes out of the 1952 Hodgkin–Huxley equations, integrated here at
 * 5 µs steps. That is the point of the study and so it is the point of the panel:
 * nothing is a stored picture of a spike.
 *
 *   Cm dV/dt = I − gNa·m³h·(V−ENa) − gK·n⁴·(V−EK) − gL·(V−EL)
 *
 * with the six rate functions below. A blocker sets gNa or gK to zero, which is
 * what tetrodotoxin and TEA do to the axon.
 */

import { SimElement, clamp, defineSim, prefersReducedMotion } from './base';

type Mode = 'sub' | 'fire' | 'insight';
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
/** The stimulus the insight mode fires — a clean, unambiguous suprathreshold spike. */
const INSIGHT_AMP = 15;

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
  // One sample every ~0.1 ms is more than the plot can show.
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

const STATUS: Record<Mode, string> = {
  sub: 'sub-threshold',
  fire: 'all-or-none',
  insight: 'two currents',
};

class AxonSim extends SimElement {
  private mode: Mode = 'sub';
  private amp = 8;
  private blocker: Blocker = 'none';
  private live: Run | null = null;
  private ghosts: Run[] = [];

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-blocker]', el => {
      this.blocker = el.dataset.simBlocker as Blocker;
      this.render();
    });
    this.on('[data-sim-amp]', 'input', el => {
      this.amp = Number((el as HTMLInputElement).value);
      this.render();
    });
    this.buildControls();
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    this.mode = mode;
    // Each mode starts its own story from rest.
    this.live = null;
    this.ghosts = [];
    // The blockers belong to the experiment; the other two beats run clean.
    if (mode !== 'fire') this.blocker = 'none';
    // The insight is a finished figure — draw its canonical spike on arrival.
    if (mode === 'insight') this.live = integrate(INSIGHT_AMP, 'none');
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { mode });
  }

  /* ── model ── */

  private stimulate(): void {
    // The all-or-none result is only visible as superposition, so the fire
    // mode keeps earlier suprathreshold runs behind the live one.
    if (this.mode === 'fire' && this.live) {
      this.ghosts = [...this.ghosts, this.live].slice(-MAX_GHOSTS);
    }
    const amp = this.mode === 'insight' ? INSIGHT_AMP : this.amp;
    const blocker = this.mode === 'fire' ? this.blocker : 'none';
    this.live = integrate(amp, blocker);
    this.render();
    this.emit(this.live.fired ? 'fired' : 'subthreshold', {
      mode: this.mode,
      amp,
      blocker,
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

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'insight') {
      this.addBtn(bar, 'Replay the spike', 'sim-btn-primary', () => this.stimulate());
      return;
    }
    this.addBtn(bar, 'Stimulate', 'sim-btn-primary', () => this.stimulate());
    this.addBtn(bar, 'Clear', 'sim-btn-quiet', () => this.clear());
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, fn: () => void): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  /* ── view ── */

  protected render(): void {
    const insight = this.mode === 'insight';

    /* mode chrome */
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.pressed('[data-sim-blocker]', 'simBlocker', this.blocker);
    this.text('[data-sim-status]', STATUS[this.mode]);
    this.text('[data-sim-amp-value]', `${this.amp} µA/cm²`);

    /* which controls this beat shows */
    this.show('[data-sim-ampwrap]', !insight); // stimulus slider: sub + fire
    this.show('[data-sim-blockwrap]', this.mode === 'fire'); // blockers: fire only
    this.show('[data-sim-gwrap]', insight); // conductances: insight only
    this.show('[data-sim-verdict]', this.mode === 'fire');

    const live = this.live;
    this.text(
      '[data-sim-status-word]',
      !live ? 'resting' : live.fired ? 'spike' : 'no spike',
    );
    this.text('[data-sim-peak]', live ? `${live.peak.toFixed(1)} mV` : '−65.0 mV');

    this.text('[data-sim-lead]', this.lead());
    this.html('[data-sim-vplot]', this.vPlot());
    if (insight) this.html('[data-sim-gplot]', this.gPlot());
    if (this.mode === 'fire') this.text('[data-sim-verdict]', this.verdict());
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
      'Sodium conductance rises first and shuts itself off; potassium rises later and stays up.',
    );
  }

  private svg(height: number, body: string, label: string): string {
    const still = prefersReducedMotion() ? ' data-still' : '';
    return `<svg class="hh-plot" viewBox="0 0 ${PW} ${height}"${still} role="img" aria-label="${label}">${body}</svg>`;
  }

  private vLabel(): string {
    if (!this.live) return 'Membrane potential at rest, −65 mV.';
    return `Membrane potential after a ${this.live.amp} microamp pulse: ${
      this.live.fired ? `a spike peaking at ${this.live.peak.toFixed(0)} millivolts` : 'no spike, only a passive bump'
    }.`;
  }

  /* ── the caption, matched to the mode and to what just happened ── */

  private lead(): string {
    const live = this.live;

    if (this.mode === 'insight') {
      return 'The spike is two conductances on different timers. Sodium switches on fast and then shuts itself off — that is the upstroke and the overshoot to about +40 mV. Potassium comes on slowly and drags the voltage back down — the downstroke and the refractory dip below rest. One event, two currents, offset in time.';
    }

    if (this.mode === 'fire') {
      if (this.blocker === 'ttx')
        return 'Tetrodotoxin blocks the sodium channel, and the spike disappears at every strength — only the passive bump the pulse makes, leaking away. The spike is not the membrane being pushed; it is sodium being let in.';
      if (this.blocker === 'tea')
        return live && live.fired
          ? 'TEA blocks the potassium channel. It still fires, but has nothing to bring it back down — the falling phase is a separate current, not the sodium current merely running out.'
          : 'TEA blocks the potassium channel. Fire it above threshold: the axon will spike but cannot repolarise on its own.';
      if (!live)
        return 'At threshold the axon fires an all-or-none spike. Fire it, then push the stimulus harder and fire again — every spike lands on top of the last, the same height however hard you push.';
      if (!live.fired)
        return 'Still below threshold — the membrane charges a little and leaks straight back. Push the stimulus up until it crosses the line.';
      return 'A full spike, all the way to about +40 mV and back. Push harder and fire again: the peak does not grow. The stimulus decides whether, never how much.';
    }

    // sub-threshold
    if (!live)
      return 'A half-millisecond pulse charges the membrane a little, then it leaks straight back — nothing regenerative. Raise the stimulus and fire to see how close to threshold you can get.';
    if (live.fired)
      return 'That crossed threshold and the axon fired a full spike. Drop the stimulus back down: below the line the membrane just charges and leaks away, no matter how close you get.';
    return 'Below threshold. The membrane charges a little and leaks back — a passive bump, not a spike. Nothing regenerative happens until the stimulus crosses the line.';
  }

  private verdict(): string {
    if (this.blocker === 'ttx')
      return 'Tetrodotoxin blocks the sodium channel and the action potential disappears entirely. The spike is sodium being let in, not the membrane being pushed.';
    if (this.blocker === 'tea')
      return 'TEA blocks the potassium channel. The axon still fires, but cannot get back down: the falling phase is a separate current, not the sodium current running out.';
    const fired = this.firedRuns();
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
