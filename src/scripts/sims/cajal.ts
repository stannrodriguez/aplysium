/**
 * <cajal-sim> — the Golgi stain, and the question it settled.
 *
 * Two things are being shown at once. The section shows why the stain worked
 * at all: it takes a sparse random few cells and leaves the rest blank, so one
 * neuron can be traced whole. The magnified contact shows what Cajal found
 * every time he traced one to its end — a free terminal against another cell,
 * never continuous with it.
 *
 * The reticular toggle draws the rival hypothesis over the same contact, which
 * is the only way to see that the two predictions differ at all.
 */

import { SimElement, defineSim, noise } from './base';

interface Cell {
  x: number;
  y: number;
}

type View = 'observed' | 'reticular';

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

class CajalSim extends SimElement {
  /** Which section is on the slide. Re-staining takes a fresh one. */
  private section = 0;
  /** How many cells the stain takes, 2–8. */
  private density = 4;
  /** Index into FIELD of the contact being magnified, or null. */
  private picked: number | null = null;
  private view: View = 'observed';
  /** Every contact the reader has traced to its end, across all sections. */
  private examined = new Set<string>();

  protected setup(): void {
    this.onClick('[data-sim-restain]', () => this.restain());
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-view]', el => {
      this.view = el.dataset.simView as View;
      this.render();
    });
    this.on('[data-sim-density]', 'input', el => {
      this.density = Number((el as HTMLInputElement).value);
      this.picked = null;
      this.render();
    });
    // The contacts are drawn at runtime, so the listener sits on the section.
    this.q('[data-sim-section]')?.addEventListener('click', event => {
      const target = (event.target as Element).closest('[data-cell]');
      if (target) this.examine(Number((target as HTMLElement).dataset.cell));
    });
  }

  /* ── model ── */

  /** Which cells this section's stain took: the `density` lowest-noise cells. */
  private stained(): number[] {
    return FIELD.map((_, i) => i)
      .sort((a, b) => noise(a * 11 + this.section * 97) - noise(b * 11 + this.section * 97))
      .slice(0, this.density)
      .sort((a, b) => a - b);
  }

  private restain(): void {
    this.section += 1;
    this.picked = null;
    this.render();
    this.emit('restained', { section: this.section, density: this.density });
  }

  private examine(cell: number): void {
    this.picked = cell;
    this.examined.add(`${this.section}:${cell}`);
    this.render();
    this.emit('examined', { contacts: this.examined.size, continuous: 0 });
  }

  private reset(): void {
    this.section = 0;
    this.density = 4;
    this.picked = null;
    this.view = 'observed';
    this.examined.clear();
    const slider = this.q<HTMLInputElement>('[data-sim-density]');
    if (slider) slider.value = '4';
    this.render();
    this.emit('reset');
  }

  /* ── view ── */

  protected render(): void {
    const stained = this.stained();

    this.text('[data-sim-status]', `section ${this.section + 1} · ${stained.length} cells stained`);
    this.text('[data-sim-stained]', `${stained.length} of ${CELLS}`);
    this.text('[data-sim-density-value]', `${stained.length} of ${CELLS}`);
    this.html('[data-sim-section]', this.sectionSvg(stained));
    this.text('[data-sim-section-note]', this.sectionNote(stained.length));

    this.pressed('[data-sim-view]', 'simView', this.view);
    this.show('[data-sim-zoom-empty]', this.picked === null);
    this.html('[data-sim-zoom]', this.picked === null ? '' : this.zoomSvg());
    this.text('[data-sim-zoom-note]', this.zoomNote());

    this.text('[data-sim-examined]', String(this.examined.size));
    this.text('[data-sim-continuous]', '0');
    this.text('[data-sim-verdict]', this.verdict());
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

        const picked = this.picked === i ? ' is-picked' : '';
        return (
          dendrites +
          `<path class="caj-process caj-axon" d="M${c.x.toFixed(1)} ${c.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}"/>` +
          `<circle class="caj-soma" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5.4"/>` +
          `<circle class="caj-contact${picked}" data-cell="${i}" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="5">` +
          `<title>trace this axon to its terminal</title></circle>`
        );
      })
      .join('');

    return `<svg class="caj-section" viewBox="0 0 ${W} ${H}" role="img" aria-label="A section of tissue. ${stained.length} of ${CELLS} cells are stained whole; the rest are blank. Each stained axon ends in a marked terminal you can examine.">${ghosts}${drawn}</svg>`;
  }

  private sectionNote(n: number): string {
    if (n <= 3)
      return 'A sparse stain is the useful one. With this few cells taken, every process you see belongs to a cell you can point at.';
    if (n >= 7)
      return 'Stain too many and the processes overlap. This is why the sparseness is the method, not a limitation of it.';
    return 'The stain takes a random few cells and leaves the rest blank, so a single neuron stands out entire — every branch of it traceable, with nothing overlapping to confuse the picture.';
  }

  private zoomSvg(): string {
    const gap = this.view === 'observed';
    // Terminal from the left, dendrite from the right. In the reticular
    // drawing they are one continuous tube; in the observed one they are not.
    const termEnd = gap ? 150 : 176;
    const dendStart = gap ? 176 : 150;

    const gapMark = gap
      ? `<line class="caj-gap-line" x1="${termEnd}" y1="30" x2="${termEnd}" y2="86"/>` +
        `<line class="caj-gap-line" x1="${dendStart}" y1="30" x2="${dendStart}" y2="86"/>` +
        `<text class="caj-zoom-label" x="163" y="24" text-anchor="middle">GAP</text>`
      : `<text class="caj-zoom-label" x="163" y="24" text-anchor="middle">CONTINUOUS</text>`;

    return (
      `<svg class="caj-zoom-svg" viewBox="0 0 320 116" role="img" aria-label="${
        gap
          ? 'The magnified contact: the axon terminal stops short of the next cell, leaving a gap.'
          : 'The reticular prediction drawn over the same contact: the two cells run into one another with no break.'
      }">` +
      `<path class="caj-term" d="M14 50 H110 Q${termEnd} 44 ${termEnd} 58 Q${termEnd} 72 110 66 H14 Z"/>` +
      `<path class="caj-dend" d="M306 34 H${dendStart} Q${dendStart - 16} 58 ${dendStart} 82 H306 Z"/>` +
      gapMark +
      `<text class="caj-zoom-label" x="16" y="100">AXON TERMINAL</text>` +
      `<text class="caj-zoom-label" x="304" y="100" text-anchor="end">NEXT CELL</text>` +
      `</svg>`
    );
  }

  private zoomNote(): string {
    if (this.picked === null)
      return 'Every stained axon ends somewhere. Follow one to its terminal and look at what happens there.';
    if (this.view === 'reticular')
      return 'This is the rival hypothesis, drawn over the same contact: one continuous web, cell running into cell. Cajal never once saw it.';
    return 'The terminal stops. It presses against the next cell without joining it — a free ending, which is what makes them separate cells.';
  }

  private verdict(): string {
    const n = this.examined.size;
    if (n === 0) return 'Trace an axon to its terminal to start the count.';
    if (n < 4)
      return `${n} terminal${n === 1 ? '' : 's'} traced, ${n === 1 ? 'none' : 'none of them'} continuous with the next cell. Keep going — a negative result is only worth something once there are enough of them.`;
    return `${n} terminals traced across ${this.section + 1} section${this.section ? 's' : ''}, not one of them continuous. Cajal drew hundreds of these and never found the exception the reticular theory needed: a single place where one cell ran into the next without a break.`;
  }
}

defineSim('cajal-sim', CajalSim);
