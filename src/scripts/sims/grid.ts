/**
 * <grid-sim> — the entorhinal cell that tiles the whole room.
 *
 * The field is three plane waves sixty degrees apart, summed and thresholded.
 * That is the shortest honest description of a grid cell and it produces the
 * hexagonal lattice for free, rather than by drawing one.
 *
 * The box-size control is the point of the study. In a small arena only one
 * vertex fits and the cell is indistinguishable from a place cell — which is
 * what it was taken for. The geometry only appears when the animal has room,
 * so what looked like a fact about the cell turns out to be a fact about the
 * size of the box it was recorded in.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

interface Point {
  x: number;
  y: number;
}

type Box = 'small' | 'large';

const W = 260;
const H = 220;
const PAD = 10;
/** Side of the small box as a fraction of the large one — about one grid
 *  spacing across, which is the whole point of the comparison. */
const SMALL = 0.28;

const SPACING = 62;
const PEAK_RATE = 40;
const STEP_MS = 24;
const RUN_STEPS = 1100;
const COVER_COLS = 13;
const COVER_ROWS = 11;

/** The three wave vectors, sixty degrees apart. */
const K = [30, 90, 150].map(deg => {
  const a = (deg * Math.PI) / 180;
  const mag = (4 * Math.PI) / (Math.sqrt(3) * SPACING);
  return { x: Math.cos(a) * mag, y: Math.sin(a) * mag };
});

class GridSim extends SimElement {
  private cell = 1;
  private box: Box = 'large';
  private pos: Point = { x: W / 2, y: H / 2 };
  private path: Point[] = [];
  private spikes: Point[] = [];
  private running = 0;
  private steps = 0;
  private heading = 0.5;
  private visited = new Set<number>();

  protected setup(): void {
    this.onClick('[data-sim-run]', () => this.toggleRun());
    this.onClick('[data-sim-next-cell]', () => this.nextCell());
    this.onClick('[data-sim-clear]', () => this.clear());
    this.onClick('[data-sim-box]', el => {
      this.box = el.dataset.simBox as Box;
      this.clear();
    });

    const arena = this.q('[data-sim-arena]');
    arena?.addEventListener('click', event => {
      const rect = this.bounds();
      const b = arena.getBoundingClientRect();
      const e = event as MouseEvent;
      this.pos = {
        x: clamp(((e.clientX - b.left) / b.width) * W, rect.x0, rect.x1),
        y: clamp(((e.clientY - b.top) / b.height) * H, rect.y0, rect.y1),
      };
      this.record(this.pos);
      this.render();
    });
  }

  protected teardown(): void {
    if (this.running) this.cancelInterval(this.running);
  }

  /* ── model ── */

  /** The walls, which is the only thing the box control changes. */
  private bounds(): { x0: number; y0: number; x1: number; y1: number } {
    if (this.box === 'large') return { x0: PAD, y0: PAD, x1: W - PAD, y1: H - PAD };
    const w = (W - 2 * PAD) * SMALL;
    const h = (H - 2 * PAD) * SMALL;
    return { x0: (W - w) / 2, y0: (H - h) / 2, x1: (W + w) / 2, y1: (H + h) / 2 };
  }

  /** Three plane waves, summed, thresholded into discrete vertices. */
  private rateAt(p: Point): number {
    const ox = noise(this.cell * 17 + 1) * SPACING;
    const oy = noise(this.cell * 43 + 5) * SPACING;
    const x = p.x - ox;
    const y = p.y - oy;
    const g = K.reduce((sum, k) => sum + Math.cos(k.x * x + k.y * y), 0) / 3;
    // g runs −0.5 … 1. Everything below the threshold is silence, which is
    // what makes vertices rather than ripples.
    const t = 0.35;
    return g <= t ? 0 : PEAK_RATE * ((g - t) / (1 - t)) ** 1.4;
  }

  private record(p: Point): void {
    this.steps += 1;
    const col = clamp(Math.floor((p.x / W) * COVER_COLS), 0, COVER_COLS - 1);
    const row = clamp(Math.floor((p.y / H) * COVER_ROWS), 0, COVER_ROWS - 1);
    this.visited.add(row * COVER_COLS + col);
    this.path = [...this.path, p].slice(-3200);
    if (noise(this.steps * 19 + this.cell * 271) < (this.rateAt(p) * STEP_MS) / 1000)
      this.spikes = [...this.spikes, p];
  }

  private toggleRun(): void {
    if (this.running) {
      this.cancelInterval(this.running);
      this.running = 0;
      this.render();
      return;
    }
    if (prefersReducedMotion()) {
      for (let i = 0; i < RUN_STEPS; i++) this.forageStep();
      this.render();
      this.emit('ran', { spikes: this.spikes.length, box: this.box });
      return;
    }
    let left = RUN_STEPS;
    this.running = this.every(STEP_MS, () => {
      this.forageStep();
      if (--left <= 0) {
        this.cancelInterval(this.running);
        this.running = 0;
        this.emit('ran', { spikes: this.spikes.length, box: this.box });
      }
      this.render();
    });
    this.render();
  }

