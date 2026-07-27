/**
 * <placefield-sim> — one hippocampal cell in a box.
 *
 * Spikes are generated as the animal moves, from a Gaussian centred somewhere
 * in the arena, so the field is not drawn — it accumulates out of where the
 * animal happened to be when the cell happened to fire. Until enough of the
 * box has been covered there is nothing to see, which is exactly why the
 * method needed position tracked at the same time as the electrode.
 *
 * Turning the cue card is the second result. The field is not anchored to the
 * room or to the rat; it is anchored to what the animal is using to tell where
 * it is, and it turns when that turns.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

interface Point {
  x: number;
  y: number;
}

const W = 260;
const H = 200;
const PAD = 12;
const CX = W / 2;
const CY = H / 2;

const PEAK_RATE = 42;
const SIGMA = 24;
const STEP_MS = 24;
const RUN_STEPS = 700;
/** The arena is binned this finely to say how much of the floor was visited. */
const COVER_COLS = 13;
const COVER_ROWS = 10;

/** Where this cell's field sits before the cue card is moved. */
const baseCentre = (cell: number): Point => ({
  x: PAD + 26 + noise(cell * 71 + 3) * (W - 2 * PAD - 52),
  y: PAD + 26 + noise(cell * 131 + 11) * (H - 2 * PAD - 52),
});

class PlaceFieldSim extends SimElement {
  private cell = 1;
  private cueAngle = 0;
  private pos: Point = { x: CX, y: CY };
  private path: Point[] = [];
  private spikes: Point[] = [];
  private running = 0;
  private steps = 0;
  /** Which floor bins have been walked over — coverage, not step count. */
  private visited = new Set<number>();
  private heading = 0.7;

  protected setup(): void {
    this.onClick('[data-sim-run]', () => this.toggleRun());
    this.onClick('[data-sim-next-cell]', () => this.nextCell());
    this.onClick('[data-sim-clear]', () => this.clear());
    this.onClick('[data-sim-rotate]', () => this.rotateCue());

    const arena = this.q('[data-sim-arena]');
    arena?.addEventListener('click', event => {
      const box = arena.getBoundingClientRect();
      const e = event as MouseEvent;
      this.moveTo(
        clamp(((e.clientX - box.left) / box.width) * W, PAD, W - PAD),
        clamp(((e.clientY - box.top) / box.height) * H, PAD, H - PAD),
      );
    });
  }

  protected teardown(): void {
    this.stop();
  }

  /* ── model ── */

