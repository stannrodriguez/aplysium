/**
 * <retina-sim> — mapping one retinal ganglion cell.
 *
 * The cell is a difference of two Gaussians: a narrow excitatory centre and a
 * broad inhibitory surround, balanced so that their integrals cancel. That one
 * property is the whole result — flood the retina evenly and the cell reports
 * almost nothing, because it is wired to report differences rather than light.
 *
 * A flash is scored by integrating the field over the disc the light covers,
 * so the reader is not looking up a table of answers; moving the spot two
 * millimetres out and watching the rate fall through baseline is the
 * measurement Kuffler actually made.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type Polarity = 'on' | 'off';

interface Flash {
  x: number;
  y: number;
  r: number;
  rate: number;
  diffuse: boolean;
}

const W = 320;
const H = 200;
const CX = 160;
const CY = 100;

/** Centre and surround widths. The surround is broad and weak; the weight
 *  below is exactly σc²/σs², which is what makes the two integrals cancel. */
const SIGMA_C = 13;
const SIGMA_S = 32;
const SURROUND_WEIGHT = (SIGMA_C * SIGMA_C) / (SIGMA_S * SIGMA_S);

const BASE_RATE = 12;
const GAIN = 0.13;
const MAX_RATE = 90;
const STEP = 2; // sampling step when integrating over the spot, in px

/** The field at one distance from the receptive-field centre. */
const field = (d2: number): number =>
  Math.exp(-d2 / (2 * SIGMA_C * SIGMA_C)) - SURROUND_WEIGHT * Math.exp(-d2 / (2 * SIGMA_S * SIGMA_S));

/** Integrate the field over the disc the light covers. */
function respond(x: number, y: number, r: number, polarity: Polarity, diffuse: boolean): number {
  let sum = 0;
  if (diffuse) {
    // The whole retina: integrate over the stage rather than a disc.
    for (let sx = 0; sx < W; sx += STEP)
      for (let sy = 0; sy < H; sy += STEP) sum += field((sx - CX) ** 2 + (sy - CY) ** 2) * STEP * STEP;
  } else {
    for (let sx = x - r; sx <= x + r; sx += STEP)
      for (let sy = y - r; sy <= y + r; sy += STEP) {
        if ((sx - x) ** 2 + (sy - y) ** 2 > r * r) continue;
        sum += field((sx - CX) ** 2 + (sy - CY) ** 2) * STEP * STEP;
      }
  }
  const signed = polarity === 'on' ? sum : -sum;
  return clamp(BASE_RATE + GAIN * signed, 0, MAX_RATE);
}

class RetinaSim extends SimElement {
  private x = CX;
  private y = CY;
  private radius = 14;
  private polarity: Polarity = 'on';
  private last: Flash | null = null;
  private history: Flash[] = [];
  /** Rate at each probed grid point, once the field has been mapped. */
  private map: Array<{ x: number; y: number; rate: number }> = [];

