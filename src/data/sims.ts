import type { SimulatorKey } from './types';

/**
 * The line printed under a pinned experiment. An authored deep dive can
 * override it with its own `simCaption`; this is what every other entry uses.
 */
export const SIM_CAPTIONS: Record<SimulatorKey, string> = {
  aplysia:
    'Four tabs, one synapse. Run baseline, habituation and sensitization to watch the same junction change strength, then open “Short vs long-term” for why one memory fades and another grows new wiring.',
  cajal:
    'Three tabs. Stain a section to see sparse whole neurons, then trace an axon to its terminal: a free ending against the next cell, never fused. Open “The gap” to see how that free ending creates a synapse you can turn up or down.',
  axon:
    'Three tabs, one axon. Push the stimulus toward threshold, cross it to see every spike reach the same height, and use the blockers to take one ion channel out at a time. Open “The two currents” to see sodium and potassium on different timers.',
  retina:
    'Four tabs, one cell. Flash a spot on the centre and it fires, move it to the surround and it goes quiet, then map the field to see a ring rather than a patch. Open “Even flood” to see the two halves cancel so the eye reports contrast, not brightness.',
  homunculus:
    'Two tabs. Stimulate the strip point by point, where each segment matches the cortex that body part occupies. Open “The distortion” to compare cortical space with skin area and see territory allocated by sensitivity, not size.',
  iconic:
    'Three tabs, one grid, run on you. Flash twelve letters for fifty milliseconds and report all you can (about four), then flash again and report only the cued row (nearly all of it). Open “Delay the cue” to scale up the cued row and watch the store decay back to four.',
  orientation:
    'Three tabs, one cell. Test one bar angle at a time to build the tuning curve, and flash a spot to see the stimulus that failed for months. Open “How it’s built” to see the cell assembled from a row of spot-detectors wired in a line.',
  splitbrain:
    'Three tabs, one flash. Ask the talking half out loud and it names only the right hemifield; ask the left hand and it picks for the left. Open “Why did you do that?” to see the talking half invent a confident reason for a choice it never saw.',
  placefield:
    'Three tabs, one box. Forage until spikes pile up in one patch (the place field), then switch cells to see the room tile itself. Open “Codes place” and turn the cue card: the field turns with it because the map is pinned to the landmark.',
  rotation:
    'Two tabs, one task run on you. In “Do the trials”, judge whether two figures are the same object or mirror images as fast as you are sure across angles. Open “Your line” to plot your reaction times against angle and see the rising slope.',
  replay:
    'Three tabs, one recording. Run the track to record an eight-cell sequence, then record sleep afterwards to find that same order compressed roughly twentyfold. Open “The control” to see that the sequence is absent in sleep before the run.',
  dopamine:
    'Four tabs, one beat each: an unexpected reward, a cue trained until the burst moves onto it, a withheld reward, and the prediction-error reading. The omission trial decides it: nothing happens, and the cell still responds.',
  gorilla:
    'One viewing, and the counting task is real. Finish the trial first: the insight stays locked until you do, because the panel works only once on a naive viewer, just like the original study.',
  grid:
    'Forage the large box until the pattern appears, then put the same cell in the small box: what looked like a property of the cell turns out to depend on box size. Open “The coordinate grid” to see the lattice as a metric the animal carries with it.',
};

export const simCaption = (kind: SimulatorKey): string => SIM_CAPTIONS[kind];
