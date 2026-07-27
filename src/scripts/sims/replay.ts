/**
 * <replay-sim> — the sequence on the track, and the same sequence in sleep.
 *
 * Eight place cells with fields spread along a linear track. Running it makes
 * them fire in order over about four seconds. Sleeping afterwards produces
 * sharp-wave ripples containing that same order, compressed roughly twentyfold.
 *
 * The control is the sleep epoch before the run, which is generated the same
 * way except that the order inside each ripple is shuffled. Without it, "the
 * cells fired in sleep" says nothing — cells fire in sleep regardless. What
 * has to be shown is that they fired in *that* order, and only after.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

type Epoch = 'before' | 'after';

interface Spike {
  cell: number;
  t: number;
  /** Which ripple this spike belongs to; absent during the run. */
  ripple?: number;
}

const CELLS = 8;
const RUN_MS = 4000;
const SLEEP_MS = 2000;
const COMPRESSION = 20;
const RIPPLES = 4;
const FIELD_SIGMA = 0.07;

/** Where each cell's field sits along the track, 0 to 1. */
const fieldAt = (cell: number): number => 0.08 + (cell / (CELLS - 1)) * 0.84;

class ReplaySim extends SimElement {
  private pos = 0;
  private running = 0;
  private ran = false;
  private runSpikes: Spike[] = [];
  private epoch: Epoch = 'after';
  private slept = false;
  private sleepSpikes: Spike[] = [];

