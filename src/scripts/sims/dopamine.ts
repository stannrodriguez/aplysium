/**
 * <dopamine-sim> — the cell that reports surprise, as a guided instrument.
 *
 * One midbrain dopamine neuron, and one learned association driving it. The
 * cue's associative strength V is updated trial by trial with Rescorla–Wagner,
 * V += α(R − V), and the cell's response at each moment is the prediction
 * error δ at that moment: R − V when the reward lands, V when the cue appears
 * and turns out to predict one. That is the entire model, and everything the
 * panel shows falls out of it.
 *
 * The markup is server-rendered by DopamineSim.astro; this class attaches and
 * drives the readouts along a guided path — four mode tabs, one obvious action
 * apiece, and a caption that always describes what you are looking at now.
 *
 *   Unexpected  — juice with no warning cue: a burst as big as the surprise.
 *   Predicted   — pair a cue with the juice; the burst walks back onto the cue.
 *   Omission    — a trained cue, then nothing: the cell dips below baseline.
 *   Prediction error — the insight: all three are one quantity, δ = got − expected.
 *                 The omission dip is decisive, and the burst migrates to the cue.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type Mode = 'unexpected' | 'predicted' | 'omission' | 'insight';
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

const STATUS: Record<Mode, string> = {
  unexpected: 'unpredicted reward',
  predicted: 'training the cue',
  omission: 'reward withheld',
  insight: 'it is prediction error',
};

class DopamineSim extends SimElement {
  private mode: Mode = 'unexpected';
  /** How well the cue predicts reward. Starts knowing nothing. */
  private v = 0;
  private trials: Trial[] = [];
  private last: Trial | null = null;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.buildControls();
  }

  /* ── model ── */

  /** One trial. cued/rewarded follow the kind; δ and the V update are the model. */
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

  /** The associative strength a cue reaches after eight pairings from rest —
   *  computed by the same rule, so a "trained cue" is the model's own number. */
  private trainedV(): number {
    let v = 0;
    for (let i = 0; i < 8; i++) v = clamp(v + ALPHA * (1 - v), 0, 1);
    return v;
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.setAttribute('data-mode', mode);

    // Each mode starts its own beat. Unexpected and Predicted begin from a cue
    // that means nothing; Omission needs a cue already trained for there to be
    // an expectation to violate.
    if (mode === 'omission') {
      this.v = this.trainedV();
    } else if (mode !== 'insight') {
      this.v = 0;
    }
    this.trials = [];
    this.last = null;

    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
  }

  private resetPredicted(): void {
    this.v = 0;
    this.trials = [];
    this.last = null;
    this.render();
    this.emit('reset');
  }

  private retrainCue(): void {
    this.v = this.trainedV();
    this.trials = [];
    this.last = null;
    this.render();
    this.emit('retrain');
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'insight') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (this.mode === 'unexpected') {
      this.addBtn(bar, 'Deliver juice — no cue', 'sim-btn-primary', () => this.run('surprise'));
    } else if (this.mode === 'predicted') {
      this.addBtn(bar, 'Pair the cue with juice', 'sim-btn-primary', () => this.run('paired'));
      this.addBtn(bar, 'Reset cue', 'sim-btn-quiet', () => this.resetPredicted());
    } else {
      this.addBtn(bar, 'Present cue, withhold juice', 'sim-btn-primary', () => this.run('omitted'));
      this.addBtn(bar, 'Retrain cue', 'sim-btn-quiet', () => this.retrainCue());
    }
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
    this.text(
      '[data-sim-status]',
      `V = ${this.v.toFixed(2)} · ${this.trials.length} trials · ${STATUS[this.mode]}`,
    );
    this.text('[data-sim-v]', this.v.toFixed(2));
    this.css('[data-sim-v-bar]', 'width', `${this.v * 100}%`);
    this.text('[data-sim-lead]', this.lead());

    this.pressed('[data-sim-mode]', 'simMode', this.mode);

    const isInsight = this.mode === 'insight';
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }

    const t = this.last;
    this.text(
      '[data-sim-delta]',
      t ? `${t.rewardDelta >= 0 ? '+' : '−'}${Math.abs(t.rewardDelta).toFixed(2)}` : '—',
    );
    this.html('[data-sim-trace]', this.traceSvg(t, { seed: this.trials.length }));
    this.html('[data-sim-history]', this.historySvg());
  }

  /** The cell across one trial: baseline, a response at the cue, a response
   *  at the reward — up for positive δ, down through baseline for negative. */
  private traceSvg(
    t: Trial | null,
    opts: { W?: number; H?: number; raster?: boolean; seed?: number } = {},
  ): string {
    const W = opts.W ?? 320;
    const H = opts.H ?? 148;
    const raster = opts.raster ?? true;
    const L = 30;
    const R = W - 12;
    const x = (ms: number) => L + (ms / SPAN_MS) * (R - L);
    const y = (rate: number) => 16 + (1 - clamp(rate, 0, 30) / 30) * (H - 46);

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
    for (let ms = 0; ms <= SPAN_MS; ms += 10)
      points.push(`${x(ms).toFixed(1)},${y(rateAt(ms)).toFixed(1)}`);

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

    const rasterRow = t && raster ? this.rasterRow(rateAt, x, opts.seed ?? 0) : '';

    const trace = t ? `<polyline class="dop-trace" points="${points.join(' ')}"/>` : '';
    const empty = t
      ? ''
      : `<text class="dop-tick" x="${W / 2}" y="${H / 2}" text-anchor="middle">run a trial and watch where the burst goes</text>`;

    return `<svg class="dop-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.traceLabel(
      t,
    )}">${baseline}${marks}${trace}${rasterRow}${empty}</svg>`;
  }

  private rasterRow(
    rateAt: (ms: number) => number,
    x: (ms: number) => number,
    seed: number,
  ): string {
    const ticks: string[] = [];
    for (let ms = 0; ms < SPAN_MS; ms += 8)
      if (noise(ms * 3 + seed * 71) < (rateAt(ms) * 8) / 1000)
        ticks.push(
          `<line class="dop-spike" x1="${x(ms).toFixed(1)}" y1="6" x2="${x(ms).toFixed(1)}" y2="14"/>`,
        );
    return ticks.join('');
  }

  private traceLabel(t: Trial | null): string {
    if (!t) return 'The cell at its resting rate, with nothing presented yet.';
    if (t.kind === 'omitted')
      return `A trained cue with no reward: the cell drops below baseline at the moment the reward was due, error of 0 minus ${Math.abs(
        t.rewardDelta,
      ).toFixed(2)}.`;
    if (t.kind === 'surprise') return 'An unpredicted reward: a burst at the reward itself.';
    return `A cued reward, with the cue predicting it at strength ${t.v.toFixed(
      2,
    )}; the burst sits mostly at the cue.`;
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
        ).toFixed(1)}" width="${barW}" height="${Math.max(1, h).toFixed(
          1,
        )}"><title>trial ${i + 1}: δ ${t.rewardDelta.toFixed(2)}</title></rect>`;
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

  /* ── the state-matched caption ── */

  private lead(): string {
    const t = this.last;

    if (this.mode === 'unexpected') {
      if (!t)
        return 'A reward out of nowhere. Deliver juice with no warning cue and watch the cell — an unpredicted reward should produce a burst as big as the surprise.';
      return 'An unpredicted reward: a burst at the juice itself. No cue predicted it, so the whole reward is news — error of one minus nothing. Repeat it and the burst never fades, because nothing ever comes to predict it.';
    }

    if (this.mode === 'predicted') {
      if (!t || this.v < 0.15)
        return 'Now give the juice a warning cue and pair them. At first the cue means nothing, so the burst is still at the juice. Keep pairing and watch where the response goes.';
      if (this.v > 0.8)
        return 'The burst has moved onto the cue. The juice now lands exactly as predicted, so it produces almost nothing — same juice, same pleasure, no signal. The response was never about the juice.';
      return 'The response is walking backwards — off the juice and onto the cue that predicts it. The cue is becoming the earliest moment the good news arrives.';
    }

    if (this.mode === 'omission') {
      if (!t)
        return `The cue is trained: the monkey now expects juice at V = ${this.v.toFixed(
          2,
        )}. Withhold it — present the cue and give nothing, and watch the cell at the exact moment the juice was due.`;
      if (this.v < 0.35)
        return 'Keep withholding and the cue stops predicting juice: V falls and the dip shrinks with it. The cell only dips as far as the expectation it still holds — extinction, in one neuron.';
      return `Nothing arrived — and at the precise moment the juice was due, the cell dropped below its resting rate. Nothing happened, yet the cell responded to it: error of nothing minus ${Math.abs(
        t.rewardDelta,
      ).toFixed(2)}.`;
    }

    // insight
    return 'The insight, not the experiment: the cell reports prediction error — what you got minus what you expected — not reward or pleasure. The omission dip settles it, and the burst migrates to the earliest reliable predictor.';
  }

  /* ── the insight view ── */

  private renderInsight(): void {
    const vT = this.trainedV();
    const surprise: Trial = { kind: 'surprise', cueDelta: 0, rewardDelta: 1, v: 0 };
    const paired: Trial = { kind: 'paired', cueDelta: vT, rewardDelta: 1 - vT, v: vT };
    const omitted: Trial = { kind: 'omitted', cueDelta: vT, rewardDelta: 0 - vT, v: vT };

    const mini = { W: 240, H: 96, raster: false };
    this.html('[data-sim-ins-surprise]', this.traceSvg(surprise, { ...mini, seed: 1 }));
    this.html('[data-sim-ins-paired]', this.traceSvg(paired, { ...mini, seed: 2 }));
    this.html('[data-sim-ins-omitted]', this.traceSvg(omitted, { ...mini, seed: 3 }));

    this.text('[data-sim-ins-surprise-d]', 'burst at juice · δ = 1 − 0 = +1.00');
    this.text(
      '[data-sim-ins-paired-d]',
      `burst at cue · δ = +${vT.toFixed(2)} · at juice · δ = 1 − ${vT.toFixed(2)} = +${(1 - vT).toFixed(2)}`,
    );
    this.text('[data-sim-ins-omitted-d]', `dip at the due moment · δ = 0 − ${vT.toFixed(2)} = −${vT.toFixed(2)}`);

    this.text(
      '[data-sim-insight-verdict]',
      'The dip is the decisive one. When a trained cue promises juice and none comes, the cell fires below its baseline at the exact moment the juice was due — a response to nothing at all, which no signal of reward or pleasure could produce. All three responses are one quantity, δ, and it matches the temporal-difference error term from reinforcement learning, term for term, measured in single neurons. That same term is why the burst migrates from the juice to the cue: once the cue predicts the reward, the earliest reliable predictor is where the news, and the error, now live.',
    );
  }
}

defineSim('dopamine-sim', DopamineSim);
