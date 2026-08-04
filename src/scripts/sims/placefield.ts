/**
 * <placefield-sim> — one hippocampal cell in a box, as a guided instrument.
 *
 * The markup is server-rendered by PlaceFieldSim.astro; this class attaches to
 * it and drives the arena. Rather than one free-play instrument, the panel is a
 * guided path: three mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Forage       — let the animal wander; each spike is plotted where it was
 *                  standing. The marks pile up in one patch: the place field.
 *   Another cell — a different cell from the same box answers to a place of its
 *                  own. Every cell has its patch; together they tile the room.
 *   Codes place  — the insight: the field is pinned to the one landmark. Rotate
 *                  the cue card and the whole field swings round with it.
 *
 * Behaviour model (unchanged): spikes are drawn from a Gaussian firing field
 * centred somewhere in the arena, as the animal moves, so the field is not
 * drawn — it accumulates out of where the animal happened to be when the cell
 * happened to fire. The field's centre rotates rigidly with the cue card.
 */

import { SimElement, clamp, defineSim, noise, prefersReducedMotion } from './base';

interface Point {
  x: number;
  y: number;
}

type Mode = 'forage' | 'cell' | 'insight';

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

const LEAD: Record<Mode, string> = {
  forage:
    'Drop the animal in a bare box and let it wander. Each time this one cell fires, mark where the animal was standing — nowhere else. The marks pile up in a single patch: that patch is the cell’s place field.',
  cell:
    'The same box, a different cell from the same hippocampus. It is silent where the first one fired and answers to a place of its own. Every cell has its patch; together the population tiles the whole room.',
  insight:
    'The cell codes place — not a view, a heading, or the turn the animal made. It fires there whatever route it took and keeps firing in the dark. The map is pinned to the one landmark: rotate the cue card and the whole field swings round with it.',
};

const STATUS: Record<Mode, string> = {
  forage: 'one cell, one place',
  cell: 'each cell its own place',
  insight: 'anchored to the cue',
};

/** Where this cell's field sits before the cue card is moved. */
const baseCentre = (cell: number): Point => ({
  x: PAD + 26 + noise(cell * 71 + 3) * (W - 2 * PAD - 52),
  y: PAD + 26 + noise(cell * 131 + 11) * (H - 2 * PAD - 52),
});

