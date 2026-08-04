/**
 * <rotation-sim> — Shepard and Metzler's task, run on the reader.
 *
 * The markup is server-rendered by RotationSim.astro; this class attaches to it
 * and drives the readouts. Two mode tabs, one continuous experiment:
 *
 *   Do the trials — same/different judgements on pairs of block figures at set
 *                   angular offsets. You answer as fast as you are sure, and the
 *                   time is what gets recorded, not the verdict.
 *   Your line     — the insight: those very reaction times plotted against
 *                   angle. They fall on a straight rising line, ~60°/s, which is
 *                   what says you turned the shape continuously through every
 *                   orientation in between rather than looking it up.
 *
 * The figures are genuinely three-dimensional: ten unit cubes, rotated about
 * the vertical axis and projected isometrically, with every face sorted back
 * to front and shaded by its own normal. They have to be really rotated,
 * because a picture that only looks rotated can be matched by comparing
 * outlines and the task stops being the task.
 *
 * The result is not the reader's accuracy. It is the slope of their reaction
 * times against angle — a straight line, which is what makes the claim that
 * something is being turned at a rate rather than looked up. Nothing here is
 * faked: the dots are the reader's own trials.
 */

import { SimElement, clamp, defineSim } from './base';

type Mode = 'experiment' | 'insight';

interface Trial {
  angle: number;
  same: boolean;
  correct: boolean;
  ms: number;
}

/** Ten cubes in three arms, the shape the 1971 paper used. */
const SHAPE: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 0],
  [3, 0, 0],
  [3, 1, 0],
  [3, 2, 0],
  [3, 2, 1],
  [3, 2, 2],
  [3, 2, 3],
  [2, 2, 3],
];

const CENTROID = SHAPE.reduce(
  (acc, [x, y, z]) => [acc[0] + x / SHAPE.length, acc[1] + y / SHAPE.length, acc[2] + z / SHAPE.length],
  [0, 0, 0] as [number, number, number],
);

const SCALE = 13;
const COS30 = Math.cos(Math.PI / 6);

/** Faces of a unit cube, as corner offsets, with the outward normal. */
const FACES: Array<{ pts: Array<[number, number, number]>; n: [number, number, number] }> = [
  { pts: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], n: [0, 1, 0] },
  { pts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], n: [0, -1, 0] },
  { pts: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], n: [1, 0, 0] },
  { pts: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], n: [-1, 0, 0] },
  { pts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], n: [0, 0, 1] },
  { pts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], n: [0, 0, -1] },
];

const rotY = (p: [number, number, number], a: number): [number, number, number] => [
  p[0] * Math.cos(a) + p[2] * Math.sin(a),
  p[1],
  -p[0] * Math.sin(a) + p[2] * Math.cos(a),
];

/** Isometric. Screen depth grows with all three axes, which is what the
 *  back-to-front sort below relies on. */
const project = (p: [number, number, number]): [number, number] => [
  (p[0] - p[2]) * COS30 * SCALE,
  ((p[0] + p[2]) * 0.5 - p[1]) * SCALE,
];

const depth = (p: [number, number, number]): number => p[0] + p[1] + p[2];

/** One figure, rotated `deg` about the vertical and optionally mirrored. */
function figureSvg(deg: number, mirrored: boolean): string {
  const a = (deg * Math.PI) / 180;
  const light: [number, number, number] = [0.42, 0.78, 0.46];

  const polys: Array<{ d: number; pts: string; shade: number }> = [];

  for (const cube of SHAPE) {
    for (const face of FACES) {
      const world = face.pts.map(off => {
        const x = (cube[0] + off[0] - CENTROID[0]) * (mirrored ? -1 : 1);
        return rotY([x, cube[1] + off[1] - CENTROID[1], cube[2] + off[2] - CENTROID[2]], a);
      });

      const centre: [number, number, number] = [
        world.reduce((n, p) => n + p[0], 0) / 4,
        world.reduce((n, p) => n + p[1], 0) / 4,
        world.reduce((n, p) => n + p[2], 0) / 4,
      ];

      const n = rotY([face.n[0] * (mirrored ? -1 : 1), face.n[1], face.n[2]], a);
      const lit = clamp(n[0] * light[0] + n[1] * light[1] + n[2] * light[2], -1, 1);

      polys.push({
        d: depth(centre),
        pts: world.map(project).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
        shade: lit,
      });
    }
  }

  polys.sort((p, q) => p.d - q.d);

  return polys
    .map(p => {
      // One warm tone lightened by how square-on the face is to the light.
      const l = 40 + Math.round((p.shade + 1) * 15);
      return `<polygon class="rot-face" points="${p.pts}" fill="hsl(20 38% ${l}%)"/>`;
    })
    .join('');
}

