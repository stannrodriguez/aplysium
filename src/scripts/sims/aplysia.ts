/**
 * <aplysia-sim> — the gill-withdrawal reflex as a guided instrument.
 *
 * The markup is server-rendered by AplysiaSim.astro; this class attaches to it
 * and drives the readouts. Rather than one free-play instrument, the panel is a
 * guided path: four mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Baseline       — one touch, one withdrawal, at full strength.
 *   Habituation    — repeat the touch; transmitter depletes, the gill gives up.
 *   Sensitization  — a tail shock sprays serotonin; the same touch overreacts.
 *   Short vs long  — the insight: one session fades, spaced sessions grow new
 *                    connections and need new protein. Two mechanisms, one synapse.
 *
 * Behaviour model (unchanged from the recorded values):
 *   a      = min(1.55, max(0.16, e^(-0.27·habTaps)) · (1 + 1.9·sens))
 *   quanta = round(2 + a·13); transmitter and gill response follow it.
 */

import { SimElement, clamp, defineSim, prefersReducedMotion } from './base';

type Mode = 'baseline' | 'hab' | 'sens' | 'insight';
type Schedule = 'massed' | 'spaced';
type Protein = 'intact' | 'blocked';

interface SimState {
  mode: Mode;
  taps: number;
  habTaps: number;
  sens: number;
  schedule: Schedule | null;
  protein: Protein;
  trained: boolean;
}

interface TrainingResult {
  h1: number;
  h24: number;
  newSynapses: number;
  h1Word: string;
  h24Word: string;
  connNote: string;
  verdict: string;
}

const MAX_AMP = 1.55;
const VESICLES = 9;

const LEAD: Record<Mode, string> = {
  baseline:
    'A harmless touch fires the sensory neuron, which releases transmitter onto the motor neuron. The gill withdraws. This is the untrained baseline.',
  hab:
    'Keep delivering gentle, harmless touches. Watch the transmitter deplete — the sensory neuron releases less each time, and the gill stops bothering. The animal has learned the touch is safe.',
  sens:
    'Pair the touch with a noxious tail shock. An interneuron sprays serotonin onto the sensory neuron, so it releases more transmitter. The same gentle touch now snaps the gill back harder than it ever did untrained.',
  insight:
    'The insight, not the experiment: one crammed session strengthens synapses you already have and fades within hours. The same training spaced out grows new connections — and that needs new protein. Two mechanisms sharing one synapse.',
};

const STATUS: Record<Mode, string> = {
  baseline: 'untrained',
  hab: 'habituating',
  sens: 'sensitized',
  insight: 'short vs long-term',
};

const TRAINING: Record<string, TrainingResult> = {
  massed: {
    h1: 78,
    h24: 12,
    newSynapses: 0,
    h1Word: 'still strong',
    h24Word: 'faded',
    connNote: 'No new connections. The synapse you already had just got temporarily stronger.',
    verdict:
      'Cramming strengthens existing synapses. It holds for an hour and is gone the next day — a short-term memory. Blocking protein synthesis changes nothing here, which is the control.',
  },
  'spaced-intact': {
    h1: 86,
    h24: 79,
    newSynapses: 3,
    h1Word: 'strong',
    h24Word: 'still strong',
    connNote: 'Three new connections grew (green). There is physically more synapse than there was.',
    verdict:
      'The same amount of training, spread out, grows new connections between the same two neurons. That is why it is still there a day later — a long-term memory.',
  },
  'spaced-blocked': {
    h1: 80,
    h24: 6,
    newSynapses: 0,
    h1Word: 'strong',
    h24Word: 'gone',
    connNote: 'No new connections. Growing them needs new protein, and there was none.',
    verdict:
      'Short-term memory intact, long-term memory absent. Two mechanisms sharing one synapse, not one mechanism lasting longer.',
  },
};

class AplysiaSim extends SimElement {
  private state: SimState = {
    mode: 'baseline',
    taps: 0,
    habTaps: 0,
    sens: 0,
    schedule: null,
    protein: 'intact',
    trained: false,
  };

