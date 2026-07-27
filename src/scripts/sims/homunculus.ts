/**
 * <homunculus-sim> — stimulating the postcentral strip, point by point.
 *
 * The strip is server-rendered with each part's segment sized by the cortex it
 * actually occupies, so the reader hits lips and thumb far more often than
 * trunk simply by clicking around. That is the finding, felt before it is
 * read: the map is scaled by sensitivity, not by size.
 *
 * Every label on the map came out of a sentence from a conscious patient, so
 * a stimulation here produces the sentence, not a part name.
 */

import { SimElement, defineSim } from './base';
import { PARTS, bodyShare, cortexShare, getPart, magnification } from '../../data/homunculus';
import type { BodyPart } from '../../data/homunculus';

class HomunculusSim extends SimElement {
  private current: BodyPart | null = null;
  /** Every part stimulated so far, in order, without repeats. */
  private found: string[] = [];

  protected setup(): void {
    this.onClick('[data-part]', el => this.stimulate(el.dataset.part as string));
    this.onClick('[data-sim-reset]', () => this.reset());
    this.onClick('[data-sim-survey]', () => this.survey());
  }

  /* ── model ── */

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

  /* ── view ── */

  protected render(): void {
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

    this.text('[data-sim-report]', part ? `“${part.report}”` : 'Touch a point on the strip and the patient will tell you where they felt it.');
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

    this.text('[data-sim-verdict]', this.verdict());
  }

  private verdict(): string {
    const part = this.current;
    if (!part)
      return 'The segments are sized by the cortex each part actually gets. Click around and see which ones you keep landing on.';

    const m = magnification(part);
    const trunk = getPart('trunk');
    const ratio = trunk ? m / magnification(trunk) : m;

    if (this.found.length >= PARTS.length)
      return 'The whole strip, in order: toes at the top, throat at the bottom, and the hand and the face taking most of it between them. Everything is where a body says it should be and almost nothing is the size a body says it should be.';

    // Phrased around the part name rather than through it: half these names
    // are plural and the sentence should not have to agree with them.
    const named = part.name[0].toUpperCase() + part.name.slice(1);

    if (m >= 4)
      return `${named}: ${(cortexShare(part) * 100).toFixed(1)}% of the strip for ${(
        bodyShare(part) * 100
      ).toFixed(1)}% of the skin — about ${ratio.toFixed(
        0,
      )} times as much cortex per square centimetre as the trunk. Sensitivity buys cortical space; size does not.`;

    if (m <= 0.5)
      return `${named}: a large piece of body on a small piece of cortex — and also somewhere you would struggle to localise a touch with your eyes closed. The two go together.`;

    return `${named}: roughly the cortex its size alone would predict. The interesting parts are the ones that do not match.`;
  }
}

defineSim('homunculus-sim', HomunculusSim);
