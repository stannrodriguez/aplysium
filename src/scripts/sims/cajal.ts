/**
 * <cajal-sim> — the Golgi stain, and the idea it settled.
 *
 * The markup is server-rendered by CajalSim.astro; this class attaches to it
 * and drives the readouts. Rather than one free-play instrument, the panel is a
 * guided path: three mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Stain    — the silver stain takes a sparse random subset, so one neuron
 *              shows up whole against blank tissue. Slide the density to see why
 *              the sparseness is the method.
 *   Trace    — follow a stained axon to its terminal, magnified: a free ending
 *              pressed against the next cell, never fused into it. Count them.
 *   The gap  — the insight, not the experiment. Because the terminal ends free
 *              there is a gap — the synapse. Contrast the neuron doctrine
 *              (separate cells, a gap) against the reticular theory (one fused
 *              net), and see what the gap makes possible: a direction, and a
 *              single junction that can be turned up or down.
 *
 * The tissue and every neuron in it are fixed — re-staining a section does not
 * move the cells, only which of them the stain takes. That is the recorded
 * behaviour, preserved.
 */

import { SimElement, clamp, defineSim, noise } from './base';

interface Cell {
  x: number;
  y: number;
}

type Mode = 'stain' | 'trace' | 'insight';
type Theory = 'doctrine' | 'reticular';

const W = 320;
const H = 178;
const COLS = 9;
const CELLS = 36;

/** The tissue itself — fixed, because re-staining a section does not move the
 *  cells in it. Only which cells the stain takes changes. */
const FIELD: Cell[] = Array.from({ length: CELLS }, (_, i) => ({
  x: 20 + (i % COLS) * 34 + noise(i * 3 + 1) * 16,
  y: 22 + Math.floor(i / COLS) * 40 + noise(i * 7 + 2) * 18,
}));

