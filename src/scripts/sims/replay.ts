/**
 * <replay-sim> — the sequence on the track, and the same sequence in sleep.
 *
 * Three mode tabs walk the reader down the argument, one self-contained beat
 * apiece with one obvious action, and a caption that always names what is on
 * screen now.
 *
 *   Run the track — eight place cells with fields spread along a linear track
 *                   fire in order over about four seconds. That order is the
 *                   thing worth remembering.
 *   Sleep after   — a later slow-wave epoch: four sharp-wave ripples carry the
 *                   same order, compressed roughly twentyfold.
 *   The control   — the insight. The sequence is ABSENT in sleep before the run
 *                   and PRESENT after it, shown side by side, with the ~20×
 *                   compression drawn out. That before-epoch is what makes the
 *                   after-epoch mean anything.
 *
 * The model is unchanged: place fields drive the run spikes; the after epoch
 * carries the track order and the before epoch a shuffle of it; the match is a
 * Spearman rank correlation averaged over the ripples. Nothing is faked — the
 * scores the captions quote come out of that computation.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

type Mode = 'run' | 'sleep' | 'insight';

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

const STATUS: Record<Mode, string> = {
  run: 'running the track',
  sleep: 'sleep after the run',
  insight: 'before vs after',
};

class ReplaySim extends SimElement {
  private mode: Mode = 'run';
  private pos = 0;
  private running = 0;
  private ran = false;
  private runSpikes: Spike[] = [];
  private slept = false;
  private sleepSpikes: Spike[] = [];

  // The insight epochs are computed once, deterministically, so the before/after
  // comparison is stable however often the panel re-renders.
  private beforeSpikes: Spike[] = [];
  private afterSpikes: Spike[] = [];

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.buildControls();
  }

  protected teardown(): void {
    if (this.running) this.cancelInterval(this.running);
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.setAttribute('data-mode', mode);
    if (mode === 'insight' && !this.beforeSpikes.length) {
      this.beforeSpikes = this.makeSleep('before');
      this.afterSpikes = this.makeSleep('after');
    }
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
  }

  /** Sleep mode advances the same beat: run first if you haven't, else record. */
  private advance(): void {
    if (!this.ran) this.run();
    else this.sleep();
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

  /** Four ripples in two seconds. After the run each carries the track order at
   *  20×; before it, the same cells in an order that means nothing. */
  private makeSleep(epoch: 'before' | 'after'): Spike[] {
    const spikes: Spike[] = [];
    const replayMs = RUN_MS / COMPRESSION;

    for (let r = 0; r < RIPPLES; r++) {
      const start = 180 + r * 460 + noise(r * 97) * 60;
      const order =
        epoch === 'after'
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
    return spikes;
  }

  private sleep(): void {
    this.sleepSpikes = this.makeSleep('after');
    this.slept = true;
    this.render();
    this.emit('slept', { epoch: 'after', ripples: RIPPLES });
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

  /* ── how well a sleep epoch's order matches the track order ── */

  /** Rank correlation between track order and firing order inside a ripple,
   *  averaged over every ripple. Averaging matters: one shuffle of eight cells
   *  lands near 0.5 often enough that a single ripple would make the control
   *  look like half a result. */
  private sequenceScore(spikes: Spike[]): number | null {
    if (!spikes.length) return null;

    const scores: number[] = [];
    for (let r = 0; r < RIPPLES; r++) {
      const first = new Map<number, number>();
      for (const s of spikes) {
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

    if (this.mode === 'run') {
      this.addBtn(bar, 'primary', 'sim-btn-primary', () => this.run());
    } else {
      this.addBtn(bar, 'primary', 'sim-btn-primary', () => this.advance());
    }
    this.addBtn(bar, 'reset', 'sim-btn-quiet', () => this.reset(), 'Reset');
  }

  private addBtn(
    bar: HTMLElement,
    act: string,
    cls: string,
    fn: () => void,
    label = '',
  ): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.dataset.simAct = act;
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  private updateControls(): void {
    const primary = this.q<HTMLButtonElement>('[data-sim-act="primary"]');
    if (!primary) return;
    primary.disabled = this.running > 0;
    if (this.mode === 'run') {
      primary.textContent = this.running ? 'Running…' : this.ran ? 'Run the track again' : 'Run the track';
    } else {
      primary.textContent = this.running
        ? 'Running…'
        : !this.ran
          ? 'Run the track first'
          : this.slept
            ? 'Record sleep again'
            : 'Record sleep after the run';
    }
  }

  /* ── view ── */

  protected render(): void {
    this.text('[data-sim-status]', this.running ? STATUS.run : STATUS[this.mode]);
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', this.lead());

    const isInsight = this.mode === 'insight';
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }

    /* the experiment: track + rasters */
    this.show('[data-sim-trackblock]', this.mode === 'run');
    this.show('[data-sim-sleepblock]', this.mode === 'sleep');

    this.html('[data-sim-track]', this.trackSvg());
    this.html('[data-sim-runraster]', this.rasterSvg(this.runSpikes, RUN_MS, 'run'));
    this.html('[data-sim-sleepraster]', this.rasterSvg(this.sleepSpikes, SLEEP_MS, 'sleep'));

    this.text('[data-sim-compression]', this.slept ? `${COMPRESSION}×` : '—');
    this.text('[data-sim-note]', this.note());
    this.updateControls();
  }

  private renderInsight(): void {
    this.html('[data-sim-beforeraster]', this.rasterSvg(this.beforeSpikes, SLEEP_MS, 'before'));
    this.html('[data-sim-afterraster]', this.rasterSvg(this.afterSpikes, SLEEP_MS, 'after'));
    this.html('[data-sim-comp]', this.compressionSvg());

    const before = this.sequenceScore(this.beforeSpikes);
    const after = this.sequenceScore(this.afterSpikes);
    this.text(
      '[data-sim-before-score]',
      `The same eight cells, the same ripples — but the order inside them correlates with the track at only ${(
        before ?? 0
      ).toFixed(2)}, averaged over the four. There is nothing here yet to replay.`,
    );
    this.text(
      '[data-sim-after-score]',
      `The identical recording after the run: the firing order matches the track at ${(after ?? 0).toFixed(
        2,
      )} across all four ripples. The only thing that changed is that the day happened.`,
    );
  }

  private lead(): string {
    if (this.mode === 'run') {
      if (this.running)
        return 'The animal runs the track. Each cell fires as it passes through that cell’s patch of ground — a sequence, spread across about four seconds.';
      if (this.ran)
        return 'Four seconds of running, recorded as eight cells firing in order. That order is the memory. Now switch to Sleep after and look for it offline.';
      return 'Run the track. Eight place cells, each with its own patch of track — they fire one after another as the animal passes through, and that order is the thing worth remembering.';
    }
    if (this.mode === 'sleep') {
      if (!this.ran)
        return 'Nothing to look for a replay of yet — run the track first, so a sleep epoch has an order to be compared against.';
      if (!this.slept)
        return 'Record a later slow-wave sleep epoch and look inside its sharp-wave ripples for that same eight-cell order — it should be there, compressed roughly twenty times.';
      const s = this.sequenceScore(this.sleepSpikes) ?? 0;
      return `There it is: the track order, replayed inside the ripples at ${s.toFixed(2)} and packed into about ${(
        RUN_MS / COMPRESSION
      ).toFixed(0)} ms — four seconds of running run back roughly twentyfold faster.`;
    }
    return 'The insight, not the experiment: the sequence is absent in sleep before the run and present in sleep after it. That before-epoch control is what proves it is the day’s experience being replayed, not a standing habit of the tissue.';
  }

  private note(): string {
    if (this.mode === 'run') {
      if (this.running) return 'Each field lights as the animal enters it; the raster below logs every spike against time.';
      if (this.ran) return 'The run is recorded. Its order — cell 1 through cell 8 — is what a later sleep epoch is searched for.';
      return 'Eight cells, eight patches of track, one after another.';
    }
    if (!this.ran) return 'Use Run the track first; the run raster above is the reference this sleep epoch is matched against.';
    if (!this.slept) return 'A ripple is a burst, not one spike per cell — look for the diagonal of first-spikes cell 1 through 8.';
    return 'The order survives the compression: same diagonal as the run, four seconds squeezed into about two hundred milliseconds.';
  }

  /* ── drawing ── */

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

  private rasterSvg(spikes: Spike[], span: number, kind: 'run' | 'sleep' | 'before' | 'after'): string {
    const W = 320;
    const H = 108;
    const L = 26;
    const R = 310;
    const x = (t: number) => L + clamp(t / span, 0, 1) * (R - L);
    const y = (cell: number) => 12 + (cell / (CELLS - 1)) * (H - 40);
    // The run and the after-run ripples carry the track order (signal); the
    // before-run control does not (muted).
    const tickClass = kind === 'run' ? 'rep-tick-run' : kind === 'before' ? 'rep-tick-null' : 'rep-tick-sleep';

    const rows = Array.from(
      { length: CELLS },
      (_, c) =>
        `<line class="rep-row" x1="${L}" y1="${y(c)}" x2="${R}" y2="${y(c)}"/>` +
        `<text class="rep-cell-label" x="${L - 5}" y="${y(c) + 3}" text-anchor="end">${c + 1}</text>`,
    ).join('');

    const ticks = spikes
      .map(
        s =>
          `<line class="rep-tick ${tickClass}" x1="${x(s.t).toFixed(1)}" y1="${(y(s.cell) - 4).toFixed(
            1,
          )}" x2="${x(s.t).toFixed(1)}" y2="${(y(s.cell) + 4).toFixed(1)}"/>`,
      )
      .join('');

    const emptyLabel =
      kind === 'run' ? 'run the track' : kind === 'sleep' ? 'record a sleep epoch' : '';
    const empty =
      spikes.length || !emptyLabel
        ? ''
        : `<text class="rep-cell-label" x="${(L + R) / 2}" y="${H / 2}" text-anchor="middle">${emptyLabel}</text>`;

    const label =
      kind === 'run'
        ? 'Eight cells firing in order across four seconds of running.'
        : kind === 'before'
          ? 'Eight cells during sleep before the run, in four ripples, with no track order.'
          : 'Eight cells during sleep after the run, in four ripples carrying the track order.';

    return (
      `<svg class="rep-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">` +
      rows +
      ticks +
      empty +
      `<text class="rep-cell-label" x="${L}" y="${H - 6}">0</text>` +
      `<text class="rep-cell-label" x="${R}" y="${H - 6}" text-anchor="end">${(span / 1000).toFixed(0)} s</text>` +
      `</svg>`
    );
  }

  /** The compression figure: the run's eight-cell diagonal, and the same eight
   *  squeezed into a twentieth of the width, with connectors converging. */
  private compressionSvg(): string {
    const W = 320;
    const H = 96;
    const L = 20;
    const R = 300;
    const span = R - L;
    const topY = 22;
    const botY = 74;
    const xTop = (c: number) => L + (c / (CELLS - 1)) * span;
    const xBot = (c: number) => L + (c / (CELLS - 1)) * (span / COMPRESSION);

    const connectors = Array.from(
      { length: CELLS },
      (_, c) =>
        `<line class="rep-comp-link" x1="${xTop(c).toFixed(1)}" y1="${topY + 6}" x2="${xBot(c).toFixed(
          1,
        )}" y2="${botY - 6}"/>`,
    ).join('');

    const topTicks = Array.from(
      { length: CELLS },
      (_, c) => `<circle class="rep-comp-tick" cx="${xTop(c).toFixed(1)}" cy="${topY}" r="3.4"/>`,
    ).join('');
    const botTicks = Array.from(
      { length: CELLS },
      (_, c) => `<circle class="rep-comp-tick" cx="${xBot(c).toFixed(1)}" cy="${botY}" r="3.4"/>`,
    ).join('');

    return (
      `<svg class="rep-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The eight-cell sequence spread across four seconds of running, and the same eight compressed into about two hundred milliseconds in one ripple, roughly twenty times faster.">` +
      `<line class="rep-comp-axis" x1="${L}" y1="${topY}" x2="${R}" y2="${topY}"/>` +
      `<line class="rep-comp-axis" x1="${L}" y1="${botY}" x2="${(L + span / COMPRESSION).toFixed(1)}" y2="${botY}"/>` +
      connectors +
      topTicks +
      botTicks +
      `<text class="rep-cell-label" x="${R}" y="${topY - 8}" text-anchor="end">RUNNING · 4 s</text>` +
      `<text class="rep-cell-label" x="${L}" y="${botY + 18}">ONE RIPPLE · ~200 ms · ≈20×</text>` +
      `</svg>`
    );
  }
}

defineSim('replay-sim', ReplaySim);
