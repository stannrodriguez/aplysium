/**
 * <grid-sim> — the entorhinal cell that tiles the whole room, as a guided
 * instrument.
 *
 * The firing field is three plane waves sixty degrees apart, summed and
 * thresholded. That is the shortest honest description of a grid cell and it
 * produces the hexagonal lattice for free, rather than by drawing one.
 *
 * Three mode tabs walk the same cell through the study:
 *
 *   Large box  — forage a room with space to spare; the spikes come out as a
 *                repeating hexagonal lattice tiling the whole floor.
 *   Small box  — the same cell in the arena it was first recorded in: one
 *                firing field, indistinguishable from a place cell — which is
 *                exactly what such cells were taken for.
 *   Coordinate — the insight: the lattice read as a self-generated coordinate
 *                grid. Every vertex the same distance and 60° from the next, a
 *                metric held in the dark and after the landmarks are removed.
 *
 * The box control is the point of the study, so it is the mode: the geometry
 * only appears when the animal has room, and what looked like a fact about the
 * cell turns out to be a fact about the size of the box it was recorded in.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

interface Point {
  x: number;
  y: number;
}

type Mode = 'large' | 'small' | 'insight';
type World = 'cue' | 'dark' | 'nocue';

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
const THRESHOLD = 0.35;

/** The three wave vectors, sixty degrees apart. */
const K = [30, 90, 150].map(deg => {
  const a = (deg * Math.PI) / 180;
  const mag = (4 * Math.PI) / (Math.sqrt(3) * SPACING);
  return { x: Math.cos(a) * mag, y: Math.sin(a) * mag };
});

/** The real-space lattice basis, dual to two of the wave vectors. Both come out
 *  one SPACING long, sixty degrees apart — the same geometry the plane waves
 *  make, derived rather than drawn, so the insight vertices sit exactly on the
 *  field's maxima. */
const LATTICE = (() => {
  const g1 = K[0];
  const g2 = K[2];
  const det = g1.x * g2.y - g2.x * g1.y;
  const s = (2 * Math.PI) / det;
  return {
    a1: { x: s * g2.y, y: s * -g2.x },
    a2: { x: s * -g1.y, y: s * g1.x },
  };
})();

const ORIGIN: Point = { x: W / 2, y: H / 2 };

const LEAD: Record<Mode, string> = {
  large:
    'Let the animal forage. The same recording method as a place cell — a dot wherever the cell fired — but in a box with room to spare. The firing fields come out as a repeating hexagonal lattice that tiles the whole floor.',
  small:
    'The very same cell, now in the small arena it was first recorded in. Only one firing field fits, and nothing tells it apart from a place cell — which is exactly what cells like this were taken for.',
  insight:
    'Not the experiment, but what it means. The lattice is a coordinate grid the animal carries with it: every vertex the same distance and 60° from the next, a built-in metric for space. Being largely self-generated, its spacing and orientation hold in the dark and outlast the landmarks on the walls.',
};

const STATUS: Record<Mode, string> = {
  large: 'large box',
  small: 'small box',
  insight: 'coordinate grid',
};

const WORLD_NOTE: Record<World, string> = {
  cue: 'Lights on, cue card on the wall. Spacing and orientation as recorded.',
  dark:
    'Lights off. The animal navigates by its own movement — and the lattice keeps the same spacing and orientation, because it was largely generating that pattern itself.',
  nocue:
    'The cue card is gone. The grid does not drift or rescale to match: it was never pinned to the card, so removing it changes nothing.',
};

