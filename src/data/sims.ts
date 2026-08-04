import type { SimulatorKey } from './types';

/**
 * The line printed under a pinned experiment. An authored deep dive can
 * override it with its own `simCaption`; this is what every other entry uses.
 */
export const SIM_CAPTIONS: Record<SimulatorKey, string> = {
  aplysia:
    'Four tabs, one synapse. Run baseline, habituation and sensitization to watch the same junction change strength — then open “Short vs long-term” for the insight the reflex was hiding: why one memory fades and another grows new wiring.',
  cajal:
    'Stain a section, then follow a stained axon to the marked terminal at its end. The toggle draws the rival theory over the same contact, so you can see the two predictions differ.',
  axon:
    'Push the stimulus up until it fires, then keep pushing — every spike lands on the last. The blockers at the bottom take one ion channel out at a time.',
  retina:
    'Click anywhere on the retina to flash the spot there and read the rate. Then flood the whole patch evenly, and map the field to see the shape that explains it.',
  homunculus:
    'Click along the strip. Each segment is as wide as the cortex that body part really occupies, so where your clicks keep landing tells you the result before you read a word of it.',
  iconic:
    'This one runs on you. Twelve letters for fifty milliseconds, then either report the lot or report the one row the cue names. Compare the two scores, then push the cue later.',
  orientation:
    'Hunt for the angle this cell wants, one bar at a time, and watch the tuning curve fill in. Try the spot of light too: months of spots was what had been failing to move these cells at all.',
  splitbrain:
    'Three tabs, one flash. Ask the talking half out loud and it names only the right hemifield; ask the left hand and it takes the left. Then open “Why did you do that?” — the insight — and the talking half invents a confident reason for a choice it never saw.',
  placefield:
    'Let the animal forage until the spikes pile up somewhere. Take another cell and it cares about somewhere else. Then turn the cue card and watch the field go with it.',
  rotation:
    'Your own reaction times are the data here. Answer as fast as you are sure, across a dozen angles, and see whether the line through them comes out straight.',
  replay:
    'Run the track, then record a sleep epoch and look for the same order in it. The epoch before the run is the control, and it is what makes the other one mean anything.',
  dopamine:
    'Give it a reward out of nowhere, then train the cue until the burst moves onto it, then withhold the reward. The third trial is the one that decides what the cell is reporting.',
  gorilla:
    'One viewing, and the counting task is real. Do it properly before you read anything below it — the panel is spent after a single go, exactly as the original was.',
  grid:
    'Forage the large box until the pattern shows, then put the same cell in the small one. What looked like a fact about the cell turns out to be a fact about the size of the box.',
};

export const simCaption = (kind: SimulatorKey): string => SIM_CAPTIONS[kind];