  protected setup(): void {
    this.onClick('[data-sim-run]', () => this.run());
    this.onClick('[data-sim-sleep]', () => this.sleep());
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-epoch]', el => {
      this.epoch = el.dataset.simEpoch as Epoch;
      this.slept = false;
      this.sleepSpikes = [];
      this.render();
    });
  }

  protected teardown(): void {
    if (this.running) this.cancelInterval(this.running);
  }

  /* ── the run ── */

  private run(): void {
    if (this.running) return;
    this.runSpikes = [];
    this.slept = false;
    this.sleepSpikes = [];
    this.pos = 0;
    this.ran = false;

    const stepMs = 20;
    const steps = RUN_MS / stepMs;

    const advance = (i: number) => {
      this.pos = i / steps;
      const t = i * stepMs;
      for (let c = 0; c < CELLS; c++) {
        const d = this.pos - fieldAt(c);
        const rate = 34 * Math.exp(-(d * d) / (2 * FIELD_SIGMA * FIELD_SIGMA));
        if (noise(i * 31 + c * 617) < (rate * stepMs) / 1000) this.runSpikes.push({ cell: c, t });
      }
    };

    if (prefersReducedMotion()) {
      for (let i = 0; i <= steps; i++) advance(i);
      this.pos = 1;
      this.ran = true;
      this.render();
      this.emit('ran', { spikes: this.runSpikes.length });
      return;
    }

    let i = 0;
    this.running = this.every(stepMs, () => {
      advance(i);
      if (++i > steps) {
        this.cancelInterval(this.running);
        this.running = 0;
        this.ran = true;
        this.emit('ran', { spikes: this.runSpikes.length });
      }
      this.render();
    });
    this.render();
  }

  /* ── the sleep ── */

  /** Four ripples in two seconds. After the run each carries the track order
   *  at 20×; before it, the same cells in an order that means nothing. */
  private sleep(): void {
    const spikes: Spike[] = [];
    const replayMs = RUN_MS / COMPRESSION;

    for (let r = 0; r < RIPPLES; r++) {
      const start = 180 + r * 460 + noise(r * 97) * 60;
      const order =
        this.epoch === 'after'
          ? Array.from({ length: CELLS }, (_, c) => c)
          : Array.from({ length: CELLS }, (_, c) => c).sort(
              (a, b) => noise(a * 53 + r * 811) - noise(b * 53 + r * 811),
            );

      order.forEach((cell, slot) => {
        const t = start + (slot / (CELLS - 1)) * replayMs + (noise(cell * 13 + r * 29) - 0.5) * 5;
        spikes.push({ cell, t, ripple: r });
        // A ripple is a burst, not a single spike per cell.
        spikes.push({ cell, t: t + 3 + noise(cell * 7 + r) * 4, ripple: r });
      });
    }

    this.sleepSpikes = spikes;
    this.slept = true;
    this.render();
    this.emit('slept', { epoch: this.epoch, ripples: RIPPLES });
  }

  private reset(): void {
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    this.pos = 0;
    this.ran = false;
    this.runSpikes = [];
    this.slept = false;
    this.sleepSpikes = [];
    this.render();
    this.emit('reset');
  }

  /* ── how well the sleep order matches the track order ── */

  /** Rank correlation between track order and firing order inside a ripple,
   *  averaged over every ripple in the epoch. Averaging matters: one shuffle
   *  of eight cells lands near 0.5 often enough that a single ripple would
   *  make the control look like half a result. */
  private sequenceScore(): number | null {
    if (!this.sleepSpikes.length) return null;

    const scores: number[] = [];
    for (let r = 0; r < RIPPLES; r++) {
      const first = new Map<number, number>();
      for (const s of this.sleepSpikes) {
        if (s.ripple !== r) continue;
        if (!first.has(s.cell) || s.t < (first.get(s.cell) as number)) first.set(s.cell, s.t);
      }
      const order = [...first.entries()].sort((a, b) => a[1] - b[1]).map(([cell]) => cell);
      if (order.length < 3) continue;
      // Spearman against the track order 0…n-1.
      const n = order.length;
      const d2 = order.reduce((sum, cell, i) => sum + (cell - i) ** 2, 0);
      scores.push(1 - (6 * d2) / (n * (n * n - 1)));
    }

    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /* ── view ── */

  protected render(): void {
    this.text('[data-sim-status]', this.running ? 'running the track' : this.slept ? `sleep · ${this.epoch} the run` : this.ran ? 'run recorded' : 'idle');
    this.pressed('[data-sim-epoch]', 'simEpoch', this.epoch);

    this.html('[data-sim-track]', this.trackSvg());
    this.html('[data-sim-runraster]', this.rasterSvg(this.runSpikes, RUN_MS, 'run'));
    this.html('[data-sim-sleepraster]', this.rasterSvg(this.sleepSpikes, SLEEP_MS, 'sleep'));

    this.disable('[data-sim-sleep]', !this.ran);
    this.text('[data-sim-compression]', this.slept && this.epoch === 'after' ? `${COMPRESSION}×` : '—');
    this.text('[data-sim-track-note]', this.trackNote());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private trackSvg(): string {
    const W = 320;
    const H = 76;
    const x = (p: number) => 16 + p * (W - 32);

    const fields = Array.from({ length: CELLS }, (_, c) => {
      const active = Math.abs(this.pos - fieldAt(c)) < FIELD_SIGMA * 1.4 && (this.running > 0 || this.ran);
      return `<rect class="rep-field${active ? ' is-on' : ''}" x="${(x(fieldAt(c)) - 13).toFixed(
        1,
      )}" y="30" width="26" height="16" rx="2"/><text class="rep-cell-label" x="${x(fieldAt(c)).toFixed(
        1,
      )}" y="60" text-anchor="middle">${c + 1}</text>`;
    }).join('');

    return (
      `<svg class="rep-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A linear track with eight place fields along it, and the animal ${(
        this.pos * 100
      ).toFixed(0)}% of the way along.">` +
      `<line class="rep-track" x1="16" y1="38" x2="${W - 16}" y2="38"/>` +
      fields +
      `<circle class="rep-rat" cx="${x(this.pos).toFixed(1)}" cy="38" r="6"/>` +
      `<text class="rep-cell-label" x="16" y="18">START</text>` +
      `<text class="rep-cell-label" x="${W - 16}" y="18" text-anchor="end">END</text>` +
      `</svg>`
    );
  }

  private rasterSvg(spikes: Spike[], span: number, kind: 'run' | 'sleep'): string {
    const W = 320;
    const H = 108;
    const L = 26;
    const R = 310;
    const x = (t: number) => L + clamp(t / span, 0, 1) * (R - L);
    const y = (cell: number) => 12 + (cell / (CELLS - 1)) * (H - 40);

    const rows = Array.from(
      { length: CELLS },
      (_, c) =>
        `<line class="rep-row" x1="${L}" y1="${y(c)}" x2="${R}" y2="${y(c)}"/>` +
        `<text class="rep-cell-label" x="${L - 5}" y="${y(c) + 3}" text-anchor="end">${c + 1}</text>`,
    ).join('');

    const ticks = spikes
      .map(
        s =>
          `<line class="rep-tick rep-tick-${kind}" x1="${x(s.t).toFixed(1)}" y1="${(y(s.cell) - 4).toFixed(
            1,
          )}" x2="${x(s.t).toFixed(1)}" y2="${(y(s.cell) + 4).toFixed(1)}"/>`,
      )
      .join('');

    const empty = spikes.length
      ? ''
      : `<text class="rep-cell-label" x="${(L + R) / 2}" y="${H / 2}" text-anchor="middle">${
          kind === 'run' ? 'run the track' : 'record a sleep epoch'
        }</text>`;

    return (
      `<svg class="rep-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${
        kind === 'run'
          ? 'Eight cells firing in order across four seconds of running.'
          : 'Eight cells during sleep, in four brief ripples.'
      }">` +
      rows +
      ticks +
      empty +
      `<text class="rep-cell-label" x="${L}" y="${H - 6}">0</text>` +
      `<text class="rep-cell-label" x="${R}" y="${H - 6}" text-anchor="end">${(span / 1000).toFixed(0)} s</text>` +
      `</svg>`
    );
  }

  private trackNote(): string {
    if (this.running) return 'Each cell fires as the animal passes through its own patch of track. That order is the thing worth remembering.';
    if (!this.ran) return 'Run the track. Eight cells, eight patches of track, one after another.';
    return 'Four seconds of running, recorded. Now record a sleep epoch and look for that same order in it.';
  }

  private verdict(): string {
    if (!this.ran) return 'The run has to come first — there is nothing to look for a replay of until there is a sequence to replay.';
    if (!this.slept) return 'Cells fire in sleep whatever you do. What has to be shown is that they fire in the track order, and only after the track — so try both epochs.';

    const score = this.sequenceScore();
    const r = score === null ? 0 : score;

    if (this.epoch === 'before')
      return `Sleep before the run: the same cells, the same ripples, the same burst structure — and an order that correlates with the track at ${r.toFixed(
        2,
      )}, averaged over the four. This is the control, and it is why the other epoch counts for anything.`;

    return `Sleep after the run: the track order, at ${r.toFixed(
      2,
    )} across all four ripples, packed into about ${(RUN_MS / COMPRESSION).toFixed(0)} ms — four seconds of running compressed roughly twentyfold. It only reads as sequence because enough cells were recorded at once to see one; a single cell firing in sleep would have told you nothing.`;
  }
}

defineSim('replay-sim', ReplaySim);
