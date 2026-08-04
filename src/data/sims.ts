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
    'Three tabs, one grid — and it runs on you. Flash twelve letters for fifty milliseconds and report the lot (about four); flash again and report just the row the cue names (nearly all of it). Then open “Delay the cue” for the insight: multiply the cued row up to what was really there, then push the cue later and watch that store decay back to four.',
  orientation:
    'Three tabs, one cell. Hunt for the angle it wants one bar at a time and watch the tuning curve fill in; flash a spot to see the stimulus that failed for months — then open “How it’s built” for the insight the curve was hiding: the cell is just a row of spot-detectors wired in a line.',
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