const nearest = (i: number): number => {
  let best = -1;
  let bestD = Infinity;
  FIELD.forEach((c, j) => {
    if (j === i) return;
    const d = (c.x - FIELD[i].x) ** 2 + (c.y - FIELD[i].y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  return best;
};

/** Precomputed so the axon of a given cell always runs to the same neighbour. */
const NEIGHBOUR = FIELD.map((_, i) => nearest(i));

const STATUS: Record<Mode, string> = {
  stain: 'the section',
  trace: 'tracing terminals',
  insight: 'the gap',
};

const LEAD: Record<Mode, string> = {
  stain:
    'Golgi’s silver stain takes a sparse, random few cells and draws each one whole — soma, dendrites and axon — against blank tissue. Stain a section and a single neuron stands out entire, with nothing overlapping to confuse the picture.',
  trace:
    'Follow a stained axon to where it ends. Every terminal stops short of the next cell — a free ending pressed against it, never fused into it. Trace as many as you like; not one of them turns out continuous.',
  insight:
    'Because the terminal ends free, there is a gap between the two cells — the synapse. That gap is the whole point: signal has to be handed across it, which gives transmission a direction and a place that can be turned up or down.',
};

const THEORY_LEAD: Record<Theory, string> = {
  doctrine:
    'Neuron doctrine: two separate cells with a gap between them. Signal is handed across the gap in one direction — dendrite to soma to axon — and this single junction can be turned up or down.',
  reticular:
    'Reticular theory: one continuous web, cell fused into cell. Current would spread through the mesh with no direction and no single junction — the account those free terminals ruled out.',
};

class CajalSim extends SimElement {
  private mode: Mode = 'stain';
  /** Which section is on the slide. Re-staining takes a fresh one. */
  private section = 0;
  /** How many cells the stain takes, 2–8. */
  private density = 4;
  /** Index into FIELD of the terminal being magnified, or null. */
  private picked: number | null = null;
  /** Every terminal the reader has traced to its end, across all sections. */
  private examined = new Set<string>();

  /** Insight mode: which theory is drawn, and how strong the one synapse is. */
  private theory: Theory = 'doctrine';
  private weight = 55;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-theory]', el => this.pickTheory(el.dataset.simTheory as Theory));

    this.on('[data-sim-density]', 'input', el => {
      this.density = Number((el as HTMLInputElement).value);
      this.picked = null;
      this.render();
    });
    this.on('[data-sim-weight]', 'input', el => {
      this.weight = Number((el as HTMLInputElement).value);
      this.render();
    });

    // The terminals are drawn at runtime, so the listener sits on the section.
    this.q('[data-sim-section]')?.addEventListener('click', event => {
      const target = (event.target as Element).closest('[data-cell]');
      if (target) this.examine(Number((target as HTMLElement).dataset.cell));
    });

    this.buildControls();
  }

  /* ── model ── */

  /** Which cells this section's stain took: the `density` lowest-noise cells. */
  private stained(): number[] {
    return FIELD.map((_, i) => i)
      .sort((a, b) => noise(a * 11 + this.section * 97) - noise(b * 11 + this.section * 97))
      .slice(0, this.density)
      .sort((a, b) => a - b);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`, { mode });
  }

  private restain(): void {
    this.section += 1;
    this.picked = null;
    this.render();
    this.emit('restained', { section: this.section, density: this.density });
  }

  /** Trace the next un-examined stained terminal (or a specific one when the
   *  reader clicks it directly). Clicking from stain mode drops into trace. */
  private examine(cell: number): void {
    if (this.mode === 'stain') {
      this.mode = 'trace';
      this.buildControls();
    }
    this.picked = cell;
    this.examined.add(`${this.section}:${cell}`);
    this.render();
    this.emit('examined', { contacts: this.examined.size, continuous: 0 });
  }

  /** The action-bar primary in trace mode: pick the next terminal for the reader. */
  private traceNext(): void {
    const stained = this.stained();
    const next =
      stained.find(i => !this.examined.has(`${this.section}:${i}`)) ??
      (this.picked === null ? stained[0] : stained[(stained.indexOf(this.picked) + 1) % stained.length]);
    if (next === undefined) return;
    this.examine(next);
  }

  private resetCount(): void {
    this.examined.clear();
    this.picked = null;
    this.render();
    this.emit('reset-count');
  }

  private reset(): void {
    this.mode = 'stain';
    this.section = 0;
    this.density = 4;
    this.picked = null;
    this.theory = 'doctrine';
    this.weight = 55;
    this.examined.clear();
    const slider = this.q<HTMLInputElement>('[data-sim-density]');
    if (slider) slider.value = '4';
    const wslider = this.q<HTMLInputElement>('[data-sim-weight]');
    if (wslider) wslider.value = '55';
    this.buildControls();
    this.render();
    this.emit('reset');
  }

  private pickTheory(theory: Theory): void {
    this.theory = theory;
    this.render();
    this.emit(`theory-${theory}`, { theory });
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'insight') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (this.mode === 'stain') {
      this.addBtn(bar, 'Stain a fresh section', 'sim-btn-primary', () => this.restain());
      this.addBtn(bar, 'Reset', 'sim-btn-quiet', () => this.reset());
    } else {
      this.addBtn(bar, 'Trace a terminal', 'sim-btn-primary', () => this.traceNext());
      this.addBtn(bar, 'Reset count', 'sim-btn-quiet', () => this.resetCount());
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
    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.setAttribute('data-mode', this.mode);

    const isInsight = this.mode === 'insight';
    const isTrace = this.mode === 'trace';

    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.text('[data-sim-status]', STATUS.insight);
      this.renderInsight();
      return;
    }

    const stained = this.stained();
    this.text('[data-sim-status]', `section ${this.section + 1} · ${stained.length} cells stained`);
    this.text('[data-sim-stained]', `${stained.length} of ${CELLS}`);
    this.text('[data-sim-density-value]', `${stained.length} of ${CELLS}`);
    this.html('[data-sim-section]', this.sectionSvg(stained));

    // The density field belongs to the stain beat; the trace block to trace.
    this.show('[data-sim-density-field]', !isTrace);
    this.show('[data-sim-trace]', isTrace);

    this.text('[data-sim-lead]', this.lead());

    if (isTrace) {
      this.show('[data-sim-zoom-empty]', this.picked === null);
      this.html('[data-sim-zoom]', this.picked === null ? '' : this.zoomSvg());
      this.text('[data-sim-examined]', String(this.examined.size));
      this.text('[data-sim-continuous]', '0');
      this.text('[data-sim-verdict]', this.verdict());
    }
  }

  private lead(): string {
    if (this.mode === 'trace' && this.picked !== null) {
      return 'The magnified terminal stops short of the next cell — a free ending, a gap you could measure. Not one process running into the next.';
    }
    if (this.mode === 'insight') return THEORY_LEAD[this.theory];
    return LEAD[this.mode];
  }

  private sectionSvg(stained: number[]): string {
    const ghosts = FIELD.map(
      (c, i) =>
        `<circle class="caj-ghost" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${stained.includes(i) ? 0 : 4.2}"/>`,
    ).join('');

    const drawn = stained
      .map(i => {
        const c = FIELD[i];
        const n = FIELD[NEIGHBOUR[i]];
        const dx = n.x - c.x;
        const dy = n.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        // The axon stops short of the neighbour: the terminal is where the
        // question actually lives.
        const tx = c.x + (dx / len) * (len - 13);
        const ty = c.y + (dy / len) * (len - 13);
        const mx = (c.x + tx) / 2 + (dy / len) * 9;
        const my = (c.y + ty) / 2 - (dx / len) * 9;

        // Dendrites: evenly spread around the soma, each with a small kink so
        // the tree reads as drawn rather than as a starburst.
        const dendrites = Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2 + noise(i * 5 + k) * 0.5;
          const r = 12 + noise(i * 13 + k) * 9;
          const bend = (noise(i * 17 + k) - 0.5) * 7;
          const cx = c.x + Math.cos(a) * r * 0.55 - Math.sin(a) * bend;
          const cy = c.y + Math.sin(a) * r * 0.55 + Math.cos(a) * bend;
          const bx = c.x + Math.cos(a) * r;
          const by = c.y + Math.sin(a) * r;
          return `<path class="caj-process" d="M${c.x.toFixed(1)} ${c.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
        }).join('');

        const traced = this.examined.has(`${this.section}:${i}`) ? ' is-traced' : '';
        const picked = this.picked === i ? ' is-picked' : '';
        const hint = this.mode === 'trace' ? 'trace this axon to its terminal' : 'a free ending';
        return (
          dendrites +
          `<path class="caj-process caj-axon" d="M${c.x.toFixed(1)} ${c.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}"/>` +
          `<circle class="caj-soma" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5.4"/>` +
          `<circle class="caj-contact${traced}${picked}" data-cell="${i}" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="5">` +
          `<title>${hint}</title></circle>`
        );
      })
      .join('');

    const label =
      this.mode === 'trace'
        ? `A section of tissue, ${stained.length} of ${CELLS} cells stained whole. Each stained axon ends in a marked terminal you can trace.`
        : `A section of tissue. ${stained.length} of ${CELLS} cells are stained whole against blank ground; the rest are unstained.`;
    return `<svg class="caj-section" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${ghosts}${drawn}</svg>`;
  }

  private zoomSvg(): string {
    // Terminal from the left, dendrite from the right — a free ending against
    // the next cell, with the gap between them marked.
    const termEnd = 150;
    const dendStart = 176;
    return (
      `<svg class="caj-zoom-svg" viewBox="0 0 320 116" role="img" aria-label="The magnified terminal: the axon stops short of the next cell, leaving a gap between them.">` +
      `<path class="caj-term" d="M14 50 H110 Q${termEnd} 44 ${termEnd} 58 Q${termEnd} 72 110 66 H14 Z"/>` +
      `<path class="caj-dend" d="M306 34 H${dendStart} Q${dendStart - 16} 58 ${dendStart} 82 H306 Z"/>` +
      `<line class="caj-gap-line" x1="${termEnd}" y1="30" x2="${termEnd}" y2="86"/>` +
      `<line class="caj-gap-line" x1="${dendStart}" y1="30" x2="${dendStart}" y2="86"/>` +
      `<text class="caj-zoom-label" x="163" y="24" text-anchor="middle">GAP</text>` +
      `<text class="caj-zoom-label" x="16" y="100">AXON TERMINAL</text>` +
      `<text class="caj-zoom-label" x="304" y="100" text-anchor="end">NEXT CELL</text>` +
      `</svg>`
    );
  }

  private verdict(): string {
    const n = this.examined.size;
    if (n === 0) return 'Trace an axon to its terminal to start the count.';
    if (n < 4)
      return `${n} terminal${n === 1 ? '' : 's'} traced, ${n === 1 ? 'none' : 'none of them'} continuous with the next cell. Keep going — a negative result is only worth something once there are enough of them.`;
    return `${n} terminals traced across ${this.section + 1} section${this.section ? 's' : ''}, not one of them continuous. Cajal drew hundreds of these and never found the exception the reticular theory needed: a single place where one cell ran into the next without a break.`;
  }

  /* ── insight: the gap, and what it makes possible ── */

  private renderInsight(): void {
    this.pressed('[data-sim-theory]', 'simTheory', this.theory);
    this.text('[data-sim-lead]', THEORY_LEAD[this.theory]);

    // The weight knob only means something when there is a junction to turn.
    const wField = this.q('[data-sim-weight-field]');
    const wInput = this.q<HTMLInputElement>('[data-sim-weight]');
    const reticular = this.theory === 'reticular';
    if (wField) wField.classList.toggle('is-off', reticular);
    if (wInput) wInput.disabled = reticular;
    this.text('[data-sim-weight-value]', reticular ? '—' : `${this.weight}%`);

    this.html('[data-sim-insight-svg]', this.insightSvg());
    this.text('[data-sim-insight-verdict]', this.insightVerdict());
  }

  private insightVerdict(): string {
    if (this.theory === 'reticular') {
      return 'If it were one fused net, current would just spread through it — no direction, no single junction, nothing to strengthen or weaken. There would be no unit to record from, and nowhere for a memory to live. Cajal’s free terminals are what rule this out.';
    }
    const strong = this.weight >= 66;
    const weak = this.weight <= 33;
    const state = strong
      ? 'Turned up, this connection carries the signal strongly'
      : weak
        ? 'Turned down, this connection barely carries the signal'
        : 'Set mid-way, this connection carries the signal in part';
    return `Because the terminal ends free, there is a gap — the synapse. Signal is handed across it, so transmission runs one way, dendrite to soma to axon. ${state}, and it can be changed on its own without touching any other. A single junction that can be turned up or down is what makes learning possible.`;
  }

  private insightSvg(): string {
    if (this.theory === 'reticular') {
      // One continuous mesh: somas joined by fibres with no break, no arrows.
      const knots = [
        [70, 60],
        [150, 48],
        [230, 66],
        [110, 110],
        [200, 118],
        [260, 96],
      ];
      const somas = knots
        .map(([x, y]) => `<circle class="caj-in-soma" cx="${x}" cy="${y}" r="8"/>`)
        .join('');
      const links = [
        [0, 1],
        [1, 2],
        [0, 3],
        [3, 4],
        [4, 2],
        [1, 4],
        [3, 1],
        [4, 5],
        [2, 5],
      ]
        .map(([a, b]) => {
          const [x1, y1] = knots[a];
          const [x2, y2] = knots[b];
          const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
          const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
          return `<path class="caj-in-mesh" d="M${x1} ${y1} Q${mx.toFixed(0)} ${my.toFixed(0)} ${x2} ${y2}"/>`;
        })
        .join('');
      return (
        `<svg class="caj-insight-svg" viewBox="0 0 320 178" role="img" aria-label="Reticular theory: cell bodies fused into one continuous mesh, with no gaps and no direction of flow.">` +
        links +
        somas +
        `<text class="caj-in-title" x="160" y="152" text-anchor="middle">ONE CONTINUOUS NET</text>` +
        `<text class="caj-in-sub" x="160" y="168" text-anchor="middle">no gap · no direction · nothing to change</text>` +
        `</svg>`
      );
    }

    // Neuron doctrine: two cells, a gap, a one-way handoff whose strength is the
    // weight. Transmitter dots crossing the gap scale with the weight.
    const gapL = 158;
    const gapR = 182;
    const frac = clamp(this.weight / 100, 0, 1);
    const dots = 6;
    const crossing = Math.round(frac * dots);
    const nts = Array.from({ length: dots }, (_, k) => {
      const on = k < crossing;
      const cx = gapL + ((gapR - gapL) * (k + 0.5)) / dots;
      const cy = 74 + (noise(k * 9 + 3) - 0.5) * 22;
      return `<circle class="caj-in-nt${on ? ' is-on' : ''}" style="animation-delay:${k * 90}ms" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4"/>`;
    }).join('');

    // Terminal glow tracks the weight so the junction visibly turns up or down.
    const glow = (0.25 + frac * 0.75).toFixed(2);

    return (
      `<svg class="caj-insight-svg" viewBox="0 0 320 178" role="img" aria-label="Neuron doctrine: a sending cell whose axon ends in a free terminal, a gap, and a receiving cell. The gap is the synapse; the one-way arrow shows signal handed across it, ${this.weight} percent strength.">` +
      // sending cell
      `<circle class="caj-in-soma" cx="34" cy="74" r="11"/>` +
      `<path class="caj-in-axon" d="M45 74 H${gapL}"/>` +
      `<path class="caj-in-term" style="opacity:${glow}" d="M${gapL - 20} 62 H${gapL} Q${gapL + 6} 74 ${gapL} 86 H${gapL - 20} Z"/>` +
      // receiving cell
      `<path class="caj-in-dend" d="M${gapR} 60 Q${gapR + 14} 74 ${gapR} 88"/>` +
      `<path class="caj-in-dend2" d="M${gapR + 30} 74 H288"/>` +
      `<circle class="caj-in-soma" cx="300" cy="74" r="11"/>` +
      // the gap, marked
      `<line class="caj-gap-line" x1="${gapL}" y1="44" x2="${gapL}" y2="104"/>` +
      `<line class="caj-gap-line" x1="${gapR}" y1="44" x2="${gapR}" y2="104"/>` +
      nts +
      // one-way arrow across the gap
      `<path class="caj-in-arrow" d="M${gapL + 2} 118 H${gapR - 8}"/>` +
      `<path class="caj-in-arrow" d="M${gapR - 12} 114 l6 4 l-6 4"/>` +
      `<text class="caj-in-title" x="${(gapL + gapR) / 2}" y="38" text-anchor="middle">SYNAPSE</text>` +
      `<text class="caj-zoom-label" x="34" y="102" text-anchor="middle">SENDS</text>` +
      `<text class="caj-zoom-label" x="300" y="102" text-anchor="middle">RECEIVES</text>` +
      `<text class="caj-in-sub" x="160" y="140" text-anchor="middle">signal handed one way across the gap</text>` +
      `</svg>`
    );
  }
}

defineSim('cajal-sim', CajalSim);
