/**
 * <homunculus-sim> — the postcentral strip as a guided instrument.
 *
 * The markup is server-rendered by HomunculusSim.astro; this class attaches to
 * it and drives the readouts. Rather than one free-play map, the panel is a
 * guided path: two mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Stimulate the strip — the experiment. The strip is a row of buttons, each
 *     segment as wide as the cortex that part actually occupies, so clicks land
 *     on lips and thumb far more often than trunk. Every stimulation returns
 *     the sentence a conscious patient said, not a part name, because that is
 *     how the map was labelled.
 *   The distortion — the insight. The same parts drawn twice, once by cortex
 *     and once by skin, so the reader sees a part balloon on the strip and
 *     vanish on the body. Space is bought with sensitivity, not size.
 *
 * The strip segmentation and every share come from src/data/homunculus.ts, so
 * the bars and the numbers can never drift apart.
 */

import { SimElement, defineSim } from './base';
import { PARTS, bodyShare, cortexShare, getPart, magnification } from '../../data/homunculus';
import type { BodyPart } from '../../data/homunculus';

type Mode = 'stimulate' | 'insight';

const LEAD: Record<Mode, string> = {
  stimulate:
    'Put a current on a point of the strip in an awake patient. They report a sensation in one body part. Do it point by point and an orderly body map appears along the strip.',
  insight:
    'Same body, two maps. On the cortex the hand, lips and tongue swallow the strip; on the skin they are slivers. Territory is bought with sensitivity, not size — the brain spends its surface where the information is.',
};

class HomunculusSim extends SimElement {
  private mode: Mode = 'stimulate';
  /** The point being stimulated in the experiment. */
  private current: BodyPart | null = null;
  /** Every part stimulated so far, in order, without repeats. */
  private found: string[] = [];
  /** The part being weighed in the insight view. */
  private weighed: BodyPart | null = null;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-part]', el => this.stimulate(el.dataset.part as string));
    this.onClick('[data-ins-part]', el => this.weigh(el.dataset.insPart as string));
    this.buildControls();
  }

  /* ── modes ── */

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.setAttribute('data-mode', mode);
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
  }

  /* ── the experiment ── */

  private stimulate(key: string): void {
    const part = getPart(key);
    if (!part) return;
    this.current = part;
    if (!this.found.includes(key)) this.found = [...this.found, key];
    this.pulse('[data-sim-figure]', 'is-lit', 520);
    this.render();
    this.emit('stimulated', { part: key, magnification: magnification(part) });
  }

  /** Walk the whole strip, which is how the map got built in the first place. */
  private survey(): void {
    this.found = PARTS.map(p => p.key);
    this.current = getPart('lips') ?? null;
    this.render();
    this.emit('surveyed', { parts: this.found.length });
  }

  private reset(): void {
    this.current = null;
    this.found = [];
    this.render();
    this.emit('reset');
  }

  /* ── the insight ── */

  private weigh(key: string): void {
    const part = getPart(key);
    if (!part) return;
    this.weighed = this.weighed?.key === key ? null : part;
    this.render();
    this.emit('weighed', { part: key, magnification: magnification(part) });
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
    this.addBtn(bar, 'Walk the whole strip', 'sim-btn-primary', () => this.survey());
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
    const mode = this.mode;

    this.pressed('[data-sim-mode]', 'simMode', mode);
    this.text('[data-sim-lead]', LEAD[mode]);

    const isInsight = mode === 'insight';
    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }
    this.renderExperiment();
  }

  private renderExperiment(): void {
    const part = this.current;

    this.text('[data-sim-status]', part ? `stimulating ${part.name}` : 'strip exposed');
    this.text('[data-sim-found]', `${this.found.length} of ${PARTS.length}`);

    // The strip and the figure: exactly one segment and one region lit. Only
    // the strip is focusable — the figure is what the strip is saying.
    this.qa('[data-part], [data-region]').forEach(el =>
      el.classList.toggle('is-on', (el.dataset.part ?? el.dataset.region) === part?.key),
    );
    this.qa('[data-mapped]').forEach(el =>
      el.classList.toggle('is-mapped', this.found.includes(el.dataset.mapped as string)),
    );

    this.text(
      '[data-sim-report]',
      part
        ? `“${part.report}”`
        : 'Touch a point on the strip and the patient will tell you where they felt it.',
    );
    this.show('[data-sim-compare]', Boolean(part));

    if (part) {
      const cortex = cortexShare(part) * 100;
      const body = bodyShare(part) * 100;
      this.text('[data-sim-part-name]', part.name);
      this.text('[data-sim-cortex]', `${cortex.toFixed(1)}%`);
      this.text('[data-sim-body]', `${body.toFixed(1)}%`);
      // Both bars are scaled against the largest share in either column, so a
      // part with a fifth of the strip and a fiftieth of the skin looks it.
      this.css('[data-sim-cortex-bar]', 'width', `${(cortex / 22) * 100}%`);
      this.css('[data-sim-body-bar]', 'width', `${(body / 35) * 100}%`);
    }
  }

  private renderInsight(): void {
    const part = this.weighed;
    this.text('[data-sim-status]', part ? `weighing ${part.name}` : 'the distortion');

    // Light the same part in both mirrored strips, so a segment fat on cortex
    // and thin on skin is visibly the one part.
    this.qa('[data-ins-part]').forEach(el =>
      el.classList.toggle('is-on', el.dataset.insPart === part?.key),
    );

    this.text('[data-sim-ins-verdict]', this.insightVerdict());
  }

  private insightVerdict(): string {
    const part = this.weighed;
    if (!part)
      return 'The hand, lips and tongue take more of the strip than the trunk and both legs together. Cortical territory scales with sensitivity — with how finely a part can tell two touches apart — not with its size. The brain spends its surface where the information is. Tap either strip to weigh one part.';

    const cortex = cortexShare(part) * 100;
    const body = bodyShare(part) * 100;
    const m = magnification(part);
    // Half these names are plural; phrase around the name, not through it.
    const named = part.name[0].toUpperCase() + part.name.slice(1);

    if (m >= 1.8)
      return `${named}: ${cortex.toFixed(1)}% of the strip for just ${body.toFixed(
        1,
      )}% of the skin — about ${m.toFixed(
        0,
      )} times the cortex per square centimetre its size alone would buy. Sensitivity, not size, won it that space.`;

    if (m <= 0.6)
      return `${named}: ${body.toFixed(1)}% of the skin but only ${cortex.toFixed(
        1,
      )}% of the strip — a large stretch of body on a sliver of cortex, and somewhere you would struggle to place a touch with your eyes closed. The two go together.`;

    return `${named}: ${cortex.toFixed(1)}% of the strip for ${body.toFixed(
      1,
    )}% of the skin — roughly the cortex its size alone would predict. The distortion is in the parts that do not match.`;
  }
}

defineSim('homunculus-sim', HomunculusSim);
