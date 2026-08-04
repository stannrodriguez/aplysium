/**
 * <orientation-sim> — one cell in V1, the angle it wants, and where that
 * preference comes from.
 *
 * The markup is server-rendered by OrientationSim.astro; this class attaches to
 * it and drives the readouts. Like the other guided instruments it is three
 * mode tabs, one obvious action apiece, and a caption that always describes what
 * you are looking at now:
 *
 *   Find the angle — sweep a bar over the receptive field, present it one angle
 *                    at a time, and build the tuning curve. The cell fires hard
 *                    at its preferred angle and falls near-silent a few degrees
 *                    off it.
 *   Spot vs bar    — a spot of light does almost nothing. Months of spots was
 *                    what had been failing to move these cells; the edge of a
 *                    bar is what finally drove one.
 *   How it's built — the insight, not the experiment: the orientation-selective
 *                    cell is a row of centre-surround spot-detectors (the retinal
 *                    and LGN cells of the study before) wired in a line along the
 *                    preferred angle. A bar that lies along the row lights every
 *                    centre; a bar across it catches one or two. Selectivity is
 *                    assembled in stages from the cells below.
 *
 * The model is unchanged: the cell is a Gaussian on orientation with a half-width
 * of about thirteen degrees, wrapped at 180° because a bar has no head or tail.
 * The insight geometry reconstructs that same falloff from five subunits.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type Mode = 'find' | 'spot' | 'built';
type Stimulus = 'bar' | 'dot';

const BASE_RATE = 2;
const PEAK_RATE = 58;
const SIGMA = 13; // degrees
const DOT_RATE = 5;

/* insight geometry — five spot-detectors strung along the preferred axis */
const SUBUNITS = [-2, -1, 0, 1, 2];
const SUB_SPACING = 24; // px between subunit centres in the wiring drawing
const SUB_HALFWIDTH = 13; // a subunit's centre is lit when the bar covers it
const WIRE_CX = 108;
const WIRE_CY = 88;

/** Smallest angle between two orientations, which wrap at 180 not 360. */
const apart = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

const LEAD: Record<Mode, string> = {
  find:
    'Sweep a bar of light across the cell’s receptive field and present it. The cell has a preferred angle; a few degrees off it and the firing collapses. Build the tuning curve one angle at a time.',
  spot:
    'Now try a plain spot of light in the middle of the field — the stimulus everyone had been using. Then present the bar at the cell’s angle. The same cell, the same field: one does almost nothing, the other snaps it awake.',
  built:
    'The insight, not the experiment: this cell does not detect orientation by magic. It is a row of centre-surround spot-detectors — retinal and LGN cells from the study before — wired in a line. Rotate the test bar and watch the preference assemble itself.',
};

class OrientationSim extends SimElement {
  private mode: Mode = 'find';

  /** This cell's preferred angle. A different cell wants a different one. */
  private preferred = 65;
  private cellNo = 1;
  private angle = 0;
  private stimulus: Stimulus = 'bar';
  private tried = new Map<number, number>();
  private lastRate: number | null = null;