  private forageStep(): void {
    const b = this.bounds();
    this.heading += (noise(this.steps * 59 + this.cell * 11) - 0.5) * 0.85;
    let x = this.pos.x + Math.cos(this.heading) * 4.4;
    let y = this.pos.y + Math.sin(this.heading) * 4.4;
    if (x < b.x0 || x > b.x1) {
      this.heading = Math.PI - this.heading;
      x = clamp(x, b.x0, b.x1);
    }
    if (y < b.y0 || y > b.y1) {
      this.heading = -this.heading;
      y = clamp(y, b.y0, b.y1);
    }
    this.pos = { x, y };
    this.record(this.pos);
  }

  private nextCell(): void {
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    this.cell += 1;
    this.spikes = [];
    this.render();
    this.emit('new-cell', { cell: this.cell });
  }

  private clear(): void {
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    const b = this.bounds();
    this.pos = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    this.path = [];
    this.spikes = [];
    this.visited.clear();
    this.steps = 0;
    this.render();
  }

  /** The distinct patches the spikes fall into — one is a place field, several
   *  is a lattice. Each spike joins the nearest cluster within half a spacing
   *  and drags its centre with it; clusters of one or two spikes are dropped
   *  as the tail of the Poisson draw rather than counted as vertices. */
  private vertexCount(): number {
    const seeds: Array<{ x: number; y: number; n: number }> = [];

    for (const s of this.spikes) {
      let best = -1;
      let bestD = Infinity;
      seeds.forEach((v, i) => {
        const d = Math.hypot(v.x - s.x, v.y - s.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });

      if (best >= 0 && bestD < SPACING * 0.45) {
        const v = seeds[best];
        v.x = (v.x * v.n + s.x) / (v.n + 1);
        v.y = (v.y * v.n + s.y) / (v.n + 1);
        v.n += 1;
      } else {
        seeds.push({ x: s.x, y: s.y, n: 1 });
      }
    }

    return seeds.filter(v => v.n >= 3).length;
  }

  /* ── view ── */

  protected render(): void {
    this.text('[data-sim-status]', `cell ${this.cell} · ${this.box} box`);
    this.text('[data-sim-rate]', `${this.rateAt(this.pos).toFixed(0)} /s`);
    this.text('[data-sim-vertices]', String(this.vertexCount()));
    this.text('[data-sim-coverage]', `${Math.round((this.visited.size / (COVER_COLS * COVER_ROWS)) * 100)}%`);
    this.pressed('[data-sim-box]', 'simBox', this.box);
    this.text('[data-sim-run]', this.running ? '■ stop' : '▶ let it forage');
    this.html('[data-sim-arena]', this.arenaSvg());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private arenaSvg(): string {
    const b = this.bounds();
    const walls = `<rect class="grd-walls" x="${b.x0.toFixed(1)}" y="${b.y0.toFixed(1)}" width="${(
      b.x1 - b.x0
    ).toFixed(1)}" height="${(b.y1 - b.y0).toFixed(1)}"/>`;

    const trail =
      this.path.length > 1
        ? `<polyline class="grd-path" points="${this.path.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`
        : '';

    const spikes = this.spikes
      .map(p => `<circle class="grd-spike" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4"/>`)
      .join('');

    return (
      `<svg class="grd-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The arena from above, ${this.box} box, with ${this.spikes.length} spikes marked where the animal was standing when the cell fired.">` +
      `<rect class="grd-room" x="1" y="1" width="${W - 2}" height="${H - 2}"/>` +
      walls +
      trail +
      spikes +
      `<circle class="grd-rat" cx="${this.pos.x.toFixed(1)}" cy="${this.pos.y.toFixed(1)}" r="4.5"/>` +
      `</svg>`
    );
  }

  private verdict(): string {
    const n = this.vertexCount();

    // A small box can also land between vertices entirely, and then the cell
    // reads as dead. That is a third way the geometry hides.
    if (this.box === 'small' && this.spikes.length < 8 && this.visited.size > 8)
      return 'Barely a spike. The box has landed between vertices, so this cell looks silent — and a silent cell gets written off rather than mapped. Give it the large box and it turns out to have been firing all along, just not here.';

    if (this.spikes.length < 8)
      return 'Cover some floor first. One cell, and nothing to say about it until there are enough spikes to have a shape.';

    if (this.box === 'small')
      return `${
        n <= 1 ? 'One patch of floor, and the cell is silent everywhere else' : `${n} patches, and no room to see whether they repeat`
      }. Nothing here distinguishes this from a place cell, which is what cells like this were taken for. Now give it the large box.`;

    if (n <= 2)
      return `Only ${n} vertic${n === 1 ? 'e' : 'es'} so far. Keep going — the lattice needs the animal to have been in several parts of the room, not just one.`;

    return `${n} separate patches, evenly spaced, in a repeating triangular arrangement that carries on to the walls. Not one place, and not a map of anything in this particular room: a fixed metric the animal takes with it. Try the small box and watch it collapse into what looks like a single place field.`;
  }
}

defineSim('grid-sim', GridSim);
