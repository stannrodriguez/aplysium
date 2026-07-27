import type { SimulatorKey } from './types';

/**
 * The line printed under a pinned experiment. An authored deep dive can
 * override it with its own `simCaption`; this is what every other entry uses.
 */
export const SIM_CAPTIONS: Record<SimulatorKey, string> = {
  aplysia:
    'Tap the siphon a few times, then shock the tail. Try the two training schedules at the bottom. The reading on the left explains whatever you just did.',
};

export const simCaption = (kind: SimulatorKey): string => SIM_CAPTIONS[kind];
