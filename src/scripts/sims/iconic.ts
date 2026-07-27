/**
 * <iconic-sim> — Sperling's whole and partial report, run on the reader.
 *
 * This is not a demonstration of the result; it is the experiment. A grid of
 * twelve letters is shown for 50 ms. Asked for everything, almost nobody gets
 * more than four or five. Cued to one row straight after the grid goes, most
 * people get nearly all four of that row — and since the cue came after the
 * display, whatever they read it off had to still be there.
 *
 * Multiplying the cued-row score by the number of rows is Sperling's estimate
 * of what was available. Pushing the cue later and watching that estimate fall
 * back toward the whole-report score is the decay.
 */

import { SimElement, clamp, defineSim } from './base';

type Mode = 'whole' | 'partial';
type Phase = 'idle' | 'fixation' | 'display' | 'wait' | 'respond' | 'scored';

interface Trial {
  mode: Mode;
  delayMs: number;
  correct: number;
  estimate: number;
}

const ROWS = 3;
const COLS = 4;
const EXPOSURE_MS = 50;
const FIXATION_MS = 700;
/** No vowels: a row that spells something would be remembered as a word. */
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

const pick = (): string => LETTERS[Math.floor(Math.random() * LETTERS.length)];

/** Letters in common between two sets, counting repeats only as often as they
 *  actually appear — otherwise typing "SSSS" would score four. */
function overlap(typed: string[], target: string[]): number {
  const pool = [...target];
  let hits = 0;
  for (const letter of typed) {
    const at = pool.indexOf(letter);
    if (at >= 0) {
      pool.splice(at, 1);
      hits += 1;
    }
  }
  return hits;
}

class IconicSim extends SimElement {
  private mode: Mode = 'partial';
  private delayMs = 0;
  private phase: Phase = 'idle';
  private grid: string[][] = [];
  private cuedRow = 0;
  private lastTrial: Trial | null = null;
  private trials: Trial[] = [];

