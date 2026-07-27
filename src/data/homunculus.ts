/**
 * The cortical strip, part by part — shared by the Penfield experiment's
 * markup and its behaviour, so the strip segments the server renders and the
 * arithmetic the script does come from one table.
 *
 * `cortex` is the share of the postcentral strip a part occupies; `body` is
 * its share of body surface. The mismatch between the two columns is the whole
 * finding, so they are kept as raw shares and normalised at the point of use
 * rather than pre-divided into a number that hides where it came from.
 *
 * The report is what a patient said when that point was stimulated. Penfield
 * labelled the map from those sentences; there was no other way to label it.
 */

export interface BodyPart {
  key: string;
  /** As it appears on the strip and in the readouts. */
  name: string;
  cortex: number;
  body: number;
  report: string;
}

/** Medial to lateral, which is the order they sit in on the strip. */
export const PARTS: BodyPart[] = [
  { key: 'toes', name: 'toes', cortex: 3, body: 2, report: 'A tingling, in my toes. The right ones.' },
  { key: 'leg', name: 'leg', cortex: 6, body: 16, report: 'Something ran up the back of my leg.' },
  { key: 'trunk', name: 'trunk', cortex: 5, body: 22, report: 'A dull feeling across my side. Hard to place.' },
  { key: 'shoulder', name: 'shoulder', cortex: 3, body: 4, report: 'My shoulder — like a hand resting on it.' },
  { key: 'arm', name: 'arm', cortex: 4, body: 9, report: 'Numbness, up the whole arm.' },
  { key: 'hand', name: 'hand', cortex: 11, body: 3, report: 'My palm. As if I were holding something warm.' },
  { key: 'fingers', name: 'fingers', cortex: 9, body: 1.5, report: 'The tips of my fingers. Two of them, maybe three.' },
  { key: 'thumb', name: 'thumb', cortex: 8, body: 0.6, report: 'My thumb. Just the thumb, quite clearly.' },
  { key: 'neck', name: 'neck', cortex: 3, body: 2, report: 'The back of my neck went strange.' },
  { key: 'face', name: 'face', cortex: 9, body: 3, report: 'My cheek. Like a draught across it.' },
  { key: 'lips', name: 'lips', cortex: 15, body: 0.7, report: 'My lower lip. Very sharp — I could point to the spot.' },
  { key: 'tongue', name: 'tongue & jaw', cortex: 13, body: 0.4, report: 'My tongue. The side of it, and my jaw with it.' },
  { key: 'throat', name: 'throat', cortex: 3, body: 0.3, report: 'Something in my throat. I wanted to swallow.' },
];

const CORTEX_TOTAL = PARTS.reduce((n, p) => n + p.cortex, 0);
const BODY_TOTAL = PARTS.reduce((n, p) => n + p.body, 0);

export const cortexShare = (p: BodyPart): number => p.cortex / CORTEX_TOTAL;
export const bodyShare = (p: BodyPart): number => p.body / BODY_TOTAL;

/** Cortex per unit of skin, relative to the average part. Above 1 means the
 *  part gets more strip than its size alone would buy. */
export const magnification = (p: BodyPart): number => cortexShare(p) / bodyShare(p);

export const getPart = (key: string): BodyPart | undefined => PARTS.find(p => p.key === key);
