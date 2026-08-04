import type { SimulatorKey } from './types';

/**
 * The line printed under a pinned experiment. An authored deep dive can
 * override it with its own `simCaption`; this is what every other entry uses.
 */
export const SIM_CAPTIONS: Record<SimulatorKey, string> = {
  aplysia:
    'Four tabs, one synapse. Run baseline, habituation and sensitization to watch the same junction change strength — then open “Short vs long-term” for the insight the reflex was hiding: why one memory fades and another grows new wiring.',
  cajal:
    'Three tabs. Stain a section to see the sparse whole neurons, then trace an axon to its terminal — a free ending against the next cell, never fused. Then open “The gap” for the insight: because the terminal ends free there is a synapse, and a single junction you can turn up or down.',
  axon:
    'Three tabs, one axon. Push the stimulus toward threshold, then cross it and watch every spike land on the last however hard you push — the blockers take one ion channel out at a time. Then open “The two currents” for the insight: the spike is sodium and potassium on different timers, not one event.',
  retina:
    'Four tabs, one cell. Flash a spot on the centre and it fires, move it to the surround and it goes quiet, then map the field to see it is a ring, not a patch — then open "Even flood" for the insight: the two halves cancel, so the eye reports contrast, not brightness.',
  homunculus:
    'Two tabs. Stimulate the strip point by point — each segment as wide as the cortex that part really occupies, so where your clicks keep landing is the result — then open “The distortion” for the idea it was hiding: the same body drawn twice, and territory bought with sensitivity, not size.',
  iconic:
    'This one runs on you. Twelve letters for fifty milliseconds, then either report the lot or report the one row the cue names. Compare the two scores, then push the cue later.',
  orientation:
    'Hunt for the angle this cell wants, one bar at a time, and watch the tuning curve fill in. Try the spot of light too: months of spots was what had been failing to move these cells at all.',
  splitbrain:
    'Flash the pair, then ask it both ways — out loud, and with the left hand. When the two answers disagree, ask why: the explanation you get back is a confident reason for a choice the talking half never made.',
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