  /** The field turns with the cue card, about the middle of the arena. */
  private centre(): Point {
    const base = baseCentre(this.cell);
    const a = (this.cueAngle * Math.PI) / 180;
    const dx = base.x - CX;
    const dy = base.y - CY;
    return { x: CX + dx * Math.cos(a) - dy * Math.sin(a), y: CY + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  private rateAt(p: Point): number {
    const c = this.centre();
    const d2 = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    return PEAK_RATE * Math.exp(-d2 / (2 * SIGMA * SIGMA));
  }

  /** Move the animal there, recording position and whatever the cell did. */
  private moveTo(x: number, y: number): void {
    const from = this.pos;
    const dist = Math.hypot(x - from.x, y - from.y);
    // Walk it rather than teleport, so the path and the spikes both make sense.
    const legs = Math.max(1, Math.round(dist / 5));
    for (let i = 1; i <= legs; i++) {
      const p = { x: from.x + ((x - from.x) * i) / legs, y: from.y + ((y - from.y) * i) / legs };
      this.record(p);
    }
    this.pos = { x, y };
    this.render();
  }

  private record(p: Point): void {
    this.steps += 1;
    const col = clamp(Math.floor((p.x / W) * COVER_COLS), 0, COVER_COLS - 1);
    const row = clamp(Math.floor((p.y / H) * COVER_ROWS), 0, COVER_ROWS - 1);
    this.visited.add(row * COVER_COLS + col);
    this.path = [...this.path, p].slice(-2600);
    const rate = this.rateAt(p);
    // Poisson draw over one step, seeded so a given walk replays the same way.
    if (noise(this.steps * 17 + this.cell * 313 + this.cueAngle) < (rate * STEP_MS) / 1000)
      this.spikes = [...this.spikes, p];
  }

  private toggleRun(): void {
    if (this.running) {
      this.stop();
      this.render();
      return;
    }
    if (prefersReducedMotion()) {
      // No animation: take the same walk and show the finished map.
      for (let i = 0; i < RUN_STEPS; i++) this.forageStep();
      this.render();
      this.emit('ran', { spikes: this.spikes.length });
      return;
    }
    let left = RUN_STEPS;
    this.running = this.every(STEP_MS, () => {
      this.forageStep();
      if (--left <= 0) this.stop();
      this.render();
    });
    this.render();
  }

  /** One step of foraging: mostly straight, occasionally turning, bouncing
   *  off the walls — enough to cover a box the way an animal does. */
  private forageStep(): void {
    this.heading += (noise(this.steps * 53 + this.cell * 7) - 0.5) * 0.9;
    let x = this.pos.x + Math.cos(this.heading) * 4.2;
    let y = this.pos.y + Math.sin(this.heading) * 4.2;
    if (x < PAD || x > W - PAD) {
      this.heading = Math.PI - this.heading;
      x = clamp(x, PAD, W - PAD);
    }
    if (y < PAD || y > H - PAD) {
      this.heading = -this.heading;
      y = clamp(y, PAD, H - PAD);
    }
    this.pos = { x, y };
    this.record(this.pos);
  }

  private stop(): void {
    if (!this.running) return;
    this.cancelInterval(this.running);
    this.running = 0;
    this.emit('ran', { spikes: this.spikes.length });
  }

  private nextCell(): void {
    this.stop();
    this.cell += 1;
    this.spikes = [];
    this.render();
    this.emit('new-cell', { cell: this.cell });
  }

  /** Turn the cue card a quarter turn. The old spikes are kept deliberately:
   *  seeing the new field land somewhere else is the point. */
  private rotateCue(): void {
    this.stop();
    this.cueAngle = (this.cueAngle + 90) % 360;
    this.spikes = [];
    this.path = [];
    this.visited.clear();
    this.render();
    this.emit('rotated', { cue: this.cueAngle });
  }

  private clear(): void {
    this.stop();
    this.path = [];
    this.spikes = [];
    this.visited.clear();
    this.steps = 0;
    this.pos = { x: CX, y: CY };
    this.render();
    this.emit('cleared');
  }

  /* ── view ── */

  protected render(): void {
    const rate = this.rateAt(this.pos);

    this.text('[data-sim-status]', `cell ${this.cell} · ${this.spikes.length} spikes`);
    this.text('[data-sim-rate]', `${rate.toFixed(0)} /s`);
    this.html('[data-sim-arena]', this.arenaSvg(rate));
    this.text('[data-sim-run]', this.running ? '■ stop' : '▶ let it forage');
    this.text('[data-sim-arena-note]', this.arenaNote(rate));
    this.text('[data-sim-verdict]', this.verdict());
    this.text(
      '[data-sim-coverage]',
      `${Math.round((this.visited.size / (COVER_COLS * COVER_ROWS)) * 100)}%`,
    );
  }

  private arenaSvg(rate: number): string {
    const trail =
      this.path.length > 1
        ? `<polyline class="pf-path" points="${this.path.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`
        : '';

    const spikes = this.spikes
      .map(p => `<circle class="pf-spike" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6"/>`)
      .join('');

    // The cue card sits on one wall and is the only landmark in the box.
    const cue = ['0,-1', '1,0', '0,1', '-1,0'];
    const [ux, uy] = cue[(this.cueAngle / 90) % 4].split(',').map(Number);
    const cardX = CX + ux * (W / 2 - 6) - (ux === 0 ? 22 : ux > 0 ? 6 : 0);
    const cardY = CY + uy * (H / 2 - 6) - (uy === 0 ? 16 : uy > 0 ? 6 : 0);
    const card = `<rect class="pf-cue" x="${cardX.toFixed(1)}" y="${cardY.toFixed(1)}" width="${
      ux === 0 ? 44 : 6
    }" height="${uy === 0 ? 32 : 6}"/>`;

    return (
      `<svg class="pf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The arena from above. ${this.spikes.length} spikes marked where the animal was standing when the cell fired.">` +
      `<rect class="pf-floor" x="1" y="1" width="${W - 2}" height="${H - 2}"/>` +
      card +
      trail +
      spikes +
      `<circle class="pf-rat" cx="${this.pos.x.toFixed(1)}" cy="${this.pos.y.toFixed(1)}" r="5"/>` +
      (rate > 6 ? `<circle class="pf-rat-firing" cx="${this.pos.x.toFixed(1)}" cy="${this.pos.y.toFixed(1)}" r="9"/>` : '') +
      `</svg>`
    );
  }

  private arenaNote(rate: number): string {
    if (!this.path.length)
      return 'Click anywhere in the box to walk the animal there, or let it forage and cover the floor on its own.';
    if (rate > 20) return 'Firing hard. Somewhere about here is what this cell is for.';
    if (rate > 5) return 'Something. You are on the edge of whatever it is that makes this cell go.';
    return 'Quiet. The cell is perfectly healthy and has nothing to say about this part of the room.';
  }

  private verdict(): string {
    if (this.spikes.length < 6)
      return 'A spike train alone is a list of times. Plotting each spike where the animal was standing is what turns it into a map — so cover some ground first.';

    if (this.cueAngle !== 0)
      return `The cue card has been turned ${this.cueAngle}° and the field has gone round with it. The cell is not reporting a place in the room and it is not reporting the animal's own body — it is reporting a place in whatever the animal is using to know where it is.`;

    if (this.spikes.length > 60)
      return `${this.spikes.length} spikes, all of them in one part of the floor, from a cell that is silent everywhere else. Take another cell and it will care about somewhere else entirely. Then turn the cue card.`;

    return 'The spikes are piling up in one place. Keep going, then take another cell and see where that one cares about.';
  }
}

defineSim('placefield-sim', PlaceFieldSim);