  private relaxTimer = 0;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-run]', () => this.train());
    this.onClick('[data-sim-schedule]', el => this.pickSchedule(el.dataset.simSchedule as Schedule));
    this.onClick('[data-sim-protein]', el => this.pickProtein(el.dataset.simProtein as Protein));
    this.buildControls();
  }

  /* ── model ── */

  private amp(): number {
    const habituated = Math.max(0.16, Math.exp(-0.27 * this.state.habTaps));
    return Math.min(MAX_AMP, habituated * (1 + 1.9 * this.state.sens));
  }

  private quanta(a = this.amp()): number {
    return Math.round(2 + a * 13);
  }

  private setMode(mode: Mode): void {
    this.state.mode = mode;
    // Each mode starts its own story from rest.
    this.state.taps = 0;
    this.state.habTaps = 0;
    this.state.sens = 0;
    this.state.trained = false;
    this.buildControls();
    this.render();
    this.report(`mode-${mode}`);
  }

  /** Baseline / habituation: a gentle touch. */
  private touch(): void {
    if (this.state.mode === 'hab') this.state.habTaps += 1;
    this.state.taps += 1;
    const a = this.amp();
    this.fireNts(clamp(Math.round(this.quanta(a) / 3), 1, 8));
    this.withdraw(clamp(a / MAX_AMP, 0, 1));
    this.render();
    this.report(this.state.mode === 'hab' && this.state.habTaps >= 5 ? 'habituated' : 'touched');
  }

  /** Sensitization: shock the tail, which sprays serotonin, then re-test. */
  private shock(): void {
    this.state.sens = Math.min(0.3, this.state.sens + 0.1);
    this.state.taps += 1;
    this.fireSero();
    const a = this.amp();
    this.delay(prefersReducedMotion() ? 0 : 320, () => {
      this.fireNts(clamp(Math.round(this.quanta(a) / 3), 1, 8));
      this.withdraw(clamp(a / MAX_AMP, 0, 1));
    });
    this.render();
    this.report('sensitized');
  }

  private resetSlug(): void {
    this.state.taps = 0;
    this.state.habTaps = 0;
    this.state.sens = 0;
    this.render();
    this.report('reset');
  }

  private pickSchedule(schedule: Schedule): void {
    this.state.schedule = schedule;
    this.state.trained = false;
    this.render();
  }

  private pickProtein(protein: Protein): void {
    this.state.protein = protein;
    this.state.trained = false;
    this.render();
  }

  private train(): void {
    if (!this.state.schedule) return;
    this.state.trained = true;
    this.render();
    this.report(`trained-${this.state.schedule}-${this.state.protein}`);
  }

  private result(): TrainingResult | null {
    const { schedule, protein } = this.state;
    if (!schedule) return null;
    // Protein synthesis only matters for spaced training — that is the control.
    return schedule === 'massed' ? TRAINING.massed : TRAINING[`spaced-${protein}`];
  }

  private report(name: string): void {
    this.emit(name, { ...this.state });
  }

  /* ── the moving picture ── */

  private withdraw(depth: number): void {
    const gill = this.q('[data-sim-gill]');
    if (!gill) return;
    const px = Math.round(depth * 30);
    if (prefersReducedMotion()) {
      gill.setAttribute('transform', `translate(-${px} 0)`);
      return;
    }
    gill.setAttribute('transform', `translate(-${px} 0)`);
    this.cancel(this.relaxTimer);
    this.relaxTimer = this.delay(900, () => gill.setAttribute('transform', 'translate(0 0)'));
  }

  private fireNts(count: number): void {
    const nts = this.qa('[data-sim-nts] .apl-nt');
    nts.forEach((n, i) => {
      n.classList.remove('is-fire');
      if (i < count) {
        // Reflow so the animation restarts even on a rapid second press.
        void n.getBoundingClientRect();
        this.delay(prefersReducedMotion() ? 0 : i * 30, () => n.classList.add('is-fire'));
      }
    });
  }

  private fireSero(): void {
    const glyph = this.q('[data-sim-shockglyph]');
    if (glyph) {
      glyph.classList.remove('go');
      void glyph.getBoundingClientRect();
      glyph.classList.add('go');
    }
    this.qa('[data-sim-sero] .apl-sero').forEach((s, i) => {
      s.classList.remove('is-fire');
      void s.getBoundingClientRect();
      this.delay(prefersReducedMotion() ? 0 : i * 70, () => s.classList.add('is-fire'));
    });
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.state.mode === 'insight') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (this.state.mode === 'baseline') {
      this.addBtn(bar, 'Touch the siphon', 'sim-btn-primary', () => this.touch());
    } else if (this.state.mode === 'hab') {
      this.addBtn(bar, 'Gentle touch', 'sim-btn-primary', () => this.touch());
      this.addBtn(bar, 'Reset slug', 'sim-btn-quiet', () => this.resetSlug());
    } else {
      this.addBtn(bar, 'Shock the tail', 'sim-btn-outline', () => this.shock());
      this.addBtn(bar, 'Reset slug', 'sim-btn-quiet', () => this.resetSlug());
    }
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
    const { mode } = this.state;

    /* mode chrome */
    this.pressed('[data-sim-mode]', 'simMode', mode);
    this.text('[data-sim-lead]', LEAD[mode]);
    this.text('[data-sim-status]', STATUS[mode]);

    const isInsight = mode === 'insight';
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }

    /* the synapse cross-section */
    const a = this.amp();
    const q = this.quanta(a);
    const releasePct = Math.round((q / 15) * 100);
    const gillResp = clamp(Math.round(a * 64), 6, 100);

    // The interneuron is an SVG <g>: toggle a class (not the `hidden`
    // attribute, which Astro's SVG types reject at check time).
    const inter = this.q('[data-sim-inter]');
    if (inter) inter.classList.toggle('is-visible', mode === 'sens');
    this.paintVesicles(q);
    this.css('[data-sim-respbar]', 'width', `${Math.round((gillResp / 100) * 210)}px`);

    this.text('[data-sim-mStimuli]', String(this.state.taps));
    this.text('[data-sim-mRelease]', `${releasePct}%`);
    this.text('[data-sim-mResp]', `${gillResp}%`);
  }

  private paintVesicles(q: number): void {
    const full = clamp(Math.round((q / 15) * VESICLES), 1, VESICLES);
    this.qa('[data-sim-vesicles] .apl-vesicle').forEach((v, i) => {
      v.style.opacity = i < full ? '1' : '0.14';
    });
  }

  private renderInsight(): void {
    this.pressed('[data-sim-schedule]', 'simSchedule', this.state.schedule);
    this.pressed('[data-sim-protein]', 'simProtein', this.state.protein);

    const run = this.q<HTMLButtonElement>('[data-sim-run]');
    if (run) {
      run.disabled = !this.state.schedule;
      run.textContent = this.state.schedule
        ? `▶ run 4 ${this.state.schedule} sessions`
        : 'pick a schedule first';
    }

    const results = this.q('[data-sim-results]');
    if (!results) return;
    const r = this.result();
    if (!r || !this.state.trained) {
      results.hidden = true;
      return;
    }
    results.hidden = false;

    this.css('[data-sim-h1]', 'width', `${r.h1}%`);
    this.css('[data-sim-h24]', 'width', `${r.h24}%`);
    this.css('[data-sim-h24]', 'background', r.h24 > 40 ? 'var(--sim-kept)' : 'var(--sim-lost)');
    this.text('[data-sim-h1-word]', `${r.h1}% — ${r.h1Word}`);
    this.text('[data-sim-h24-word]', `${r.h24}% — ${r.h24Word}`);
    this.text('[data-sim-conn-note]', r.connNote);
    this.text('[data-sim-verdict]', r.verdict);
    this.html(
      '[data-sim-conn]',
      '<i style="height:34px"></i>' +
        Array.from({ length: r.newSynapses }, (_, i) => `<i class="is-new" style="height:${18 + i * 5}px"></i>`).join(''),
    );
  }
}

defineSim('aplysia-sim', AplysiaSim);