  /** Insight mode's own control: the angle of the test bar over the wiring. */
  private buildAngle = 0;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.on('[data-sim-angle]', 'input', el => {
      this.angle = Number((el as HTMLInputElement).value);
      this.lastRate = null;
      this.stimulus = 'bar';
      this.render();
    });
    this.on('[data-sim-build-angle]', 'input', el => {
      this.buildAngle = Number((el as HTMLInputElement).value);
      this.render();
      this.emit('build-angle', { angle: this.buildAngle, covered: this.coveredCount() });
    });
    this.buildControls();
  }

  /* ── model (unchanged) ── */

  private rateAt(angle: number): number {
    const d = apart(angle, this.preferred);
    return BASE_RATE + PEAK_RATE * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
  }

  /* ── the experiment ── */

  private present(): void {
    this.stimulus = 'bar';
    const rate = this.rateAt(this.angle);
    this.lastRate = rate;
    this.tried.set(this.angle, rate);
    this.render();
    this.emit('presented', { stimulus: 'bar', angle: this.angle, rate });
  }

  /** Every angle in five-degree steps — the systematic method that followed
   *  the accident. */
  private sweep(): void {
    this.stimulus = 'bar';
    for (let a = 0; a < 180; a += 5) this.tried.set(a, this.rateAt(a));
    this.angle = this.preferred;
    this.lastRate = this.rateAt(this.preferred);
    this.setInput('[data-sim-angle]', this.preferred);
    this.render();
    this.emit('swept', { preferred: this.preferred });
  }

  /** Spot vs bar: the spot centred in the field, then the bar at its angle. */
  private flashSpot(): void {
    this.stimulus = 'dot';
    this.lastRate = DOT_RATE;
    this.render();
    this.emit('presented', { stimulus: 'dot', rate: DOT_RATE });
  }

  private flashBar(): void {
    this.stimulus = 'bar';
    this.angle = this.preferred;
    this.lastRate = this.rateAt(this.preferred);
    this.setInput('[data-sim-angle]', this.preferred);
    this.render();
    this.emit('presented', { stimulus: 'bar', angle: this.preferred, rate: this.lastRate });
  }

  private nextCell(): void {
    this.cellNo += 1;
    // A fresh penetration finds a cell wanting some other angle entirely.
    // Rounded to the slider's own step, so the best angle is one the reader
    // can actually land on.
    this.preferred = Math.round((noise(this.cellNo * 41 + 7) * 175) / 5) * 5;
    this.tried.clear();
    this.lastRate = null;
    this.stimulus = 'bar';
    this.render();
    this.emit('new-cell', { cell: this.cellNo });
  }

  private setInput(selector: string, value: number): void {
    const el = this.q<HTMLInputElement>(selector);
    if (el) el.value = String(value);
  }

  /* ── the insight model ──
     Each subunit sits at along-axis distance s·spacing from the receptive-field
     centre. A test bar through the centre, offset by Δ from the preferred axis,
     misses a subunit's centre by s·spacing·sin(Δ). When that gap is smaller than
     the bar's half-width the centre is lit. On axis every centre is lit; off
     axis the bar crosses the row and catches only the near ones — the geometry
     that builds the tuning curve out of parts. */

  private coverage(): boolean[] {
    const delta = (apart(this.buildAngle, this.preferred) * Math.PI) / 180;
    return SUBUNITS.map(s => Math.abs(s * SUB_SPACING * Math.sin(delta)) < SUB_HALFWIDTH);
  }

  private coveredCount(): number {
    return this.coverage().filter(Boolean).length;
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.setAttribute('data-mode', mode);
    this.lastRate = null;
    if (mode !== 'built') this.stimulus = 'bar';
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { cell: this.cellNo });
  }

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'built') {
      // The insight runs itself: the reader drives it with the test-bar slider.
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (this.mode === 'find') {
      this.addBtn(bar, 'Present the bar', 'sim-btn-primary', () => this.present());
      this.addBtn(bar, 'Sweep every angle', 'sim-btn-outline', () => this.sweep());
      this.addBtn(bar, 'Next cell', 'sim-btn-quiet', () => this.nextCell());
    } else {
      this.addBtn(bar, 'Flash the spot', 'sim-btn-primary', () => this.flashSpot());
      this.addBtn(bar, 'Now the bar', 'sim-btn-outline', () => this.flashBar());
      this.addBtn(bar, 'Next cell', 'sim-btn-quiet', () => this.nextCell());
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
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', LEAD[this.mode]);

    const isBuilt = this.mode === 'built';
    this.show('[data-sim-experiment]', !isBuilt);
    this.show('[data-sim-insight]', isBuilt);

    if (isBuilt) {
      this.text('[data-sim-status]', `cell ${this.cellNo} · built from 5 inputs`);
      this.renderInsight();
      return;
    }

    // Find shows the slider and the accumulating tuning curve; spot vs bar is a
    // straight before/after, so it hides both.
    const isFind = this.mode === 'find';
    this.show('[data-sim-anglefield]', isFind);
    this.show('[data-sim-tuningwrap]', isFind);

    const rate = this.lastRate;
    this.text('[data-sim-status]', `cell ${this.cellNo} · ${this.tried.size} angles tried`);
    this.text('[data-sim-rate]', rate === null ? '—' : `${rate.toFixed(0)} /s`);
    this.text('[data-sim-angle-value]', `${this.angle}°`);

    this.html('[data-sim-screen]', this.screenSvg());
    this.html('[data-sim-raster]', this.rasterSvg(rate ?? 0, rate !== null));
    if (isFind) this.html('[data-sim-tuning]', this.tuningSvg());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private renderInsight(): void {
    const cover = this.coverage();
    const n = cover.filter(Boolean).length;
    const out = Math.round((n / SUBUNITS.length) * 100);

    this.text('[data-sim-build-value]', `${this.buildAngle}°`);
    this.text('[data-sim-covered]', String(n));
    this.text('[data-sim-cort]', `${out}%`);
    this.css('[data-sim-cort-meter]', 'width', `${out}%`);
    this.css('[data-sim-cort-meter]', 'background', out > 55 ? 'var(--sim-signal)' : 'var(--sim-rest)');
    this.html('[data-sim-wiring]', this.wiringSvg(cover, out));
    this.text('[data-sim-build-verdict]', this.buildVerdict(n));
  }

  private screenSvg(): string {
    const cx = 160;
    const cy = 80;
    const stim =
      this.stimulus === 'dot'
        ? `<circle class="ori-bar" cx="${cx}" cy="${cy}" r="7"/>`
        : `<g transform="rotate(${-this.angle} ${cx} ${cy})">` +
          `<rect class="ori-bar" x="${cx - 62}" y="${cy - 5}" width="124" height="10" rx="2"/></g>`;

    return (
      `<svg class="ori-svg" viewBox="0 0 320 160" role="img" aria-label="${
        this.stimulus === 'dot'
          ? 'A spot of light on the screen, over the cell’s receptive field.'
          : `A bar of light at ${this.angle} degrees, over the cell’s receptive field.`
      }">` +
      `<rect class="ori-screen" x="0" y="0" width="320" height="160"/>` +
      `<circle class="ori-field" cx="${cx}" cy="${cy}" r="52"/>` +
      stim +
      `<text class="ori-label" x="10" y="152">RECEPTIVE FIELD</text>` +
      `</svg>`
    );
  }

  private rasterSvg(rate: number, live: boolean): string {
    const ticks: string[] = [];
    if (live)
      for (let row = 0; row < 3; row++)
        for (let t = 0; t < 1000; t += 4)
          if (noise(row * 613 + t * 7 + Math.round(rate * 13) + this.cellNo * 97) < (rate * 4) / 1000) {
            const x = 8 + (t / 1000) * 304;
            const y = 10 + row * 14;
            ticks.push(`<line class="ori-tick" x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${y + 10}"/>`);
          }

    return (
      `<svg class="ori-svg" viewBox="0 0 320 60" role="img" aria-label="${
        live ? `The cell firing at about ${rate.toFixed(0)} per second.` : 'The cell, with nothing presented yet.'
      }">` +
      ticks.join('') +
      (live ? '' : '<text class="ori-label" x="160" y="34" text-anchor="middle">PRESENT SOMETHING</text>') +
      `</svg>`
    );
  }

  private tuningSvg(): string {
    const W = 320;
    const H = 128;
    const L = 30;
    const R = 306;
    const x = (a: number) => L + (a / 180) * (R - L);
    const y = (r: number) => 12 + (1 - clamp(r, 0, 62) / 62) * (H - 36);

    const axis =
      [0, 30, 60].map(r => `<line class="ori-grid" x1="${L}" y1="${y(r)}" x2="${R}" y2="${y(r)}"/>` +
        `<text class="ori-tick-label" x="${L - 5}" y="${y(r) + 3}" text-anchor="end">${r}</text>`).join('') +
      `<text class="ori-tick-label" x="${L}" y="${H - 5}">0°</text>` +
      `<text class="ori-tick-label" x="${(L + R) / 2}" y="${H - 5}" text-anchor="middle">90°</text>` +
      `<text class="ori-tick-label" x="${R}" y="${H - 5}" text-anchor="end">180°</text>`;

    const points = [...this.tried.entries()].sort((a, b) => a[0] - b[0]);

    // Only join the readings up once there are enough of them to be a curve
    // rather than a line drawn between two guesses.
    const curve =
      points.length >= 6
        ? `<polyline class="ori-curve" points="${points.map(([a, r]) => `${x(a).toFixed(1)},${y(r).toFixed(1)}`).join(' ')}"/>`
        : '';

    const dots = points
      .map(
        ([a, r]) =>
          `<circle class="ori-point${a === this.angle ? ' is-current' : ''}" cx="${x(a).toFixed(1)}" cy="${y(
            r,
          ).toFixed(1)}" r="3.4"><title>${a}°: ${r.toFixed(0)} spikes per second</title></circle>`,
      )
      .join('');

    const empty = points.length
      ? ''
      : `<text class="ori-tick-label" x="160" y="${H / 2}" text-anchor="middle">every angle you try lands here</text>`;

    return `<svg class="ori-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Firing rate against bar angle, from ${points.length} readings.">${axis}${curve}${dots}${empty}</svg>`;
  }

  /** The wiring diagram: five centre-surround spot-detectors strung along the
   *  preferred axis, the test bar laid over them, and the cortical cell they
   *  sum into. */
  private wiringSvg(cover: boolean[], out: number): string {
    const rad = (-this.preferred * Math.PI) / 180;
    const cortX = 268;
    const cortY = WIRE_CY;

    let subs = '';
    let wires = '';
    SUBUNITS.forEach((s, i) => {
      const dx = s * SUB_SPACING;
      const px = WIRE_CX + dx * Math.cos(rad);
      const py = WIRE_CY + dx * Math.sin(rad);
      const lit = cover[i];
      // centre-surround glyph: an off surround ring, an on centre disc
      subs +=
        `<circle class="ori-sur" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10"/>` +
        `<circle class="ori-cen${lit ? ' is-lit' : ''}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5"/>`;
      wires +=
        `<line class="ori-wire${lit ? ' is-lit' : ''}" x1="${px.toFixed(1)}" y1="${py.toFixed(
          1,
        )}" x2="${cortX - 20}" y2="${cortY}"/>`;
    });

    // the test bar, drawn the same way as on the screen
    const bar =
      `<g transform="rotate(${-this.buildAngle} ${WIRE_CX} ${WIRE_CY})">` +
      `<rect class="ori-bar ori-testbar" x="${WIRE_CX - 74}" y="${WIRE_CY - 5}" width="148" height="10" rx="2"/></g>`;

    const cort =
      `<rect class="ori-cort" x="${cortX - 18}" y="${cortY - 20}" width="46" height="40" rx="7" style="fill-opacity:${(
        0.15 +
        (out / 100) * 0.85
      ).toFixed(2)}"/>` +
      `<text class="ori-cort-label" x="${cortX + 5}" y="${cortY + 34}" text-anchor="middle">V1 CELL</text>`;

    const n = cover.filter(Boolean).length;
    return (
      `<svg class="ori-svg" viewBox="0 0 320 176" role="img" aria-label="A test bar at ${this.buildAngle} degrees over five spot-detectors aligned at ${this.preferred} degrees: ${n} of five centres lit, cortical cell output ${out} percent.">` +
      wires +
      bar +
      subs +
      cort +
      `<text class="ori-label" x="10" y="168">SPOT-DETECTORS, ALIGNED AT ${this.preferred}°</text>` +
      `</svg>`
    );
  }

  /* ── the sentences that match the state ── */

  private verdict(): string {
    if (this.mode === 'spot') {
      if (this.lastRate === null)
        return 'Flash the spot first — the stimulus that had failed for months — then present the bar at the cell’s angle and compare what the electrode does.';
      if (this.stimulus === 'dot')
        return 'A spot of light in the middle of the field, and the cell barely moves — about five spikes a second, no different from rest. This is exactly why these cells looked unresponsive: nobody was showing them an edge.';
      return `The same cell, the same receptive field — but a bar at ${this.angle}° instead of a spot, and it fires at ${this.rateAt(
        this.angle,
      ).toFixed(0)} a second. The cell was never silent. It was waiting for a line.`;
    }

    // find mode
    if (this.tried.size < 3) {
      if (this.lastRate === null)
        return 'Try a few angles. The cell answers to one of them and to almost nothing else.';
      const d = apart(this.angle, this.preferred);
      if (d < 8) return 'That is the angle. A few degrees either way and most of this goes.';
      if (d < 25) return 'Close — the rate is climbing, so the preferred angle is somewhere nearby.';
      return 'Almost nothing. The bar is sweeping the field; the cell has no interest in it at this angle.';
    }

    const best = [...this.tried.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
    const peak = best[1];
    const halfWidth = [...this.tried.entries()]
      .filter(([, r]) => r >= BASE_RATE + (peak - BASE_RATE) / 2)
      .map(([a]) => apart(a, best[0]));
    const width = halfWidth.length ? Math.max(...halfWidth) : 0;

    if (this.tried.size >= 12)
      return `The whole curve: a peak at ${best[0]}° and baseline everywhere more than about thirty degrees off it. Half the response is gone within ${width}° of the best angle — narrower than the width of the bar itself. Take another penetration and the next cell wants a different angle entirely.`;

    return `Best so far: ${best[0]}° at ${peak.toFixed(0)} spikes per second. Fill in the angles either side of it — the interesting number is how fast it falls off, not how high it goes.`;
  }

  private buildVerdict(n: number): string {
    const d = apart(this.buildAngle, this.preferred);
    if (d < 8)
      return `The bar lies along the whole row, so all ${n} centres are lit and the cortical cell they feed fires hard. This is the preferred angle — and now you can see why it is preferred: the inputs were arranged along it.`;
    if (n <= 1)
      return 'Off-angle, the bar crosses the row instead of lying along it. It catches one centre and misses the rest, so the cortical cell stays near silent. Nothing here detects orientation — it is five spot-detectors wired in a line.';
    return `Rotating off the axis, the bar covers ${n} centres instead of all five, and the cortical cell’s output drops with them. Selectivity is not built into any one cell — it is assembled from how the inputs are laid out.`;
  }
}

defineSim('orientation-sim', OrientationSim);
