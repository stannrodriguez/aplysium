/**
 * <rotation-sim> — Shepard and Metzler's task, run on the reader.
 *
 * The figures are genuinely three-dimensional: ten unit cubes, rotated about
 * the vertical axis and projected isometrically, with every face sorted back
 * to front and shaded by its own normal. They have to be really rotated,
 * because a picture that only looks rotated can be matched by comparing
 * outlines and the task stops being the task.
 *
 * The result is not the reader's accuracy. It is the slope of their reaction
 * times against angle — a straight line, which is what makes the claim that
 * something is being turned at a rate rather than looked up.
 */

import { SimElement, clamp, defineSim } from './base';

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
  private angle = 0;
  private same = true;
  private shown = 0;
  private live = false;
  private trials: Trial[] = [];
  private lastCorrect: boolean | null = null;
  private lastMs = 0;

  protected setup(): void {
    this.onClick('[data-sim-next]', () => this.newTrial());
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-answer]', el => this.answer(el.dataset.simAnswer === 'same'));
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

  /* ── view ── */

  protected render(): void {
    const started = this.trials.length > 0 || this.live;

    this.text('[data-sim-status]', this.live ? 'same or mirrored?' : `${this.trials.length} trials`);
    this.text('[data-sim-angle]', this.live || started ? `${this.angle}°` : '—');

    this.html('[data-sim-pair]', this.pairSvg(started));
    this.disable('[data-sim-answer][data-sim-answer="same"]', !this.live);
    this.qa<HTMLButtonElement>('[data-sim-answer]').forEach(el => (el.disabled = !this.live));

    this.text('[data-sim-feedback]', this.feedback());
    this.html('[data-sim-plot]', this.plotSvg());
    this.text('[data-sim-verdict]', this.verdict());
  }

  private pairSvg(started: boolean): string {
    if (!started)
      return '<p class="rot-blank">Two figures, one turned. Decide whether they are the same object or mirror images — as fast as you can be sure.</p>';

    const left = figureSvg(0, false);
    const right = figureSvg(this.angle, !this.same);

    return (
      `<svg class="rot-svg" viewBox="0 0 320 168" role="img" aria-label="Two block figures. The right one is turned ${this.angle} degrees from the left one.">` +
      `<g transform="translate(84 84)">${left}</g>` +
      `<g transform="translate(232 84)">${right}</g>` +
      `<line class="rot-divide" x1="160" y1="16" x2="160" y2="152"/>` +
      `</svg>`
    );
  }

  private feedback(): string {
    if (this.live) return 'Answer as soon as you are sure. The time is what is being measured, not the answer.';
    if (this.lastCorrect === null) return 'Run a trial.';
    return `${this.lastCorrect ? 'Right' : 'Wrong'} — ${(this.lastMs / 1000).toFixed(2)} s at ${this.angle}°.`;
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
