/**
 * <iconic-sim> — Sperling's whole and partial report, run on the reader.
 *
 * The markup is server-rendered by IconicSim.astro; this class attaches to it
 * and drives the readouts. Rather than one free-play instrument, the panel is a
 * guided path: three mode tabs, one obvious action apiece (flash the grid), and
 * a caption that always describes what you are looking at now.
 *
 *   Whole report   — the grid flashes; report all twelve. Almost nobody clears
 *                    four or five, whatever they felt they saw.
 *   Partial report — the same grid, then a cue names ONE row after it has gone.
 *                    Most people get nearly all of that row, whichever is named.
 *   Delay the cue  — the insight: if any unpredictable row can be read at once,
 *                    all twelve must have been present, so multiply up (~9 of 12).
 *                    Push the cue later and that estimate collapses back to four
 *                    within a second — a high-capacity store, decaying on its own.
 *
 * This is the experiment, not a replay of it. The grid is real, the exposure is
 * real, and every score is the reader's own typing measured against what was
 * shown. Nothing here is faked or pre-recorded.
 */

import { SimElement, clamp, defineSim } from './base';

type Mode = 'whole' | 'partial' | 'insight';
type Report = 'whole' | 'partial';
type Phase = 'idle' | 'fixation' | 'display' | 'wait' | 'respond' | 'scored';

