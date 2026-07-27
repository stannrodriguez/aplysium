import type { SimulatorKey } from './types';

/**
 * The line printed under a pinned experiment. An authored deep dive can
 * override it with its own `simCaption`; this is what every other entry uses.
 */
export const SIM_CAPTIONS: Record<SimulatorKey, string> = {
  aplysia:
    'Tap the siphon a few times, then shock the tail. Try the two training schedules at the bottom. The reading on the left explains whatever you just did.',
  cajal:
    'Stain a section, then follow a stained axon to the marked terminal at its end. The toggle draws the rival theory over the same contact, so you can see the two predictions differ.',
};

export const simCaption = (kind: SimulatorKey): string => SIM_CAPTIONS[kind];