/** Least squares through the correct trials: milliseconds per degree. */
function slope(trials: Trial[]): number | null {
  const set = trials.filter(t => t.correct);
  if (set.length < 4) return null;
  const n = set.length;
  const mx = set.reduce((s, t) => s + t.angle, 0) / n;
  const my = set.reduce((s, t) => s + t.ms, 0) / n;
  const num = set.reduce((s, t) => s + (t.angle - mx) * (t.ms - my), 0);
  const den = set.reduce((s, t) => s + (t.angle - mx) ** 2, 0);
  return den === 0 ? null : num / den;
}

class RotationSim extends SimElement {
  private mode: Mode = 'experiment';
  private angle = 0;
  private same = true;
  private shown = 0;
  private live = false;
  private trials: Trial[] = [];
  private lastCorrect: boolean | null = null;
  private lastMs = 0;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-answer]', el => this.answer(el.dataset.simAnswer === 'same'));
    this.buildControls();
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    // Leaving the trials abandons any un-answered pair — you cannot time a
    // stimulus you can no longer see. The recorded trials stay: they are the
    // insight's data.
    this.live = false;
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { trials: this.trials.length });
  }

  /* ── the trial ── */

  private newTrial(): void {
    // Angles in twenty-degree steps: the paper's own sampling, and enough
    // points that a line through them means something.
    this.angle = Math.floor(Math.random() * 10) * 20;
    this.same = Math.random() < 0.5;
    this.lastCorrect = null;
    this.live = true;
    this.shown = performance.now();
    this.render();
    this.emit('trial', { angle: this.angle, same: this.same });
  }

  private answer(saidSame: boolean): void {
    if (!this.live) return;
    const ms = performance.now() - this.shown;
    const correct = saidSame === this.same;
    this.live = false;
    this.lastCorrect = correct;
    this.lastMs = ms;
    this.trials = [...this.trials, { angle: this.angle, same: this.same, correct, ms }];
    this.render();
    this.emit('answered', { correct, ms, angle: this.angle });
  }

  private reset(): void {
    this.trials = [];
    this.live = false;
    this.lastCorrect = null;
    this.render();
    this.emit('reset');
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    // The insight view runs itself off the trials already recorded.
    if (this.mode === 'insight') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    this.addBtn(bar, this.live ? 'Skip this pair' : 'Next pair', 'sim-btn-primary', () => this.newTrial());
    this.addBtn(bar, 'Reset', 'sim-btn-quiet', () => this.reset());
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
    const isInsight = this.mode === 'insight';

    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', this.caption());
    this.text('[data-sim-status]', this.statusText());
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    const started = this.trials.length > 0 || this.live;

    if (isInsight) {
      this.html('[data-sim-plot]', this.plotSvg());
      this.text('[data-sim-verdict]', this.verdict());
      return;
    }

    // The primary button's label follows whether a pair is live.
    const primary = this.q('[data-sim-controls] .sim-btn-primary');
    if (primary) primary.textContent = this.live ? 'Skip this pair' : 'Next pair';

    this.text('[data-sim-angle]', this.live || started ? `${this.angle}°` : '—');
    this.text('[data-sim-count]', String(this.trials.length));
    this.html('[data-sim-pair]', this.pairSvg(started));
    this.qa<HTMLButtonElement>('[data-sim-answer]').forEach(el => (el.disabled = !this.live));
  }

  /** The one sentence under the tabs, matched to what you are looking at now. */
  private caption(): string {
    if (this.mode === 'insight') {
      if (this.trials.filter(t => t.correct).length < 4)
        return 'This is your line: reaction time against angle. It needs a few correct trials across different angles first — do some in “Do the trials”, then come back to see the shape.';
      return 'Every dot is one of your own trials — how long you took, against how far the figure was turned. They rise along a straight line, which means you were turning the shape continuously through every orientation in between, not looking it up.';
    }

    if (this.live)
      return 'The clock is running. Same object, or its mirror image? Answer the moment you are sure — the time is the measurement, not the verdict.';
    if (this.lastCorrect !== null)
      return `${this.lastCorrect ? 'Right' : 'Wrong'} — ${(this.lastMs / 1000).toFixed(2)} s at ${this.angle}°. That is one point on your line. Show the next pair.`;
    return 'Two block figures, one of them turned. Judge whether they are the same object or mirror images — as fast as you can be sure. Your reaction time is what gets recorded.';
  }

  private statusText(): string {
    if (this.mode === 'insight') return `${this.trials.length} trials`;
    return this.live ? 'same or mirrored?' : `${this.trials.length} trials`;
  }

  private pairSvg(started: boolean): string {
    if (!started)
      return '<p class="rot-blank">Two figures, one turned. Decide whether they are the same object or mirror images — as fast as you can be sure. Press “Next pair” to begin.</p>';

    const left = figureSvg(0, false);
    const right = figureSvg(this.angle, !this.same);

    return (
      `<svg class="rot-svg" viewBox="0 0 320 168" role="img" aria-label="Two block figures. The right one is turned ${this.angle} degrees from the left one. Same object or mirror image?">` +
      `<g transform="translate(84 84)">${left}</g>` +
      `<g transform="translate(232 84)">${right}</g>` +
      `<line class="rot-divide" x1="160" y1="16" x2="160" y2="152"/>` +
      `</svg>`
    );
  }

  private plotSvg(): string {
    const W = 320;
    const H = 132;
    const L = 32;
    const R = 306;
    const maxMs = Math.max(4000, ...this.trials.map(t => t.ms));
    const x = (deg: number) => L + (deg / 180) * (R - L);
    const y = (ms: number) => 12 + (1 - clamp(ms, 0, maxMs) / maxMs) * (H - 36);

    const axis =
      `<line class="rot-grid" x1="${L}" y1="${y(0)}" x2="${R}" y2="${y(0)}"/>` +
      `<line class="rot-grid" x1="${L}" y1="${y(maxMs / 2)}" x2="${R}" y2="${y(maxMs / 2)}"/>` +
      `<text class="rot-tick" x="${L - 5}" y="${y(maxMs / 2) + 3}" text-anchor="end">${(maxMs / 2000).toFixed(1)}s</text>` +
      `<text class="rot-tick" x="${L}" y="${H - 5}">0°</text>` +
      `<text class="rot-tick" x="${R}" y="${H - 5}" text-anchor="end">180°</text>`;

    const dots = this.trials
      .map(
        t =>
          `<circle class="rot-dot${t.correct ? '' : ' is-wrong'}" cx="${x(t.angle).toFixed(1)}" cy="${y(t.ms).toFixed(
            1,
          )}" r="3.6"><title>${t.angle}°: ${(t.ms / 1000).toFixed(2)} s${t.correct ? '' : ', wrong'}</title></circle>`,
      )
      .join('');

    const m = slope(this.trials);
    let line = '';
    if (m !== null) {
      const set = this.trials.filter(t => t.correct);
      const mx = set.reduce((s, t) => s + t.angle, 0) / set.length;
      const my = set.reduce((s, t) => s + t.ms, 0) / set.length;
      const at = (deg: number) => my + m * (deg - mx);
      line = `<line class="rot-fit" x1="${L}" y1="${y(at(0)).toFixed(1)}" x2="${R}" y2="${y(at(180)).toFixed(1)}"/>`;
    }

    const empty = this.trials.length
      ? ''
      : `<text class="rot-tick" x="160" y="${H / 2}" text-anchor="middle">your reaction times land here</text>`;

    return `<svg class="rot-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your reaction times plotted against the angle between the figures, over ${this.trials.length} trials.">${axis}${line}${dots}${empty}</svg>`;
  }

  private verdict(): string {
    const correct = this.trials.filter(t => t.correct).length;
    if (this.trials.length < 4)
      return 'Do a handful across different angles. One trial is a reaction time; a set of them is a slope.';

    const m = slope(this.trials);
    if (m === null || m <= 0)
      return `${correct} of ${this.trials.length} right so far, but no upward slope yet. Keep going, and take the wide angles seriously — the effect lives at 120° and beyond.`;

    const degPerSec = 1000 / m;
    return `Your times climb by about ${m.toFixed(
      0,
    )} ms for every extra degree — call it ${degPerSec.toFixed(
      0,
    )}° a second. Shepard and Metzler's subjects came out near sixty. A straight line means something is being turned at a rate rather than looked up — the wider the angle, the further it has to go.`;
  }
}

defineSim('rotation-sim', RotationSim);
