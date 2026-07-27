/**
 * <aplysia-sim> — the gill-withdrawal reflex as an instrument.
 *
 * The markup is server-rendered by AplysiaSim.astro; this class attaches to it
 * and drives the readouts. Panels are chosen server-side via the `show` prop,
 * so a page that only wants the animal ships only the animal.
 *
 * Behaviour model (from the handoff):
 *   a      = min(1.55, max(0.16, e^(-0.27·habTaps)) · (1 + 1.9·sensitization))
 *   tap    → log a trial, habTaps + 1, sensitization × 0.78
 *   shock  → sensitization = 1, habituation partly cleared, log a shock
 *   rest   → habituation and sensitization back to zero
 *   quanta = round(2 + a·13); transmitter vesicles follow quanta
 */

import { SimElement, clamp, defineSim } from './base';

type TrialKind = 'base' | 'sens' | 'shock' | 'rest';
type Schedule = 'massed' | 'spaced';
type Protein = 'intact' | 'blocked';

interface Trial {
  kind: TrialKind;
  a: number;
}

interface SimState {
  habTaps: number;
  sensitization: number;
  trials: Trial[];
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
const MAX_TRIALS = 40;

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
    connNote: 'Three new connections grew (amber). There is physically more synapse than there was.',
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
    habTaps: 0,
    sensitization: 0,
    trials: [],
    schedule: null,
    protein: 'intact',
    trained: false,
  };

  private relaxTimer = 0;
  /** How far the gill is pulled in right now, 0–1. Relaxes back after a tap. */
  private retraction = 0;
  /** Amplitude of the withdrawal just delivered; null until one is. */
  private lastResponse: number | null = null;

  protected setup(): void {
    this.onClick('[data-sim-tap]', () => this.tap());
    this.onClick('[data-sim-shock]', () => this.shock());
    this.onClick('[data-sim-rest]', () => this.rest());
    this.onClick('[data-sim-run]', () => this.train());
    this.onClick('[data-sim-schedule]', el => this.pickSchedule(el.dataset.simSchedule as Schedule));
    this.onClick('[data-sim-protein]', el => this.pickProtein(el.dataset.simProtein as Protein));
  }

  /* ── model ── */

  private amp(): number {
    const habituated = Math.max(0.16, Math.exp(-0.27 * this.state.habTaps));
    return Math.min(MAX_AMP, habituated * (1 + 1.9 * this.state.sensitization));
  }

  private quanta(a = this.amp()): number {
    return Math.round(2 + a * 13);
  }

  private log(kind: TrialKind, a: number): void {
    this.state.trials = [...this.state.trials, { kind, a }].slice(-MAX_TRIALS);
  }

  private tap(): void {
    const a = this.amp();
    this.log(this.state.sensitization > 0.05 ? 'sens' : 'base', a);
    this.state.habTaps += 1;
    this.state.sensitization *= 0.78;
    this.lastResponse = a;
    this.pulse('[data-sim-siphon]');
    this.withdraw(clamp(a / MAX_AMP, 0, 1));
    this.render();
    this.report(this.state.habTaps >= 6 ? 'habituated' : 'tapped');
  }

  /** Pull the gill in, then let it back out — one withdrawal. */
  private withdraw(depth: number): void {
    this.retraction = depth;
    this.paintGill();
    this.cancel(this.relaxTimer);
    this.relaxTimer = this.delay(900, () => {
      this.retraction = 0;
      this.paintGill();
    });
  }

  private paintGill(): void {
    const gill = this.q('[data-sim-gill]');
    if (!gill) return;
    const r = this.retraction;
    gill.style.transform = `translateX(-${Math.round(r * 42)}px) scaleX(${(1 - 0.55 * r).toFixed(3)})`;
  }

  private shock(): void {
    this.state.sensitization = 1;
    this.lastResponse = null;
    this.state.habTaps = Math.floor(this.state.habTaps / 2);
    this.log('shock', 0);
    this.render();
    this.report('shocked');
  }

  private rest(): void {
    this.state.habTaps = 0;
    this.state.sensitization = 0;
    this.retraction = 0;
    this.lastResponse = null;
    this.log('rest', 0);
    this.render();
    this.report('rested');
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
    this.emit(name, { ...this.state, trials: [...this.state.trials] });
  }

  /* ── view ── */

  protected render(): void {
    const { habTaps, sensitization, trials } = this.state;
    // What the readouts report: the withdrawal just delivered, or — before any
    // tap, and straight after a shock or a rest — the one now primed.
    const a = this.lastResponse ?? this.amp();

    /* chrome */
    this.text(
      '[data-sim-status]',
      sensitization > 0.05 ? 'sensitized' : habTaps > 0 ? `${habTaps} taps` : 'untrained',
    );

    /* the animal */
    this.paintGill();
    this.text('[data-sim-withdrawal]', `${Math.round(a * 100)}%`);
    this.text('[data-sim-animal-note]', this.animalNote());

    /* the synapse */
    const q = this.quanta(a);
    this.text('[data-sim-quanta]', String(q));
    this.text('[data-sim-synapse-note]', this.synapseNote(q));
    this.renderVesicles(q);

    /* the record */
    this.renderTrace(trials);
    this.text('[data-sim-trace-count]', trials.length === 1 ? '1 trial' : `${trials.length} trials`);

    /* training */
    this.pressed('[data-sim-schedule]', 'simSchedule', this.state.schedule);
    this.pressed('[data-sim-protein]', 'simProtein', this.state.protein);

    const run = this.q<HTMLButtonElement>('[data-sim-run]');
    if (run) {
      run.disabled = !this.state.schedule;
      run.textContent = this.state.schedule
        ? `▶ run 4 ${this.state.schedule} sessions`
        : 'pick a schedule first';
    }
    this.renderTraining();
  }

  private animalNote(): string {
    const { habTaps, sensitization } = this.state;
    if (sensitization > 0.05)
      return 'After a tail shock, the same touch makes the gill snap back harder than it ever did untrained.';
    if (habTaps === 0) return 'Touch the siphon and the gill pulls in. Do it a few times and watch what happens.';
    if (habTaps >= 4)
      return 'The pull-in keeps shrinking. The animal has learned this touch is harmless — habituation, not a tired muscle.';
    return 'Each touch makes the gill pull in a little less than the last.';
  }

  private synapseNote(q: number): string {
    if (q >= 15)
      return 'Each dot is transmitter crossing the gap. Plenty of signal — the gill pulls in hard.';
    if (q <= 6)
      return 'The sensory neuron still fires the same impulses; it just releases less per impulse. Less signal reaches the muscle.';
    return 'The behaviour and the synapse are the same event, measured twice.';
  }

  private renderVesicles(q: number): void {
    const cleft = this.q('[data-sim-cleft]');
    if (!cleft) return;
    const n = clamp(Math.round(q / 3), 1, 7);
    if (cleft.childElementCount === n) return;
    cleft.innerHTML = Array.from({ length: n }, (_, i) => {
      const left = 6 + i * (86 / n);
      return `<span class="apl-vesicle" style="left:${left.toFixed(1)}%;animation-delay:${(i * 0.12).toFixed(2)}s"></span>`;
    }).join('');
  }

  private renderTrace(trials: Trial[]): void {
    const trace = this.q('[data-sim-trace]');
    if (!trace) return;

    if (!trials.length) {
      trace.innerHTML = '<span class="sim-trace-empty">tap the siphon to begin →</span>';
      return;
    }

    trace.innerHTML = trials
      .map((t, i) => {
        if (t.kind === 'shock')
          return `<div class="sim-bar sim-bar-shock" style="height:100%" title="trial ${i + 1}: tail shock"></div>`;
        if (t.kind === 'rest')
          return `<div class="sim-bar sim-bar-rest" style="height:12%" title="trial ${i + 1}: rest"></div>`;
        const h = clamp(Math.round((t.a / MAX_AMP) * 100), 6, 100);
        const label = t.kind === 'sens' ? 'after tail shock' : 'untrained response';
        return `<div class="sim-bar sim-bar-${t.kind}" style="height:${h}%" title="trial ${i + 1}: ${label}, ${Math.round(t.a * 100)}%"></div>`;
      })
      .join('');
    trace.scrollLeft = trace.scrollWidth;
  }

  private renderTraining(): void {
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
