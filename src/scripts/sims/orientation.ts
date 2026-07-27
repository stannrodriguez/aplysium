/**
 * <orientation-sim> — one cell in V1, and the angle it wants.
 *
 * The cell is a Gaussian on orientation with a half-width of about thirteen
 * degrees, wrapped at 180° because a bar has no head or tail. Rate is computed
 * from the bar's angle, so the tuning curve the reader builds is the readings
 * they took, in the order they took them.
 *
 * The dot is the control and the historical accident in one: dots had been
 * failing to drive these cells for months before the edge of a glass slide
 * swept across the projector and one of them fired.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type Stimulus = 'bar' | 'dot';

const BASE_RATE = 2;
const PEAK_RATE = 58;
const SIGMA = 13; // degrees
const DOT_RATE = 5;

/** Smallest angle between two orientations, which wrap at 180 not 360. */
const apart = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

class OrientationSim extends SimElement {
  /** This cell's preferred angle. A different cell wants a different one. */
  private preferred = 65;
  private cellNo = 1;
  private angle = 0;
  private stimulus: Stimulus = 'bar';
  private tried = new Map<number, number>();
  private lastRate: number | null = null;

  protected setup(): void {
    this.onClick('[data-sim-present]', () => this.present());
    this.onClick('[data-sim-sweep]', () => this.sweep());
    this.onClick('[data-sim-next-cell]', () => this.nextCell());
    this.onClick('[data-sim-stimulus]', el => {
      this.stimulus = el.dataset.simStimulus as Stimulus;
      this.lastRate = null;
      this.render();
    });
    this.on('[data-sim-angle]', 'input', el => {
      this.angle = Number((el as HTMLInputElement).value);
      this.lastRate = null;
      this.render();
    });
  }

  /* ── model ── */

  private rateAt(angle: number): number {
    const d = apart(angle, this.preferred);
    return BASE_RATE + PEAK_RATE * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
  }

  private present(): void {
    const rate = this.stimulus === 'dot' ? DOT_RATE : this.rateAt(this.angle);
    this.lastRate = rate;
    if (this.stimulus === 'bar') this.tried.set(this.angle, rate);
    this.render();
    this.emit('presented', { stimulus: this.stimulus, angle: this.angle, rate });
  }

  /** Every angle in ten-degree steps — the systematic method that followed
   *  the accident. */
  private sweep(): void {
    this.stimulus = 'bar';
    for (let a = 0; a < 180; a += 5) this.tried.set(a, this.rateAt(a));
    this.angle = this.preferred;
    this.lastRate = this.rateAt(this.preferred);
    this.setAngleInput(this.preferred);
    this.render();
    this.emit('swept', { preferred: this.preferred });
  }

  private nextCell(): void {
    this.cellNo += 1;
    // A fresh penetration finds a cell wanting some other angle entirely.
    // Rounded to the slider's own step, so the best angle is one the reader
    // can actually land on.
    this.preferred = Math.round((noise(this.cellNo * 41 + 7) * 175) / 5) * 5;
    this.tried.clear();
    this.lastRate = null;
    this.render();
    this.emit('new-cell', { cell: this.cellNo });
  }

  private setAngleInput(value: number): void {
    const el = this.q<HTMLInputElement>('[data-sim-angle]');
    if (el) el.value = String(value);
  }

  /* ── view ── */

  protected render(): void {
    const rate = this.lastRate;

    this.text('[data-sim-status]', `cell ${this.cellNo} · ${this.tried.size} angles tried`);
    this.text('[data-sim-rate]', rate === null ? '—' : `${rate.toFixed(0)} /s`);
    this.text('[data-sim-angle-value]', `${this.angle}°`);
    this.pressed('[data-sim-stimulus]', 'simStimulus', this.stimulus);

    this.html('[data-sim-screen]', this.screenSvg());
    this.html('[data-sim-raster]', this.rasterSvg(rate ?? 0, rate !== null));
    this.html('[data-sim-tuning]', this.tuningSvg());
    this.text('[data-sim-screen-note]', this.screenNote());
    this.text('[data-sim-verdict]', this.verdict());
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

  private screenNote(): string {
    if (this.stimulus === 'dot')
      return 'A spot of light, anywhere in the field. This is what had been tried for months, and it is why the cell looked silent.';
    const d = apart(this.angle, this.preferred);
    if (this.lastRate === null) return 'Set an angle and present the bar. The cell has a preference; it will not tell you what it is.';
    if (d < 8) return 'This is the angle. A few degrees either way and most of this goes.';
    if (d < 25) return 'Close. The rate is climbing, so the preferred angle is somewhere nearby.';
    return 'Almost nothing. The bar is there, sweeping the field, and the cell has no interest in it at this angle.';
  }

  private verdict(): string {
    if (this.stimulus === 'dot' && this.lastRate !== null)
      return 'A dot of light in the middle of the field, and the cell barely moves. That is why these cells looked unresponsive at first — nobody was showing them an edge.';

    if (this.tried.size < 3)
      return 'Try a few angles. The cell answers to one of them and to almost nothing else.';

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
}

defineSim('orientation-sim', OrientationSim);
