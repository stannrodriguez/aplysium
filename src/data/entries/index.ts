import type { DeepDive } from '../types';
import { kandelAplysia } from './kandel-aplysia';

/**
 * Authored deep dives, keyed by study slug. A study without an entry here
 * still gets a page — the template falls back to the study's own finding,
 * method and replication note (see `src/lib/entry.ts`).
 */
export const deepDives: Record<string, DeepDive> = {
  'kandel-aplysia': kandelAplysia,
};

export const getDeepDive = (slug: string): DeepDive | undefined => deepDives[slug];