  protected setup(): void {
    this.onClick('[data-sim-flood]', () => this.flash(true));
    this.onClick('[data-sim-map]', () => this.mapField());
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-polarity]', el => {
      this.polarity = el.dataset.simPolarity as Polarity;
      this.map = [];
      this.history = [];
      this.last = null;
      this.render();
    });
    this.on('[data-sim-radius]', 'input', el => {
      this.radius = Number((el as HTMLInputElement).value);
      this.render();
    });

    const stage = this.q('[data-sim-retina]');
    stage?.addEventListener('click', event => {
      const box = stage.getBoundingClientRect();
      const e = event as MouseEvent;
      this.x = clamp(((e.clientX - box.left) / box.width) * W, 0, W);
      this.y = clamp(((e.clientY - box.top) / box.height) * H, 0, H);
      this.flash(false);
    });
  }

  /* ── model ── */

  private flash(diffuse: boolean): void {
    const rate = respond(this.x, this.y, this.radius, this.polarity, diffuse);
    this.last = { x: this.x, y: this.y, r: this.radius, rate, diffuse };
    this.history = [...this.history, this.last].slice(-16);
    this.render();
    this.emit(diffuse ? 'flooded' : 'flashed', { rate, diffuse });
  }

  /** Sweep a small spot across the retina and record the rate at each point —
   *  which is the only way the ring shows up as a shape rather than a number. */
  private mapField(): void {
    const probe = 7;
    const points: Array<{ x: number; y: number; rate: number }> = [];
    for (let gx = 20; gx <= W - 20; gx += 15)
      for (let gy = 16; gy <= H - 16; gy += 15)
        points.push({ x: gx, y: gy, rate: respond(gx, gy, probe, this.polarity, false) });
    this.map = points;
    this.render();
    this.emit('mapped', { points: points.length });
  }

  private reset(): void {
    this.x = CX;
    this.y = CY;
    this.radius = 14;
    this.last = null;
    this.history = [];
    this.map = [];
    const slider = this.q<HTMLInputElement>('[data-sim-radius]');
    if (slider) slider.value = '14';
    this.render();
    this.emit('reset');
  }

  /* ── view ── */

  protected render(): void {
    const rate = this.last ? this.last.rate : BASE_RATE;
    this.text('[data-sim-status]', this.polarity === 'on' ? 'ON-centre cell' : 'OFF-centre cell');
    this.text('[data-sim-rate]', `${rate.toFixed(0)} /s`);
    this.text('[data-sim-radius-value]', `${(this.radius * 2).toFixed(0)} px across`);
    this.pressed('[data-sim-polarity]', 'simPolarity', this.polarity);

    this.html('[data-sim-retina]', this.retinaSvg());
    this.html('[data-sim-raster]', this.rasterSvg(rate));
    this.html('[data-sim-mapplot]', this.mapSvg());
    this.show('[data-sim-map-empty]', this.map.length === 0);

    this.text('[data-sim-retina-note]', this.retinaNote());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private retinaSvg(): string {
    const spot = this.last?.diffuse
      ? `<rect class="rf-spot" x="0" y="0" width="${W}" height="${H}"/>`
      : `<circle class="rf-spot" cx="${this.x.toFixed(1)}" cy="${this.y.toFixed(1)}" r="${this.radius}"/>`;

    // The field is never drawn as a labelled diagram — it is only ever the
    // faint thing you are hunting for.
    return (
      `<svg class="rf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A patch of retina. The light spot is ${
        this.last?.diffuse ? 'flooding the whole patch' : `at ${Math.round(this.x)}, ${Math.round(this.y)}`
      }. Click anywhere to move it and flash again.">` +
      `<rect class="rf-bg" x="0" y="0" width="${W}" height="${H}"/>` +
      spot +
      `<circle class="rf-electrode" cx="${CX}" cy="${CY}" r="3"/>` +
      `<text class="rf-label" x="${CX + 8}" y="${CY + 4}">ELECTRODE</text>` +
      `</svg>`
    );
  }

  /** One second of the cell's output: 300 ms before the light, 400 ms of it,
   *  300 ms after. The ticks are what an audio monitor would have clicked at. */
  private rasterSvg(rate: number): string {
    const rows = 4;
    const ticks: string[] = [];
    for (let row = 0; row < rows; row++) {
      for (let t = 0; t < 1000; t += 4) {
        const during = t >= 300 && t < 700;
        const r = during ? rate : BASE_RATE;
        // Poisson-ish: fire when the seeded draw falls under the rate.
        if (noise(row * 977 + t * 3 + (this.history.length + 1) * 31) < (r * 4) / 1000) {
          const x = 8 + (t / 1000) * 304;
          const y = 10 + row * 13;
          ticks.push(`<line class="rf-tick" x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${y + 9}"/>`);
        }
      }
    }
    return (
      `<svg class="rf-svg" viewBox="0 0 320 74" role="img" aria-label="Four repeats of the cell's firing. The light is on for the shaded 400 milliseconds; it fires at ${rate.toFixed(
        0,
      )} per second during it against ${BASE_RATE} per second at rest.">` +
      `<rect class="rf-window" x="${8 + 0.3 * 304}" y="4" width="${0.4 * 304}" height="62"/>` +
      ticks.join('') +
      `<text class="rf-label" x="8" y="71">1 s</text>` +
      `<text class="rf-label" x="${8 + 0.5 * 304}" y="71" text-anchor="middle">LIGHT ON</text>` +
      `</svg>`
    );
  }

  private mapSvg(): string {
    if (!this.map.length) return '';
    // A small probe in the surround shifts the rate by a few spikes where the
    // same probe on the centre shifts it by forty. Scaling both against the
    // strongest reading and then compressing keeps the ring legible without
    // pretending the two effects are the same size.
    const strongest = Math.max(...this.map.map(p => Math.abs(p.rate - BASE_RATE)), 1);
    const dots = this.map
      .map(p => {
        const delta = p.rate - BASE_RATE;
        const strength = clamp(Math.abs(delta) / strongest, 0, 1) ** 0.45;
        const cls = delta > 0.6 ? 'rf-on' : delta < -0.6 ? 'rf-off' : 'rf-null';
        return `<circle class="rf-dot ${cls}" cx="${p.x}" cy="${p.y}" r="${(1.8 + strength * 4.6).toFixed(
          1,
        )}" opacity="${(0.2 + strength * 0.8).toFixed(2)}"/>`;
      })
      .join('');
    return `<svg class="rf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The mapped field: a filled disc where the small spot drove the cell, surrounded by a ring where it suppressed it.">${dots}</svg>`;
  }

  private retinaNote(): string {
    const last = this.last;
    if (!last) return 'Click anywhere on the retina to put the spot of light there and flash it.';
    if (last.diffuse)
      return 'The whole retina lit at once, and the cell barely moved off its resting rate. Centre and surround cancel almost exactly, so even bright uniform light is close to invisible to this cell.';
    const d = Math.hypot(last.x - CX, last.y - CY);
    if (last.r > 34)
      return 'A spot this wide covers centre and surround together, so most of what it excites it also suppresses.';
    if (d < 16) return 'On the centre: a small spot here drives the cell hard.';
    if (d < 45) return 'In the surround: the same light here pushes the cell below its resting rate.';
    return 'Outside the field entirely. The light is on and the cell has nothing to say about it.';
  }

  private verdict(): string {
    if (this.map.length)
      return 'A filled centre with a ring around it that does the opposite. Not a patch — which is why an even wash of light over both says almost nothing, and an edge lying across them says a great deal.';
    const flooded = this.history.find(f => f.diffuse);
    if (flooded)
      return `Flooding the whole retina gave ${flooded.rate.toFixed(
        0,
      )} spikes per second against ${BASE_RATE} at rest. Now map the field and see the shape that produces it.`;
    if (this.history.length >= 3)
      return 'Try the same small spot at the centre and then forty pixels out, and then flood the whole patch. Then map it.';
    return 'Flash the spot in a few places and watch the rate. The cell has a shape; the readings are how you find it.';
  }
}

defineSim('retina-sim', RetinaSim);
