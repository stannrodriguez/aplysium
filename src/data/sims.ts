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
  axon:
    'Push the stimulus up until it fires, then keep pushing — every spike lands on the last. The blockers at the bottom take one ion channel out at a time.',
  retina:
    'Click anywhere on the retina to flash the spot there and read the rate. Then flood the whole patch evenly, and map the field to see the shape that explains it.',
  homunculus:
    'Click along the strip. Each segment is as wide as the cortex that body part really occupies, so which parts you keep landing on is the finding before you read a word of it.',
};

export const simCaption = (kind: SimulatorKey): string => SIM_CAPTIONS[kind];
