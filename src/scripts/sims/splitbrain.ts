/**
 * <splitbrain-sim> — flash it to one hemifield, then ask the guided way.
 *
 * The whole trick of the paradigm is timing: a flash shorter than an eye
 * movement keeps each item in one hemifield, so each hemisphere gets a
 * different half of the trial. With the callosum cut they cannot compare
 * notes, and the two answers come apart.
 *
 * Three mode tabs walk the reader through the same real trial, one beat each:
 *
 *   Ask out loud   — the LEFT hemisphere talks, and (cut) it only ever received
 *                    the RIGHT hemifield, so it names that item and nothing else.
 *   Ask the left hand — the RIGHT hemisphere moves that hand, and it only ever
 *                    received the LEFT hemifield, so the hand takes the match for
 *                    the item the mouth could not name. The two answers disagree.
 *   Why did you do that? — the insight. The talking half is asked to explain a
 *                    choice its own hand made for a reason it never received. It
 *                    does not say "I don't know"; it invents a confident reason
 *                    on the spot, with no sense of having made one up. Gazzaniga's
 *                    interpreter, caught confabulating.
 *
 * Unlike a per-mode reset, one trial's answers accumulate across the ask tabs,
 * so the disagreement is still on the table when you reach the insight. Only a
 * new pair, or flipping the callosum, starts a fresh trial. Nothing is faked:
 * every answer is computed from the pair and the callosum state.
 */

import { SimElement, defineSim, prefersReducedMotion } from './base';

type Callosum = 'intact' | 'cut';
type Mode = 'verbal' | 'hand' | 'why';

interface Pair {
  /** Right visual hemifield → left hemisphere → the half that talks. */
  right: string;
  /** Left visual hemifield → right hemisphere → the half that moves that hand. */
  left: string;
  cards: string[];
  /** The card the right hemisphere reaches for — it saw `left`. */
  handCard: string;
  /** The card the left hemisphere would reach for — it saw `right`. */
  saidCard: string;
  /** What the left hemisphere says when asked to explain the left hand. */
  confabulation: string;
  /** What it says when both halves saw everything. */
  honest: string;
}

const PAIRS: Pair[] = [
  {
    right: 'chicken claw',
    left: 'snow scene',
    cards: ['chicken', 'shovel', 'hammer', 'apple', 'toaster', 'lamp'],
    handCard: 'shovel',
    saidCard: 'chicken',
    confabulation: 'The claw goes with the chicken — and you need a shovel to clean out the chicken shed.',
    honest: 'The claw goes with the chicken, and the shovel goes with the snow.',
  },
  {
    right: 'CAR',
    left: 'KEY',
    cards: ['key', 'car', 'cup', 'book', 'coin', 'glove'],
    handCard: 'key',
    saidCard: 'car',
    confabulation: 'Well, you need a key to start the car.',
    honest: 'It said car on the right and key on the left, so I took both.',
  },
  {
    right: 'APPLE',
    left: 'KNIFE',
    cards: ['apple', 'knife', 'plate', 'candle', 'rope', 'brush'],
    handCard: 'knife',
    saidCard: 'apple',
    confabulation: 'You cut an apple with a knife. That is why I picked it up.',
    honest: 'Apple on one side, knife on the other. I saw them both.',
  },
];

const STATUS: Record<Callosum, string> = {
  cut: 'callosum sectioned',
  intact: 'callosum intact',
};

class SplitBrainSim extends SimElement {
  private callosum: Callosum = 'cut';
  private mode: Mode = 'verbal';
  private trial = 0;
  private flashed = false;
  private flashing = false;
  private saidIt = false;
  private pointed = false;
  private askedWhy = false;