class PlaceFieldSim extends SimElement {
  private mode: Mode = 'forage';
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
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));

    const arena = this.q('[data-sim-arena]');
    arena?.addEventListener('click', event => {
      const box = arena.getBoundingClientRect();
      const e = event as MouseEvent;
      this.moveTo(
        clamp(((e.clientX - box.left) / box.width) * W, PAD, W - PAD),
        clamp(((e.clientY - box.top) / box.height) * H, PAD, H - PAD),
      );
    });

    this.buildControls();
  }

  protected teardown(): void {
    this.stop();
  }

  /* ── model (unchanged) ── */

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

  /* ── the foraging run ── */

  /** The primary action in Forage: start or stop a live foraging bout. Under
   *  reduced motion it takes the same walk and shows the finished map at once. */
  private toggleRun(): void {
    if (this.running) {
      this.stop();
      this.render();
      return;
    }
    if (prefersReducedMotion()) {
      this.forageBout();
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

  /** Run a whole bout without animating — used to establish a field the moment
   *  a mode needs one to make its point (Another cell, Rotate the cue). */
  private forageBout(): void {
    for (let i = 0; i < RUN_STEPS; i++) this.forageStep();
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

  private resetWalk(): void {
    this.path = [];
    this.spikes = [];
    this.visited.clear();
    this.steps = 0;
    this.pos = { x: CX, y: CY };
    this.heading = 0.7;
  }

  /* ── actions ── */

  private clear(): void {
    this.stop();
    this.resetWalk();
    this.render();
    this.emit('cleared');
  }

  /** A different cell from the same box: silent where the last one fired,
   *  answering to a place of its own. Fill it in at once so the contrast reads. */
  private anotherCell(): void {
    this.stop();
    this.cell += 1;
    this.resetWalk();
    this.forageBout();
    this.render();
    this.emit('new-cell', { cell: this.cell });
  }

  /** Turn the cue card a quarter turn, then re-forage. The field's centre turns
   *  rigidly with the card, so the new map lands rotated — the insight made
   *  visible: the cell reports a place in whatever the animal reads the room by. */
  private rotateCue(): void {
    this.stop();
    this.cueAngle = (this.cueAngle + 90) % 360;
    this.resetWalk();
    this.forageBout();
    this.render();
    this.emit('rotated', { cue: this.cueAngle });
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.stop();
    this.mode = mode;

    if (mode === 'forage') {
      // Start this beat from an empty box: the reader forages and watches the
      // field accumulate for themselves.
      this.cell = 1;
      this.cueAngle = 0;
      this.resetWalk();
    } else if (mode === 'cell') {
      // A fresh cell, its field already filled in beside where the first sat.
      this.cell += 1;
      this.cueAngle = 0;
      this.resetWalk();
      this.forageBout();
    } else {
      // Insight: a settled field to rotate, cue card upright to start.
      this.cueAngle = 0;
      this.resetWalk();
      this.forageBout();
    }

    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'forage') {
      this.addBtn(bar, this.running ? '■ stop' : '▶ let it forage', 'sim-btn-primary', () => this.toggleRun(), 'data-sim-run');
      this.addBtn(bar, 'Clear', 'sim-btn-quiet', () => this.clear());
    } else if (this.mode === 'cell') {
      this.addBtn(bar, 'Another cell', 'sim-btn-primary', () => this.anotherCell());
      this.addBtn(bar, this.running ? '■ stop' : '▶ forage again', 'sim-btn-outline', () => this.toggleRun(), 'data-sim-run');
      this.addBtn(bar, 'Clear', 'sim-btn-quiet', () => this.clear());
    } else {
      this.addBtn(bar, 'Turn the cue a quarter turn', 'sim-btn-primary', () => this.rotateCue());
      this.addBtn(bar, this.running ? '■ stop' : '▶ forage again', 'sim-btn-outline', () => this.toggleRun(), 'data-sim-run');
    }
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, fn: () => void, attr?: string): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    if (attr) b.setAttribute(attr, '');
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  /* ── view ── */

  protected render(): void {
    const rate = this.rateAt(this.pos);

    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', LEAD[this.mode]);
    this.text('[data-sim-status]', STATUS[this.mode]);
    this.text('[data-sim-rate]', `${rate.toFixed(0)} /s`);
    this.text('[data-sim-count]', `cell ${this.cell} · ${this.spikes.length} spikes`);
    this.text(
      '[data-sim-coverage]',
      `${Math.round((this.visited.size / (COVER_COLS * COVER_ROWS)) * 100)}%`,
    );
    this.html('[data-sim-arena]', this.arenaSvg(rate));
    this.text('[data-sim-note]', this.note(rate));
    this.text('[data-sim-verdict]', this.verdict());

    // Keep the live run button's label in step with the run state.
    const run = this.q('[data-sim-run]');
    if (run)
      run.textContent = this.running
        ? '■ stop'
        : this.mode === 'forage'
          ? '▶ let it forage'
          : '▶ forage again';
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
    const cardW = ux === 0 ? 44 : 6;
    const cardH = uy === 0 ? 32 : 6;
    const card = `<rect class="pf-cue" x="${cardX.toFixed(1)}" y="${cardY.toFixed(1)}" width="${cardW}" height="${cardH}"/>`;

    // Insight mode makes "anchored to the cue" literal: a translucent ring on
    // the field's centre, tethered to the cue card. Rotating the card swings
    // the whole rigid assembly — ring, tether and re-forged field — together.
    let overlay = '';
    if (this.mode === 'insight') {
      const c = this.centre();
      const anchorX = cardX + cardW / 2;
      const anchorY = cardY + cardH / 2;
      overlay =
        `<line class="pf-tether" x1="${anchorX.toFixed(1)}" y1="${anchorY.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}"/>` +
        `<circle class="pf-field" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${SIGMA}"/>`;
    }

    const label = this.arenaLabel();

    return (
      `<svg class="pf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">` +
      `<rect class="pf-floor" x="1" y="1" width="${W - 2}" height="${H - 2}"/>` +
      card +
      overlay +
      trail +
      spikes +
      `<circle class="pf-rat" cx="${this.pos.x.toFixed(1)}" cy="${this.pos.y.toFixed(1)}" r="5"/>` +
      (rate > 6 ? `<circle class="pf-rat-firing" cx="${this.pos.x.toFixed(1)}" cy="${this.pos.y.toFixed(1)}" r="9"/>` : '') +
      `</svg>`
    );
  }

  private arenaLabel(): string {
    const base = `The arena from above. ${this.spikes.length} spikes marked where the animal was standing when cell ${this.cell} fired.`;
    if (this.mode === 'insight')
      return `${base} The cue card has been turned ${this.cueAngle}°, and the field has turned with it.`;
    return base;
  }

  private note(rate: number): string {
    if (!this.path.length)
      return 'Click anywhere in the box to walk the animal there, or let it forage and cover the floor on its own.';
    if (rate > 20) return 'Firing hard. Somewhere about here is what this cell is for.';
    if (rate > 5) return 'Something. You are on the edge of whatever it is that makes this cell go.';
    return 'Quiet. The cell is perfectly healthy and has nothing to say about this part of the room.';
  }

  private verdict(): string {
    if (this.mode === 'insight') {
      if (this.cueAngle === 0)
        return 'The ring is the cell’s field, tethered to the cue card. Turn the card a quarter turn and watch the tether, the ring and the freshly foraged spikes all swing round together — the map is anchored to the landmark, not to the room or the animal’s body.';
      return `The cue card has been turned ${this.cueAngle}° and the field has gone round with it. The cell is not reporting a place in the room and it is not reporting the animal’s own body — it is reporting a place in whatever the animal is using to know where it is.`;
    }

    if (this.mode === 'cell') {
      if (this.spikes.length < 6)
        return 'Forage this cell out and its field lands somewhere the first cell was silent. Each cell claims its own patch of floor.';
      return `Cell ${this.cell} fires in a different part of the box from cell ${this.cell - 1}. Take another and it will care about somewhere else again — the room is tiled cell by cell.`;
    }

    if (this.spikes.length < 6)
      return 'A spike train alone is a list of times. Plotting each spike where the animal was standing is what turns it into a map — so cover some ground first.';

    if (this.spikes.length > 60)
      return `${this.spikes.length} spikes, all of them in one part of the floor, from a cell that is silent everywhere else. That patch is the place field. Now try another cell.`;

    return 'The spikes are piling up in one place. Keep going until the field is unmistakable, then take another cell.';
  }
}

defineSim('placefield-sim', PlaceFieldSim);
