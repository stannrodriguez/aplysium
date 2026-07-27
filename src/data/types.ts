/**
 * The shape of the collection. Everything the index and the entry template
 * render comes from `Study`; deep-dive prose for a study lives alongside it in
 * `src/data/entries/<slug>.ts` and is joined by slug.
 */

/** How well the result has held up. Rendered as a quiet dot, never a badge. */
export type StatusKey = 'settled' | 'debated' | 'narrowed';

/** Which looping sketch anchors the study on the index. */
export type MotifKey =
  | 'cells' | 'spike' | 'rise' | 'decay' | 'bars' | 'shrinkcol' | 'twofade'
  | 'switch' | 'streams' | 'sweep' | 'gridfade' | 'patch' | 'hex' | 'ring'
  | 'orbit' | 'spin' | 'rotatebar' | 'cross' | 'split';

/** Interactive component a study's entry embeds, if it has one. */
export type SimulatorKey = 'aplysia' | 'cajal' | 'axon' | 'retina' | 'homunculus' | 'iconic' | 'orientation' | 'splitbrain' | 'placefield' | 'rotation' | 'replay' | 'dopamine' | 'gorilla' | 'grid';

/**
 * The long answer to "why does this matter". Rendered as one layer on the
 * entry, so it is shaped like one: a line for the closed state, paragraphs for
 * the open one. It should say what the field could not do before and what it
 * could do after — not that the result was important.
 */
export interface Significance {
  /** One line, shown under the layer title while it is closed. */
  summary: string;
  /** Two or three paragraphs. */
  paras: string[];
}

export interface Study {
  /** Chronological position, 1–20. Stable id for the study. */
  id: number;
  /** URL segment: /studies/<slug>/ */
  slug: string;

  /* ── index card ── */
  /** The idea, led with. Archivo 700 on the card. */
  idea: string;
  /** One plain sentence under the idea. */
  lede: string;
  /** Display name(s), e.g. "Hodgkin & Huxley". */
  author: string;
  /** Display years, e.g. "1939–52". */
  year: string;
  /** First publication year — the sort key. */
  yearStart: number;
  status: StatusKey;
  motif: MotifKey;
  /** Whether the entry carries an experiment you can run. */
  hasDemo: boolean;

  /* ── entry page ── */
  /** Preparation or organism, for the mono meta row. */
  subject: string;
  /** The claim, set as the entry's h2. */
  claim: string;
  /** What they found, in one sentence. */
  finding: string;
  /**
   * Why the result mattered, in two or three sentences. Leads the entry as the
   * bridge under the claim; `significance` carries the long version.
   */
  why: string;
  /** The case for why it mattered, at length — the "Why it matters" layer. */
  significance: Significance;
  /** How they actually did it — the method payload. */
  method: string;
  /** Which interactive island the entry embeds. Absent = prose only. */
  simulator?: SimulatorKey;
}

/** One progressive-disclosure layer on an entry page. */
export interface Layer {
  /** Zero-padded, shown in the accent column: "01". */
  num: string;
  title: string;
  /** One line, always visible under the title. */
  summary?: string;
  paras: string[];
  /** Optional nested disclosure for a control or aside. */
  subTitle?: string;
  subBody?: string;
}

/** The authored deep dive for one study. */
export interface DeepDive {
  /** Connective summary between the claim and layer 01. */
  bridge: string;
  /** Overrides `Study.year` in the entry meta row when the long form reads better. */
  metaYear?: string;
  layers: Layer[];
  /** Caption under the pinned simulator. */
  simCaption?: string;
}

export const STATUS: Record<StatusKey, { word: string; dot: string; dotEntry: string; note: string }> = {
  settled: {
    word: 'holds up',
    dot: 'var(--status-settled)',
    dotEntry: 'var(--status-settled-entry)',
    note: 'Reproduced in other labs; the effect is stable.',
  },
  debated: {
    word: 'still debated',
    dot: 'var(--status-debated)',
    dotEntry: 'var(--status-debated)',
    note: 'The result reproduces; what it means is still argued.',
  },
  narrowed: {
    word: 'narrower than it first looked',
    dot: 'var(--status-narrowed)',
    dotEntry: 'var(--status-narrowed)',
    note: 'Reproduces, but the original claim now holds over less ground than it first appeared to.',
  },
};

/** The status line under an entry's claim. */
export const ENTRY_STATUS_LINE: Record<StatusKey, string> = {
  settled: 'holds up under replication',
  debated: 'replicates; the reading is still debated',
  narrowed: 'replicates, but narrower than it first looked',
};

/** Legend wording on the index, which shortens the last two. */
export const STATUS_LEGEND: Array<{ key: StatusKey; label: string }> = [
  { key: 'settled', label: 'settled' },
  { key: 'debated', label: 'still debated' },
  { key: 'narrowed', label: 'scope narrowed' },
];
