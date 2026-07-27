/**
 * <dopamine-sim> — the cell that reports surprise.
 *
 * One midbrain dopamine neuron, and one learned association driving it. The
 * cue's associative strength V is updated trial by trial with Rescorla–Wagner,
 * V += α(R − V), and the cell's response at each moment is the prediction
 * error δ at that moment: R − V when the reward lands, V when the cue appears
 * and turns out to predict one.
 *
 * That is the entire model, and everything the panel shows falls out of it —
 * including the omission dip, which is not a separate rule but δ going
 * negative because a prediction was made and nothing arrived.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type TrialKind = 'paired' | 'surprise' | 'omitted';

interface Trial {
  kind: TrialKind;
  cueDelta: number;
  rewardDelta: number;
  v: number;
}

const ALPHA = 0.28;
const BASE = 4;
const CUE_MS = 400;
const REWARD_MS = 1400;
const SPAN_MS = 2200;

class DopamineSim extends SimElement {
  /** How well the cue predicts reward. Starts knowing nothing. */
  private v = 0;
  private trials: Trial[] = [];
  private last: Trial | null = null;

  protected setup(): void {
    this.onClick('[data-sim-trial]', el => this.run(el.dataset.simTrial as TrialKind));
    this.onClick('[data-sim-train]', () => this.train());
    this.onClick('[data-sim-reset]', () => this.reset());
  }

  /* ── model ── */

  private run(kind: TrialKind): void {
    const cued = kind !== 'surprise';
    const rewarded = kind !== 'omitted';
    const before = this.v;

    // A cue that has come to predict reward is itself the earliest moment the
    // prediction improves, so the cell responds to it.
    const cueDelta = cued ? before : 0;
    const rewardDelta = (rewarded ? 1 : 0) - (cued ? before : 0);

    // Only a cue present on the trial can gain or lose associative strength.
    if (cued) this.v = clamp(before + ALPHA * ((rewarded ? 1 : 0) - before), 0, 1);

    const trial: Trial = { kind, cueDelta, rewardDelta, v: this.v };
    this.last = trial;
    this.trials = [...this.trials, trial].slice(-28);
    this.render();
    this.emit('trial', trial);
  }

  /** Eight paired trials, which is about what it takes for the burst to move
   *  from the reward to the cue. */
  private train(): void {
    for (let i = 0; i < 8; i++) this.run('paired');
  }

  private reset(): void {
    this.v = 0;
    this.trials = [];
    this.last = null;
    this.render();
    this.emit('reset');
  }

  /* ── view ── */

  protected render(): void {
    const t = this.last;

    this.text('[data-sim-status]', `V = ${this.v.toFixed(2)} · ${this.trials.length} trials`);
    this.text('[data-sim-v]', this.v.toFixed(2));
    this.css('[data-sim-v-bar]', 'width', `${this.v * 100}%`);
    this.text('[data-sim-delta]', t ? `${t.rewardDelta >= 0 ? '+' : '−'}${Math.abs(t.rewardDelta).toFixed(2)}` : '—');

    this.html('[data-sim-trace]', this.traceSvg());
    this.html('[data-sim-history]', this.historySvg());
    this.text('[data-sim-trace-note]', this.traceNote());
    this.text('[data-sim-verdict]', this.verdict());
  }

  /** The cell across one trial: baseline, a response at the cue, a response
   *  at the reward — up for positive δ, down through baseline for negative. */
  private traceSvg(): string {
    const W = 320;
    const H = 148;
    const L = 30;
    const R = 308;
    const x = (ms: number) => L + (ms / SPAN_MS) * (R - L);
    const y = (rate: number) => 16 + (1 - clamp(rate, 0, 30) / 30) * (H - 46);

    const t = this.last;
    const events: Array<{ at: number; delta: number }> = t
      ? [
          ...(t.kind === 'surprise' ? [] : [{ at: CUE_MS, delta: t.cueDelta }]),
          { at: REWARD_MS, delta: t.rewardDelta },
        ]
      : [];

    // A burst is a brief rise; a dip is the cell going quiet for longer, which
    // is what a below-baseline error looks like on a cell with a low floor.
    const rateAt = (ms: number): number => {
      let rate = BASE;
      for (const e of events) {
        const dt = ms - e.at;
        if (e.delta >= 0) {
          if (dt >= 0 && dt < 220) rate += e.delta * 24 * Math.exp(-dt / 90);
        } else if (dt >= 60 && dt < 420) {
          rate += e.delta * BASE * 0.95;
        }
      }
      return Math.max(0, rate);
    };

    const points: string[] = [];
    for (let ms = 0; ms <= SPAN_MS; ms += 10) points.push(`${x(ms).toFixed(1)},${y(rateAt(ms)).toFixed(1)}`);

    const marks =
      `<line class="dop-mark" x1="${x(CUE_MS)}" y1="14" x2="${x(CUE_MS)}" y2="${H - 26}"/>` +
      `<text class="dop-tick" x="${x(CUE_MS)}" y="${H - 14}" text-anchor="middle">${
        t?.kind === 'surprise' ? 'no cue' : 'cue'
      }</text>` +
      `<line class="dop-mark" x1="${x(REWARD_MS)}" y1="14" x2="${x(REWARD_MS)}" y2="${H - 26}"/>` +
      `<text class="dop-tick" x="${x(REWARD_MS)}" y="${H - 14}" text-anchor="middle">${
        t?.kind === 'omitted' ? 'nothing' : 'reward'
      }</text>`;

    const baseline =
      `<line class="dop-base" x1="${L}" y1="${y(BASE)}" x2="${R}" y2="${y(BASE)}"/>` +
      `<text class="dop-tick" x="${L - 5}" y="${y(BASE) + 3}" text-anchor="end">base</text>`;

    const raster = t ? this.rasterRow(rateAt, x) : '';

    const trace = t ? `<polyline class="dop-trace" points="${points.join(' ')}"/>` : '';
    const empty = t
      ? ''
      : `<text class="dop-tick" x="160" y="${H / 2}" text-anchor="middle">run a trial and watch where the burst goes</text>`;

    return `<svg class="dop-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.traceLabel()}">${baseline}${marks}${trace}${raster}${empty}</svg>`;
  }

  private rasterRow(rateAt: (ms: number) => number, x: (ms: number) => number): string {
    const ticks: string[] = [];
    for (let ms = 0; ms < SPAN_MS; ms += 8)
      if (noise(ms * 3 + this.trials.length * 71) < (rateAt(ms) * 8) / 1000)
        ticks.push(`<line class="dop-spike" x1="${x(ms).toFixed(1)}" y1="6" x2="${x(ms).toFixed(1)}" y2="14"/>`);
    return ticks.join('');
  }

  private traceLabel(): string {
    const t = this.last;
    if (!t) return 'The cell at its resting rate, with nothing presented yet.';
    if (t.kind === 'omitted') return 'A cue with no reward: the cell goes quiet at the moment the reward should have arrived.';
    if (t.kind === 'surprise') return 'An unpredicted reward: a burst at the reward itself.';
    return `A cued reward, with the cue predicting it at strength ${t.v.toFixed(2)}.`;
  }

  private historySvg(): string {
    const W = 320;
    const H = 92;
    const mid = H / 2 - 6;
    const barW = 9;

    if (!this.trials.length)
      return `<svg class="dop-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="No trials yet."><line class="dop-base" x1="8" y1="${mid}" x2="${
        W - 8
      }" y2="${mid}"/><text class="dop-tick" x="160" y="${mid - 8}" text-anchor="middle">error at the moment of reward</text></svg>`;

    const bars = this.trials
      .map((t, i) => {
        const h = Math.abs(t.rewardDelta) * (H / 2 - 16);
        const up = t.rewardDelta >= 0;
        return `<rect class="dop-bar ${up ? 'is-up' : 'is-down'}" x="${8 + i * (barW + 2)}" y="${(up
          ? mid - h
          : mid
        ).toFixed(1)}" width="${barW}" height="${Math.max(1, h).toFixed(1)}"><title>trial ${i + 1}: δ ${t.rewardDelta.toFixed(
          2,
        )}</title></rect>`;
      })
      .join('');

    return (
      `<svg class="dop-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prediction error at the moment of reward, over ${this.trials.length} trials.">` +
      bars +
      `<line class="dop-base" x1="8" y1="${mid}" x2="${W - 8}" y2="${mid}"/>` +
      `<text class="dop-tick" x="8" y="${H - 4}">first</text>` +
      `<text class="dop-tick" x="${W - 8}" y="${H - 4}" text-anchor="end">latest</text>` +
      `</svg>`
    );
  }

  private traceNote(): string {
    const t = this.last;
    if (!t) return 'Three kinds of trial. Start with a reward out of nowhere, then train the cue, then take the reward away.';
    if (t.kind === 'surprise')
      return 'A reward nobody saw coming: a burst at the reward itself, as big as the surprise.';
    if (t.kind === 'omitted')
      return 'The cue came, the reward did not, and the cell went quiet at exactly the moment it was due. Nothing happened — and the cell responded to it.';
    if (t.v < 0.35) return 'Still mostly a surprise. Most of the response is at the reward.';
    if (t.v > 0.8)
      return 'The burst has moved to the cue. The reward itself now produces almost nothing, because by the time it arrives there is nothing left to learn from it.';
    return 'The response is shifting backwards, from the reward towards the thing that predicts it.';
  }

  private verdict(): string {
    const t = this.last;
    if (!t) return 'The cell is not reporting reward. Three trial types will show you what it is reporting instead.';

    if (t.kind === 'omitted' && this.v > 0.5)
      return `Nothing arrived, and the cell dipped below its resting rate. There is no version of “this cell signals pleasure” that predicts a response to an absence — but δ = 0 − ${this.v.toFixed(
        2,
      )} predicts exactly this.`;

    if (this.v > 0.8)
      return `The cue now predicts reward at ${this.v.toFixed(
        2,
      )}, and the reward itself has stopped producing a response. Same juice, same pleasure, no signal — because the signal was never about the juice. Now take the reward away.`;

    if (t.kind === 'surprise')
      return 'Unpredicted reward, full burst. Pair it with a cue a few times and watch where the burst goes.';

    return `V is ${this.v.toFixed(2)} and climbing. Keep pairing — the response should walk backwards from the reward to the cue.`;
  }
}

defineSim('dopamine-sim', DopamineSim);