class GridSim extends SimElement {
  private mode: Mode = 'large';
  private cell = 1;
  private world: World = 'cue';
  private pos: Point = { x: W / 2, y: H / 2 };
  private path: Point[] = [];
  private spikes: Point[] = [];
  private running = 0;
  private steps = 0;
  private heading = 0.5;
  private visited = new Set<number>();

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-world]', el => this.setWorld(el.dataset.simWorld as World));

    const arena = this.q('[data-sim-arena]');
    arena?.addEventListener('click', event => {
      if (this.mode === 'insight') return;
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

    this.buildControls();
  }

  protected teardown(): void {
    if (this.running) this.cancelInterval(this.running);
  }

  /* ── model ── */

  private box(): 'large' | 'small' {
    return this.mode === 'small' ? 'small' : 'large';
  }

  /** The walls, which is the only thing the mode changes for the experiment. */
  private bounds(): { x0: number; y0: number; x1: number; y1: number } {
    if (this.box() === 'large') return { x0: PAD, y0: PAD, x1: W - PAD, y1: H - PAD };
    const w = (W - 2 * PAD) * SMALL;
    const h = (H - 2 * PAD) * SMALL;
    return { x0: (W - w) / 2, y0: (H - h) / 2, x1: (W + w) / 2, y1: (H + h) / 2 };
  }

  /** Three plane waves, summed, thresholded into discrete vertices. */
  private rateAt(p: Point): number {
    const ox = noise(this.cell * 17 + 1) * SPACING;
    const oy = noise(this.cell * 43 + 5) * SPACING;
    return this.field(p.x - ox, p.y - oy);
  }

  private field(x: number, y: number): number {
    const g = K.reduce((sum, k) => sum + Math.cos(k.x * x + k.y * y), 0) / 3;
    // g runs −0.5 … 1. Everything below the threshold is silence, which is
    // what makes vertices rather than ripples.
    return g <= THRESHOLD ? 0 : PEAK_RATE * ((g - THRESHOLD) / (1 - THRESHOLD)) ** 1.4;
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
      this.emit('ran', { spikes: this.spikes.length, box: this.box() });
      return;
    }
    let left = RUN_STEPS;
    this.running = this.every(STEP_MS, () => {
      this.forageStep();
      if (--left <= 0) {
        this.cancelInterval(this.running);
        this.running = 0;
        this.emit('ran', { spikes: this.spikes.length, box: this.box() });
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

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    this.mode = mode;
    // Each mode starts the same cell from a clean floor.
    this.resetFloor();
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { cell: this.cell });
  }

  private setWorld(world: World): void {
    this.world = world;
    this.render();
    this.emit(`world-${world}`, null);
  }

  private nextCell(): void {
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    this.cell += 1;
    this.resetFloor();
    this.render();
    this.emit('new-cell', { cell: this.cell });
  }

  private clear(): void {
    if (this.running) this.cancelInterval(this.running);
    this.running = 0;
    this.resetFloor();
    this.render();
  }

  private resetFloor(): void {
    const b = this.bounds();
    this.pos = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    this.path = [];
    this.spikes = [];
    this.visited.clear();
    this.steps = 0;
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

    this.addBtn(bar, '▶ let it forage', 'sim-btn-primary', 'run', () => this.toggleRun());
    this.addBtn(bar, 'Next cell', 'sim-btn-outline', 'next-cell', () => this.nextCell());
    this.addBtn(bar, 'Clear', 'sim-btn-quiet', 'clear', () => this.clear());
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, tag: string, fn: () => void): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    b.setAttribute(`data-sim-${tag}`, '');
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  /* ── view ── */

  protected render(): void {
    const { mode } = this;

    this.pressed('[data-sim-mode]', 'simMode', mode);
    this.text('[data-sim-lead]', LEAD[mode]);
    this.text('[data-sim-status]', `cell ${this.cell} · ${STATUS[mode]}`);

    const isInsight = mode === 'insight';
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }

    this.text('[data-sim-rate]', `${this.rateAt(this.pos).toFixed(0)} /s`);
    this.text('[data-sim-vertices]', String(this.vertexCount()));
    this.text('[data-sim-coverage]', `${Math.round((this.visited.size / (COVER_COLS * COVER_ROWS)) * 100)}%`);
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
      `<svg class="grd-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The arena from above, ${this.box()} box, with ${this.spikes.length} spikes marked where the animal was standing when the cell fired.">` +
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
    if (this.box() === 'small' && this.spikes.length < 8 && this.visited.size > 8)
      return 'Barely a spike. The box has landed between vertices, so this cell looks silent — and a silent cell gets written off rather than mapped. Give it the large box and it turns out to have been firing all along, just not here.';

    if (this.spikes.length < 8)
      return 'Cover some floor first. One cell, and nothing to say about it until there are enough spikes to have a shape.';

    if (this.box() === 'small')
      return `${
        n <= 1 ? 'One patch of floor, and the cell is silent everywhere else' : `${n} patches, and no room to see whether they repeat`
      }. Nothing here distinguishes this from a place cell, which is what cells like this were taken for. Now give it the large box.`;

    if (n <= 2)
      return `Only ${n} vertic${n === 1 ? 'e' : 'es'} so far. Keep going — the lattice needs the animal to have been in several parts of the room, not just one.`;

    return `${n} separate patches, evenly spaced, in a repeating triangular arrangement that carries on to the walls. Not one place, and not a map of anything in this particular room: a fixed metric the animal takes with it. Try the small box and watch it collapse into what looks like a single place field.`;
  }

  /* ── the insight: the lattice as a coordinate system ── */

  private renderInsight(): void {
    this.pressed('[data-sim-world]', 'simWorld', this.world);
    this.text('[data-sim-world-note]', WORLD_NOTE[this.world]);
    this.html('[data-sim-insight-svg]', this.insightBody());

    const svg = this.q('[data-sim-insight-svg]');
    if (svg) {
      // SVG element: toggle a class, not the `hidden` IDL property.
      svg.classList.toggle('is-dark', this.world === 'dark');
      const cue = this.world === 'nocue' ? 'no cue card on the wall' : 'a cue card on one wall';
      const light = this.world === 'dark' ? 'in darkness' : 'in the light';
      svg.setAttribute(
        'aria-label',
        `The firing lattice of one grid cell across the whole floor, ${light}, with ${cue}: the same evenly spaced vertices sixty degrees apart, spacing and orientation unchanged by the world outside.`,
      );
    }
  }

  /** The insight scene, rebuilt whole each time the world toggles — the vertices
   *  and geometry never move, which is exactly the point being made. */
  private insightBody(): string {
    return (
      `<rect class="grd-room" x="1" y="1" width="${W - 2}" height="${H - 2}"/>` +
      `<rect class="grd-walls" x="${PAD}" y="${PAD}" width="${W - 2 * PAD}" height="${H - 2 * PAD}"/>` +
      this.insightHeat() +
      this.insightVertices() +
      this.insightTriangle() +
      this.insightCue()
    );
  }

  /** The firing field sampled across the floor — the real thresholded plane-wave
   *  sum, drawn as a soft rate map behind the crisp vertices. */
  private insightHeat(): string {
    const out: string[] = [];
    const step = 7;
    for (let x = PAD; x <= W - PAD; x += step) {
      for (let y = PAD; y <= H - PAD; y += step) {
        const r = this.field(x - ORIGIN.x, y - ORIGIN.y);
        if (r < 3) continue;
        const o = (0.12 + (r / PEAK_RATE) * 0.5).toFixed(2);
        out.push(`<circle class="grd-field" cx="${x}" cy="${y}" r="3.4" opacity="${o}"/>`);
      }
    }
    return out.join('');
  }

  /** The lattice vertices themselves, sitting exactly on the field's maxima. */
  private insightVertices(): string {
    const out: string[] = [];
    for (let m = -6; m <= 6; m++) {
      for (let n = -6; n <= 6; n++) {
        const x = ORIGIN.x + m * LATTICE.a1.x + n * LATTICE.a2.x;
        const y = ORIGIN.y + m * LATTICE.a1.y + n * LATTICE.a2.y;
        if (x < PAD - 1 || x > W - PAD + 1 || y < PAD - 1 || y > H - PAD + 1) continue;
        out.push(`<circle class="grd-node" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"/>`);
      }
    }
    return out.join('');
  }

  /** One lattice triangle, annotated: equal sides, all three angles 60°. */
  private insightTriangle(): string {
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + LATTICE.a1.x, y: ORIGIN.y + LATTICE.a1.y };
    const p2 = { x: ORIGIN.x + LATTICE.a2.x, y: ORIGIN.y + LATTICE.a2.y };
    const pts = [p0, p1, p2].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return (
      `<polygon class="grd-tri" points="${pts}"/>` +
      `<text class="grd-ann" x="${p0.x.toFixed(1)}" y="${(p0.y - 6).toFixed(1)}" text-anchor="middle">60°</text>` +
      `<text class="grd-ann" x="${baseMid.x.toFixed(1)}" y="${(baseMid.y + 13).toFixed(1)}" text-anchor="middle">even spacing</text>`
    );
  }

  /** The cue card on the wall — present unless it has been removed. */
  private insightCue(): string {
    if (this.world === 'nocue') return '';
    const cx = W / 2;
    return `<rect class="grd-cue" x="${(cx - 11).toFixed(1)}" y="${(PAD + 1).toFixed(1)}" width="22" height="6" rx="1"/>`;
  }
}

defineSim('grid-sim', GridSim);
