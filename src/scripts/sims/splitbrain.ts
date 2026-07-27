/**
 * <splitbrain-sim> — flash it to one hemifield and ask two different questions.
 *
 * The whole trick of the paradigm is timing: a flash shorter than an eye
 * movement keeps each item in one hemifield, so each hemisphere gets a
 * different half of the trial. With the callosum cut they cannot compare
 * notes, and the two answers come apart.
 *
 * The last step is the one the study is actually about. The left hemisphere is
 * asked to explain a choice its own hand did not make and it does not decline;
 * it produces a reason, immediately and with no sense of having made one up.
 */

import { SimElement, defineSim } from './base';

type Callosum = 'intact' | 'cut';
type Phase = 'idle' | 'flashed' | 'answered';

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

class SplitBrainSim extends SimElement {
  private callosum: Callosum = 'cut';
  private trial = 0;
  private phase: Phase = 'idle';
  private flashing = false;
  private saidIt = false;
  private pointed = false;
  private askedWhy = false;

  private get pair(): Pair {
    return PAIRS[this.trial % PAIRS.length];
  }

  protected setup(): void {
    this.onClick('[data-sim-flash]', () => this.flash());
    this.onClick('[data-sim-say]', () => this.ask('say'));
    this.onClick('[data-sim-point]', () => this.ask('point'));
    this.onClick('[data-sim-why]', () => this.why());
    this.onClick('[data-sim-next]', () => this.next());
    this.onClick('[data-sim-callosum]', el => {
      this.callosum = el.dataset.simCallosum as Callosum;
      this.resetTrial();
      this.render();
    });
  }

  /* ── the trial ── */

  private flash(): void {
    this.resetTrial();
    this.flashing = true;
    this.render();
    // 100 ms: shorter than a saccade, which is the only reason each item
    // stays in the hemifield it started in.
    this.delay(120, () => {
      this.flashing = false;
      this.phase = 'flashed';
      this.render();
      this.emit('flashed', { left: this.pair.left, right: this.pair.right });
    });
  }

  private ask(which: 'say' | 'point'): void {
    if (this.phase === 'idle') return;
    if (which === 'say') this.saidIt = true;
    else this.pointed = true;
    this.phase = 'answered';
    this.render();
    this.emit(which === 'say' ? 'asked-verbal' : 'asked-hand', { callosum: this.callosum });
  }

  private why(): void {
    this.askedWhy = true;
    this.render();
    this.emit('asked-why', { callosum: this.callosum, answer: this.explanation() });
  }

  private next(): void {
    this.trial += 1;
    this.resetTrial();
    this.render();
    this.emit('next-trial', { trial: this.trial });
  }

  private resetTrial(): void {
    this.phase = 'idle';
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

  /* ── view ── */

  protected render(): void {
    const { pair } = this;
    const done = this.phase === 'answered';

    this.text('[data-sim-status]', this.callosum === 'cut' ? 'callosum sectioned' : 'callosum intact');
    this.pressed('[data-sim-callosum]', 'simCallosum', this.callosum);

    this.html('[data-sim-screen]', this.screenHtml());
    this.html('[data-sim-cards]', this.cardsHtml());

    this.disable('[data-sim-say]', this.phase === 'idle');
    this.disable('[data-sim-point]', this.phase === 'idle');

    this.show('[data-sim-said]', this.saidIt);
    this.show('[data-sim-did]', this.pointed);
    this.text('[data-sim-said-text]', this.spoken());
    this.text(
      '[data-sim-did-text]',
      `The left hand takes the ${pair.handCard}.`,
    );

    // The question only becomes interesting once the left hemisphere has
    // committed to a story and the hand has done something it cannot account for.
    const whyAvailable = this.saidIt && this.pointed;
    this.show('[data-sim-why-row]', whyAvailable);
    this.show('[data-sim-why-answer]', this.askedWhy);
    this.text('[data-sim-why-text]', this.explanation());

    this.text('[data-sim-verdict]', this.verdict(done, whyAvailable));
  }

  private screenHtml(): string {
    const { pair } = this;
    if (this.phase === 'idle' && !this.flashing)
      return (
        '<div class="spl-fix">+</div>' +
        '<p class="spl-hint">Eyes on the cross. The flash lasts a tenth of a second — less than it takes to look away.</p>'
      );

    if (this.flashing)
      return (
        `<div class="spl-half spl-left"><span class="spl-item">${pair.left}</span></div>` +
        '<div class="spl-fix">+</div>' +
        `<div class="spl-half spl-right"><span class="spl-item">${pair.right}</span></div>`
      );

    return (
      '<div class="spl-half spl-left"><span class="spl-gone">left field</span></div>' +
      '<div class="spl-fix">+</div>' +
      '<div class="spl-half spl-right"><span class="spl-gone">right field</span></div>'
    );
  }

  private cardsHtml(): string {
    const picked = this.pointed ? this.pair.handCard : null;
    const named = this.saidIt && this.callosum === 'intact' ? this.pair.saidCard : null;
    return this.pair.cards
      .map(card => {
        const cls = card === picked ? ' is-picked' : card === named ? ' is-named' : '';
        return `<span class="spl-card${cls}">${card}</span>`;
      })
      .join('');
  }

  private verdict(done: boolean, whyAvailable: boolean): string {
    if (this.callosum === 'intact') {
      if (!done) return 'With the callosum intact both halves see the whole screen. Run it and there is nothing to come apart.';
      return 'Nothing surprising: one brain, one account of the trial, both items named. This is the control, and it is why the cut condition means anything.';
    }

    if (this.phase === 'idle')
      return 'Two items, one to each hemifield, and a flash too short to look at both. Each half of the brain gets a different trial.';

    if (!whyAvailable)
      return 'Ask it both ways. The half that talks and the half that moves the left hand did not see the same screen.';

    if (!this.askedWhy)
      return `The mouth reported ${this.pair.right} and the left hand took the ${this.pair.handCard}. The hemisphere that has to answer for that never saw the reason for it. Ask it anyway.`;

    return 'It did not say “I don’t know.” It produced a reason, at once, with no sense of having invented one — which is the finding, and the uncomfortable part of it is that this is the half of the brain doing your explaining all the time.';
  }
}

defineSim('splitbrain-sim', SplitBrainSim);