  private get pair(): Pair {
    return PAIRS[this.trial % PAIRS.length];
  }

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-callosum]', el => {
      this.callosum = el.dataset.simCallosum as Callosum;
      this.resetTrial();
      this.render();
      this.emit('callosum', { callosum: this.callosum });
    });
    this.buildControls();
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    this.mode = mode;
    // The why beat needs a committed trial to explain. If the reader jumps
    // straight here without asking both ways, stage the completed asks so the
    // interpreter has something real to account for — same values the model
    // would have produced by hand.
    if (mode === 'why' && !(this.saidIt && this.pointed)) {
      this.flashed = true;
      this.saidIt = true;
      this.pointed = true;
    }
    this.askedWhy = false;
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { callosum: this.callosum });
  }

  /* ── the trial ── */

  /** Flash the pair (shorter than a saccade), then run this mode's ask. */
  private flashThen(after: () => void): void {
    this.flashing = true;
    this.render();
    // 120 ms: shorter than a saccade, which is the only reason each item stays
    // in the hemifield it started in.
    this.delay(prefersReducedMotion() ? 0 : 120, () => {
      this.flashing = false;
      this.flashed = true;
      after();
      this.render();
    });
  }

  private askVerbal(): void {
    this.flashThen(() => {
      this.saidIt = true;
      this.emit('asked-verbal', { callosum: this.callosum, answer: this.spoken() });
    });
  }

  private askHand(): void {
    this.flashThen(() => {
      this.pointed = true;
      this.emit('asked-hand', { callosum: this.callosum, card: this.pair.handCard });
    });
  }

  private askWhy(): void {
    this.askedWhy = true;
    this.render();
    this.emit('asked-why', { callosum: this.callosum, answer: this.explanation() });
  }

  private next(): void {
    this.trial += 1;
    this.resetTrial();
    if (this.mode === 'why') {
      // Keep the insight beat self-contained: a fresh pair arrives already
      // asked both ways, waiting only for the "why".
      this.flashed = true;
      this.saidIt = true;
      this.pointed = true;
    }
    this.render();
    this.emit('next-trial', { trial: this.trial });
  }

  private resetTrial(): void {
    this.flashed = false;
    this.flashing = false;
    this.saidIt = false;
    this.pointed = false;
    this.askedWhy = false;
  }

  /* ── what each half knows ── */

  /** The left hemisphere talks, and with the callosum cut it only ever saw
   *  the right hemifield. */
  private spoken(): string {
    if (this.callosum === 'intact') return `“${this.pair.right}, and ${this.pair.left}.”`;
    return `“${this.pair.right}.”`;
  }

  private explanation(): string {
    return this.callosum === 'intact' ? `“${this.pair.honest}”` : `“${this.pair.confabulation}”`;
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'verbal') {
      this.addBtn(bar, 'Flash, then ask out loud', 'sim-btn-primary', () => this.askVerbal());
    } else if (this.mode === 'hand') {
      this.addBtn(bar, 'Flash, then take with the left hand', 'sim-btn-primary', () => this.askHand());
    } else {
      const b = this.addBtn(bar, 'Ask: why did you do that?', 'sim-btn-primary', () => this.askWhy());
      b.disabled = this.askedWhy;
    }
    this.addBtn(bar, 'New pair', 'sim-btn-quiet', () => this.next());
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  }

  /* ── view ── */

  protected render(): void {
    this.text('[data-sim-status]', STATUS[this.callosum]);
    this.pressed('[data-sim-callosum]', 'simCallosum', this.callosum);
    this.pressed('[data-sim-mode]', 'simMode', this.mode);

    this.text('[data-sim-lead]', this.lead());

    const screen = this.q('[data-sim-screen]');
    if (screen) {
      this.html('[data-sim-screen]', this.screenHtml());
      screen.setAttribute('aria-label', this.screenLabel());
    }
    this.html('[data-sim-cards]', this.cardsHtml());

    this.show('[data-sim-said]', this.saidIt);
    this.show('[data-sim-did]', this.pointed);
    this.text('[data-sim-said-text]', this.spoken());
    this.text('[data-sim-did-text]', `The left hand takes the ${this.pair.handCard}.`);

    this.show('[data-sim-why-answer]', this.askedWhy);
    this.text('[data-sim-why-text]', this.explanation());

    // The insight button is spent once the reason has been given.
    this.disable('[data-sim-controls] .sim-btn-primary', this.mode === 'why' && this.askedWhy);

    this.text('[data-sim-verdict]', this.verdict());
  }

  /* ── the divided screen ── */

  private screenHtml(): string {
    const { pair } = this;
    if (!this.flashed && !this.flashing)
      return (
        '<div class="spl-fix">+</div>' +
        '<p class="spl-hint">Eyes on the cross. The flash lasts a tenth of a second — less than it takes to look away.</p>'
      );

    if (this.flashing)
      return (
        `<div class="spl-half spl-left"><span class="spl-item is-flash">${pair.left}</span></div>` +
        '<div class="spl-fix">+</div>' +
        `<div class="spl-half spl-right"><span class="spl-item is-flash">${pair.right}</span></div>`
      );

    return (
      '<div class="spl-half spl-left"><span class="spl-gone">left field</span></div>' +
      '<div class="spl-fix">+</div>' +
      '<div class="spl-half spl-right"><span class="spl-gone">right field</span></div>'
    );
  }

  private screenLabel(): string {
    const { pair } = this;
    if (this.flashing) return `Flashing “${pair.left}” to the left hemifield and “${pair.right}” to the right`;
    if (this.flashed) return 'The flash is gone; each hemifield is blank again';
    return 'A screen split at a fixation cross, ready to flash one item to each visual hemifield';
  }

  private cardsHtml(): string {
    const picked = this.pointed ? this.pair.handCard : null;
    // With the callosum intact the mouth saw both, so it can also name its card.
    const named = this.saidIt && this.callosum === 'intact' ? this.pair.saidCard : null;
    return this.pair.cards
      .map(card => {
        const cls = card === picked ? ' is-picked' : card === named ? ' is-named' : '';
        return `<span class="spl-card${cls}">${card}</span>`;
      })
      .join('');
  }

  /* ── the state-matched caption and verdict ── */

  private lead(): string {
    const { pair } = this;
    const cut = this.callosum === 'cut';

    if (this.mode === 'verbal') {
      if (!this.saidIt)
        return cut
          ? 'Flash the pair, then ask them to say what they saw. The half of the brain that talks is the left — and with the callosum cut it only ever received the right hemifield.'
          : 'With the callosum intact both halves share the whole screen. Ask out loud and the mouth can name everything — this is the control.';
      return cut
        ? `They name the ${pair.right} and nothing else. The talking half never received the left-field item, so as far as it knows that side of the screen was blank.`
        : `They name both items. One brain, one report — nothing is hidden from the half that talks.`;
    }

    if (this.mode === 'hand') {
      if (!this.pointed)
        return cut
          ? 'Now ask the LEFT hand — it is run by the right hemisphere, which only ever received the LEFT hemifield. Flash again and let the hand reach.'
          : 'The left hand is still run by the right hemisphere, but with the callosum intact both halves saw everything, so nothing comes apart.';
      return cut
        ? `The left hand takes the ${pair.handCard} — the match for the left-field item the mouth could not name. The mute half knew its own half all along.`
        : `The left hand takes the ${pair.handCard}, and the mouth already named it too. Both halves agree, because both halves saw the screen.`;
    }

    // why — the insight
    if (!this.askedWhy)
      return cut
        ? `The mouth reported the ${pair.right}; the left hand took the ${pair.handCard} for a reason the talking half never received. Ask that talking half why the hand did it.`
        : 'With the callosum intact the talking half saw the whole screen, so there is nothing to invent. Ask it and you get the plain truth — the control.';
    return cut
      ? 'It did not say “I don’t know.” It invented a confident reason on the spot and cannot tell it made one up. This interpreter is the same voice that explains you to yourself all day.'
      : 'A plain, accurate account — no interpreter needed, because nothing was hidden from the half doing the talking.';
  }

  private verdict(): string {
    if (this.callosum === 'intact')
      return 'Callosum intact: one brain, one account of the trial. This is the control, and it is what makes the cut condition mean anything.';

    if (this.mode === 'why' && this.askedWhy)
      return 'The reason arrived at once, fluent and certain, for a choice the speaking half had no part in. An explanation of your own behaviour is assembled after the fact — and it feels identical to a real one.';

    if (this.saidIt && this.pointed)
      return 'Two answers, one for each hemisphere, and they do not match. Each half knows only the hemifield it received.';

    if (this.saidIt || this.pointed)
      return 'One half has answered. Ask the other way too — the half that talks and the half that moves the left hand did not see the same screen.';

    return 'Two items, one to each hemifield, and a flash too short to look at both. Each half of the brain gets a different trial.';
  }
}

defineSim('splitbrain-sim', SplitBrainSim);