interface Trial {
  report: Report;
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

const STATUS: Record<Mode, string> = {
  whole: 'whole report',
  partial: 'partial report',
  insight: 'delay the cue',
};

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
  private mode: Mode = 'whole';
  private delayMs = 0;
  private phase: Phase = 'idle';
  private grid: string[][] = [];
  private cuedRow = 0;
  private lastTrial: Trial | null = null;
  private trials: Trial[] = [];

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-submit]', () => this.score());
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
    this.buildControls();
  }

  /* ── how the current mode reports ── */

  private report(): Report {
    return this.mode === 'whole' ? 'whole' : 'partial';
  }

  /** The cue delay only bites in the insight mode; elsewhere it is immediate. */
  private effectiveDelay(): number {
    return this.mode === 'insight' ? this.delayMs : 0;
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    // A fresh beat, but the trials so far stay — the whole-report average is
    // the reference the partial and insight modes are measured against.
    this.phase = 'idle';
    this.grid = [];
    this.lastTrial = null;
    this.setAnswer('');
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
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
        // Partial report waits out the cue delay before it can be answered;
        // that pause is the only variable the insight mode moves.
        const wait = this.report() === 'partial' && this.effectiveDelay() > 0;
        this.phase = wait ? 'wait' : 'respond';
        this.render();
        if (wait)
          this.delay(this.effectiveDelay(), () => {
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

    const report = this.report();
    const target = report === 'partial' ? this.grid[this.cuedRow] : this.grid.flat();
    const correct = overlap(typed, target);
    const estimate = report === 'partial' ? correct * ROWS : correct;

    const trial: Trial = { report, delayMs: this.effectiveDelay(), correct, estimate };
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

  /* ── controls, rebuilt per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';
    this.addBtn(bar, 'Flash the grid', 'sim-btn-primary', true, () => this.start());
    this.addBtn(bar, 'Reset', 'sim-btn-quiet', false, () => this.reset());
    this.updateRun();
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, isRun: boolean, fn: () => void): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    if (isRun) b.dataset.simRun = '';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  private updateRun(): void {
    const run = this.q<HTMLButtonElement>('[data-sim-run]');
    if (!run) return;
    const busy = this.phase !== 'idle' && this.phase !== 'scored';
    run.disabled = busy;
    run.textContent = this.phase === 'scored' ? 'Flash again' : 'Flash the grid';
  }

  /* ── what the results say ── */

  private meanEstimate(report: Report): number | null {
    const set = this.trials.filter(t => t.report === report);
    if (!set.length) return null;
    return set.reduce((n, t) => n + t.estimate, 0) / set.length;
  }

  private meanCorrect(report: Report): number | null {
    const set = this.trials.filter(t => t.report === report);
    if (!set.length) return null;
    return set.reduce((n, t) => n + t.correct, 0) / set.length;
  }

  /* ── view ── */

  protected render(): void {
    const responding = this.phase === 'respond';
    const showing = this.phase === 'display';
    const insight = this.mode === 'insight';

    this.text('[data-sim-status]', this.statusWord());
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', this.leadText());

    const stage = this.q('[data-sim-display]');
    if (stage) {
      stage.innerHTML = this.displayHtml();
      stage.setAttribute('aria-label', this.stageLabel());
    }

    this.show('[data-sim-answer-row]', responding || this.phase === 'scored');
    this.disable('[data-sim-submit]', !responding);
    this.updateRun();

    this.text('[data-sim-prompt]', this.prompt());
    this.text('[data-sim-trial-result]', this.trialResult());

    this.show('[data-sim-insight]', insight);
    if (insight) {
      this.text(
        '[data-sim-delay-value]',
        this.delayMs === 0 ? 'immediately' : `${this.delayMs} ms after`,
      );
      this.html('[data-sim-multiply]', this.multiplyUp());
      this.html('[data-sim-plot]', this.plot());
      this.text('[data-sim-verdict]', this.verdict());
    }

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
        return STATUS[this.mode];
    }
  }

  private stageLabel(): string {
    switch (this.phase) {
      case 'fixation':
        return 'A fixation cross. The grid is about to flash.';
      case 'display':
        return `A grid of ${ROWS * COLS} letters, shown for ${EXPOSURE_MS} milliseconds.`;
      case 'wait':
        return 'The grid is gone. Waiting for the cue.';
      case 'respond':
        return this.report() === 'partial'
          ? 'The grid is gone; one row is marked as the cue. Type just that row.'
          : 'The grid is gone. Type every letter you can still see.';
      case 'scored':
        return this.report() === 'partial'
          ? 'The grid, with the cued row you were scored on marked.'
          : 'The grid, with every letter you were scored on.';
      default:
        return 'A blank display, waiting for you to flash the grid.';
    }
  }

  private displayHtml(): string {
    if (this.phase === 'idle')
      return '<p class="ico-centre">Twelve letters, fifty milliseconds. Flash the grid when you are looking at the panel.</p>';
    if (this.phase === 'fixation') return '<p class="ico-fix">+</p>';

    // The grid keeps its geometry for the whole trial — letters, then blanks,
    // then the scored letters, all in the same twelve places, with the cue
    // marker in a column of its own. Nothing on screen moves between seeing the
    // display and reporting it.
    const cueing =
      this.report() === 'partial' && (this.phase === 'wait' || this.phase === 'respond' || this.phase === 'scored');

    const rows = this.grid.map((row, r) => {
      const cued = r === this.cuedRow;
      const cells = row
        .map(letter => {
          if (this.phase === 'display') return `<span class="ico-cell">${letter}</span>`;
          if (this.phase !== 'scored') return `<span class="ico-cell is-blank">·</span>`;
          const scored = this.report() === 'whole' || cued;
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
    if (this.phase === 'scored') return 'The grid is shown above, with the letters you were scored on.';
    if (this.phase !== 'respond') {
      return this.report() === 'partial'
        ? 'You will be asked for one row, and you will not know which one until the grid has gone.'
        : 'You will be asked for everything you saw.';
    }
    return this.report() === 'partial'
      ? 'Type the four letters of the marked row, in any order.'
      : 'Type every letter you can still see, in any order.';
  }

  private trialResult(): string {
    const t = this.lastTrial;
    if (!t) return '';
    if (t.report === 'whole')
      return `${t.correct} of ${ROWS * COLS} letters — your whole-report score, and about where almost everyone lands.`;
    return `${t.correct} of ${COLS} in the cued row. Since you could not know which row would be asked, all three rows must have been that legible — about ${t.estimate.toFixed(
      0,
    )} of the 12 were still there when the cue arrived${t.delayMs ? `, ${t.delayMs} ms after the grid` : ''}.`;
  }

  /* ── insight: the multiply-up, made visual ── */

  private multiplyUp(): string {
    const cued = this.meanCorrect('partial');
    if (cued === null)
      return '<p class="sim-note">Flash the grid a few times here to build the estimate. Each cued row you read is stood in for the two you were not asked.</p>';

    const available = clamp(Math.round(cued * ROWS), 0, ROWS * COLS);
    const whole = this.meanCorrect('whole');
    const reported = whole === null ? 0 : clamp(Math.round(whole), 0, ROWS * COLS);

    const slots = Array.from({ length: ROWS * COLS }, (_, i) => {
      if (i < reported) return '<span class="ico-slot is-reported"></span>';
      if (i < available) return '<span class="ico-slot is-available"></span>';
      return '<span class="ico-slot is-empty"></span>';
    }).join('');

    const sum =
      `<span class="ico-sum-term"><b>${cued.toFixed(1)}</b> of ${COLS}<em>cued row</em></span>` +
      `<span class="ico-sum-op">&times;</span>` +
      `<span class="ico-sum-term"><b>${ROWS}</b> rows<em>any could be asked</em></span>` +
      `<span class="ico-sum-op">&asymp;</span>` +
      `<span class="ico-sum-term ico-sum-out"><b>${available}</b> of ${ROWS * COLS}<em>were there</em></span>`;

    const wholeLine =
      whole === null
        ? '<p class="sim-note">Run a whole-report trial too, and the bright band is what report alone can pull out before it fades.</p>'
        : `<p class="sim-note">Whole report gets only about <b>${reported}</b> of them out (the bright band) before the rest fade.</p>`;

    return (
      `<div class="ico-sum">${sum}</div>` +
      `<div class="ico-slots" aria-hidden="true">${slots}</div>` +
      wholeLine
    );
  }

  /** Whole-report scores as a flat line, partial-report estimates against the
   *  delay that produced them. The dots falling back onto the line is the decay. */
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

    const whole = this.meanEstimate('whole');
    const wholeLine =
      whole === null
        ? ''
        : `<line class="ico-whole" x1="${L}" y1="${y(whole)}" x2="${R}" y2="${y(whole)}"/>` +
          `<text class="ico-tick ico-tick-em" x="${R}" y="${y(whole) - 5}" text-anchor="end">whole report — ${whole.toFixed(
            1,
          )}</text>`;

    const dots = this.trials
      .filter(t => t.report === 'partial')
      .map(
        t =>
          `<circle class="ico-dot" cx="${x(t.delayMs).toFixed(1)}" cy="${y(t.estimate).toFixed(
            1,
          )}" r="4"><title>cue ${t.delayMs} ms after: about ${t.estimate} available</title></circle>`,
      )
      .join('');

    return (
      `<svg class="ico-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Letters available, plotted against how long after the grid the cue arrived. The dots fall toward the whole-report line as the delay grows.">` +
      gridLines +
      wholeLine +
      dots +
      `<text class="ico-tick" x="${L}" y="${H - 5}">cue immediately</text>` +
      `<text class="ico-tick" x="${R}" y="${H - 5}" text-anchor="end">1 s later</text>` +
      `</svg>`
    );
  }

  private verdict(): string {
    const whole = this.meanEstimate('whole');
    const partials = this.trials.filter(t => t.report === 'partial');
    const early = partials.filter(t => t.delayMs <= 200);
    const late = partials.filter(t => t.delayMs >= 700);

    if (!partials.length)
      return 'Flash the grid with the cue immediate, then drag it later and later. Watch the letters-available estimate fall back toward four — that fall is the store decaying.';

    const earlyMean = early.length ? early.reduce((n, t) => n + t.estimate, 0) / early.length : null;

    if (late.length) {
      const lateMean = late.reduce((n, t) => n + t.estimate, 0) / late.length;
      const wholeWord = whole === null ? 'about four' : whole.toFixed(1);
      const earlyWord = earlyMean === null ? 'nine or so' : earlyMean.toFixed(1);
      return `Cued at once you had about ${earlyWord} letters available; cued a second later, about ${lateMean.toFixed(
        1,
      )}; asked for the lot, ${wholeWord}. The thing the cue reads off is gone within a second — which is why you can only ever report the residue of it.`;
    }

    if (earlyMean !== null && whole !== null && earlyMean - whole > 1.5)
      return `About ${earlyMean.toFixed(1)} letters available when cued at once, against ${whole.toFixed(
        1,
      )} when asked for everything. The cue came after the grid had gone, so that extra was already in you — you simply could not get it out in time. Now push the cue later and watch it drain away.`;

    return 'Keep going — the cue immediate a few times, then late a few times. The decay is a gap between two averages, so it needs more than one trial at each delay to show.';
  }

  private leadText(): string {
    const scored = this.phase === 'scored';
    switch (this.mode) {
      case 'whole':
        if (this.phase === 'fixation') return 'Fix your eyes on the cross. The grid is about to flash.';
        if (this.phase === 'display') return 'Twelve letters, fifty milliseconds — that is the whole exposure.';
        if (this.phase === 'respond')
          return 'Now type every letter you can still see. Almost everyone stalls around four, however full the grid felt.';
        if (scored)
          return 'That is whole report: a full grid seen, only a handful reported. The limit is on getting it out, not on taking it in. Now try partial report.';
        return 'Whole report. A grid of twelve letters flashes for fifty milliseconds; then type every letter you can still see. Almost everyone lands around four.';
      case 'partial':
        if (this.phase === 'fixation') return 'Fix on the cross. The grid is coming, and then a cue for just one row.';
        if (this.phase === 'display') return 'Twelve letters, fifty milliseconds — then only one row will be asked for.';
        if (this.phase === 'respond')
          return 'The cue marks one row. Type just those four letters — most people get nearly all of them, whichever row is named.';
        if (scored)
          return 'You read a row you could not have chosen in advance. Since any row would have gone this well, every row must have been there. Now open “Delay the cue.”';
        return 'Partial report. The same grid flashes, then a cue names ONE row after it has gone — you cannot know which. Report only those four.';
      case 'insight':
        if (this.phase === 'fixation') return 'Fix on the cross. The grid flashes, then the cue arrives after the pause you set.';
        if (this.phase === 'display') return 'Twelve letters, fifty milliseconds. The cue for the row comes later this time.';
        if (this.phase === 'wait') return 'The grid is already gone. The store is decaying while you wait for the cue.';
        if (this.phase === 'respond') return 'Now the cue arrives. Type the marked row — but the letters have had time to fade.';
        if (scored)
          return 'Each row cued reads for the two you were not asked, so multiply up: that is the count that was present. Push the cue later and the count drains back to four.';
        return 'Delay the cue. If any unpredictable row can be read, all twelve were present — so multiply up. Then push the cue later and watch that estimate collapse toward four: the store is decaying on its own.';
    }
  }
}

defineSim('iconic-sim', IconicSim);