  protected setup(): void {
    this.onClick('[data-sim-run]', () => this.start());
    this.onClick('[data-sim-submit]', () => this.score());
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-mode]', el => {
      this.mode = el.dataset.simMode as Mode;
      this.render();
    });
    this.on('[data-sim-delay]', 'input', el => {
      this.delayMs = Number((el as HTMLInputElement).value);
      this.render();
    });
    this.on('[data-sim-answer]', 'keydown', (_el, event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        event.preventDefault();
        this.score();
      }
    });
  }

  /* ── the trial ── */

  private start(): void {
    this.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, pick));
    this.cuedRow = Math.floor(Math.random() * ROWS);
    this.lastTrial = null;
    this.setAnswer('');
    this.phase = 'fixation';
    this.render();

    this.delay(FIXATION_MS, () => {
      this.phase = 'display';
      this.render();
      this.delay(EXPOSURE_MS, () => {
        // Whole report asks straight away; partial report waits out the cue
        // delay first, which is the only variable that matters here.
        this.phase = this.mode === 'partial' && this.delayMs > 0 ? 'wait' : 'respond';
        this.render();
        if (this.phase === 'wait')
          this.delay(this.delayMs, () => {
            this.phase = 'respond';
            this.render();
            this.focusAnswer();
          });
        else this.focusAnswer();
      });
    });
  }

  private score(): void {
    if (this.phase !== 'respond') return;
    const typed = this.answer()
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .split('');

    const target = this.mode === 'partial' ? this.grid[this.cuedRow] : this.grid.flat();
    const correct = overlap(typed, target);
    const estimate = this.mode === 'partial' ? correct * ROWS : correct;

    const trial: Trial = { mode: this.mode, delayMs: this.mode === 'partial' ? this.delayMs : 0, correct, estimate };
    this.lastTrial = trial;
    this.trials = [...this.trials, trial];
    this.phase = 'scored';
    this.render();
    this.emit('scored', trial);
  }

  private reset(): void {
    this.phase = 'idle';
    this.grid = [];
    this.trials = [];
    this.lastTrial = null;
    this.setAnswer('');
    this.render();
    this.emit('reset');
  }

  private answer(): string {
    return this.q<HTMLInputElement>('[data-sim-answer]')?.value ?? '';
  }

  private setAnswer(value: string): void {
    const el = this.q<HTMLInputElement>('[data-sim-answer]');
    if (el) el.value = value;
  }

  private focusAnswer(): void {
    this.q<HTMLInputElement>('[data-sim-answer]')?.focus();
  }

  /* ── what the results say ── */

  private meanOf(kind: Mode): number | null {
    const set = this.trials.filter(t => t.mode === kind);
    if (!set.length) return null;
    return set.reduce((n, t) => n + t.estimate, 0) / set.length;
  }

  /* ── view ── */

  protected render(): void {
    const showing = this.phase === 'display';
    const responding = this.phase === 'respond';

    this.text('[data-sim-status]', this.statusWord());
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.show('[data-sim-delay-field]', this.mode === 'partial');
    this.text('[data-sim-delay-value]', this.delayMs === 0 ? 'immediately' : `${this.delayMs} ms after`);

    this.html('[data-sim-display]', this.displayHtml());
    this.show('[data-sim-answer-row]', responding || this.phase === 'scored');
    this.disable('[data-sim-submit]', !responding);
    this.disable('[data-sim-run]', this.phase !== 'idle' && this.phase !== 'scored');

    this.text('[data-sim-prompt]', this.prompt());
    this.text('[data-sim-trial-result]', this.trialResult());
    this.html('[data-sim-plot]', this.plot());
    this.text('[data-sim-verdict]', this.verdict());

    this.text('[data-sim-count]', this.trials.length === 1 ? '1 trial' : `${this.trials.length} trials`);
    if (showing) this.emit('displayed', { rows: ROWS, cols: COLS });
  }

  private statusWord(): string {
    switch (this.phase) {
      case 'fixation':
        return 'ready…';
      case 'display':
        return `${EXPOSURE_MS} ms`;
      case 'wait':
        return 'waiting for the cue';
      case 'respond':
        return 'report it';
      case 'scored':
        return 'scored';
      default:
        return this.mode === 'partial' ? 'partial report' : 'whole report';
    }
  }

  private displayHtml(): string {
    if (this.phase === 'idle')
      return '<p class="ico-centre">Twelve letters, fifty milliseconds. Run a trial when you are looking at the panel.</p>';
    if (this.phase === 'fixation') return '<p class="ico-fix">+</p>';

    // The grid keeps its geometry for the whole trial — letters, then blanks,
    // then the scored letters, all in the same twelve places, with the cue
    // marker in a column of its own. Nothing on screen moves between seeing
    // the display and reporting it.
    const cueing = this.mode === 'partial' && (this.phase === 'respond' || this.phase === 'scored');

    const rows = this.grid.map((row, r) => {
      const cued = r === this.cuedRow;
      const cells = row
        .map(letter => {
          if (this.phase === 'display') return `<span class="ico-cell">${letter}</span>`;
          if (this.phase !== 'scored') return `<span class="ico-cell is-blank">·</span>`;
          const scored = this.mode === 'whole' || cued;
          return `<span class="ico-cell${scored ? ' is-target' : ' is-dim'}">${letter}</span>`;
        })
        .join('');
      const marker =
        cueing && cued
          ? '<span class="ico-cue-mark">◀ this row</span>'
          : '<span class="ico-cue-mark" aria-hidden="true"></span>';
      return cells + marker;
    });

    return `<div class="ico-grid">${rows.join('')}</div>`;
  }

  private prompt(): string {
    if (this.phase === 'wait') return 'Hold. The cue is coming.';
    if (this.phase !== 'respond') {
      if (this.phase === 'scored') return 'The grid is shown above with the letters you were scored on.';
      return this.mode === 'partial'
        ? 'You will be asked for one row, and you will not know which one until the grid has gone.'
        : 'You will be asked for everything you saw.';
    }
    return this.mode === 'partial'
      ? 'Type the four letters of the marked row, in any order.'
      : 'Type every letter you can still see, in any order.';
  }

  private trialResult(): string {
    const t = this.lastTrial;
    if (!t) return '';
    if (t.mode === 'whole')
      return `${t.correct} of ${ROWS * COLS} letters. That is the whole-report score — and it is about where almost everyone lands.`;
    return `${t.correct} of ${COLS} in the cued row. Across ${ROWS} rows that puts about ${t.estimate.toFixed(
      0,
    )} of the 12 letters still available when the cue arrived${t.delayMs ? `, ${t.delayMs} ms after the grid` : ''}.`;
  }

  /** Whole-report scores as a flat line, partial-report estimates against the
   *  delay that produced them. The gap between the two is the finding. */
  private plot(): string {
    const W = 320;
    const H = 120;
    const L = 26;
    const R = 306;
    const maxDelay = 1000;
    const x = (ms: number) => L + (ms / maxDelay) * (R - L);
    const y = (n: number) => 12 + (1 - clamp(n, 0, 12) / 12) * (H - 34);

    const gridLines = [0, 4, 8, 12]
      .map(
        n =>
          `<line class="ico-grid-line" x1="${L}" y1="${y(n)}" x2="${R}" y2="${y(n)}"/>` +
          `<text class="ico-tick" x="${L - 5}" y="${y(n) + 3}" text-anchor="end">${n}</text>`,
      )
      .join('');

    const whole = this.meanOf('whole');
    const wholeLine =
      whole === null
        ? ''
        : `<line class="ico-whole" x1="${L}" y1="${y(whole)}" x2="${R}" y2="${y(whole)}"/>` +
          `<text class="ico-tick ico-tick-em" x="${R}" y="${y(whole) - 5}" text-anchor="end">whole report — ${whole.toFixed(
            1,
          )}</text>`;

    const dots = this.trials
      .filter(t => t.mode === 'partial')
      .map(
        t =>
          `<circle class="ico-dot" cx="${x(t.delayMs).toFixed(1)}" cy="${y(t.estimate).toFixed(
            1,
          )}" r="4"><title>cue ${t.delayMs} ms after: about ${t.estimate} available</title></circle>`,
      )
      .join('');

    return (
      `<svg class="ico-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Letters available, plotted against how long after the grid the cue arrived.">` +
      gridLines +
      wholeLine +
      dots +
      `<text class="ico-tick" x="${L}" y="${H - 5}">cue immediately</text>` +
      `<text class="ico-tick" x="${R}" y="${H - 5}" text-anchor="end">1 s later</text>` +
      `</svg>`
    );
  }

  private verdict(): string {
    const whole = this.meanOf('whole');
    const partials = this.trials.filter(t => t.mode === 'partial');
    const early = partials.filter(t => t.delayMs <= 200);
    const late = partials.filter(t => t.delayMs >= 700);

    if (!this.trials.length)
      return 'Run a few trials of each kind. The point is not what you score — it is the difference between the two scores.';

    if (whole === null) return 'Now try whole report, where you are asked for the entire grid, and compare.';
    if (!early.length) return 'Now try partial report with the cue immediately after the grid.';

    const earlyMean = early.reduce((n, t) => n + t.estimate, 0) / early.length;
    const gap = earlyMean - whole;

    if (late.length) {
      const lateMean = late.reduce((n, t) => n + t.estimate, 0) / late.length;
      return `Cued at once you had about ${earlyMean.toFixed(1)} letters available; cued a second later, about ${lateMean.toFixed(
        1,
      )}; asked for the lot, ${whole.toFixed(
        1,
      )}. The thing the cue reads off is gone within a second — which is why you can only ever report the residue of it.`;
    }

    if (gap > 1.5)
      return `About ${earlyMean.toFixed(1)} letters available when cued at once against ${whole.toFixed(
        1,
      )} when asked for everything. The cue came after the grid had gone, so that extra was already in you — you simply could not get it out in time. Now push the cue later.`;

    return 'Keep going — a few more trials of each. The effect is a gap between two averages, so it needs more than one trial of each to show.';
  }
}

defineSim('iconic-sim', IconicSim);
