import type { DeepDive } from '../types';

const REPLICATION =
  'Very solid. Replicated across labs, and the mechanism generalises — the same cAMP/CREB pathway underlies long-term memory in flies, mice and humans. Nobel Prize in 2000. The caveat is scope, not validity: this explains how one synapse stores a change, not how a memory distributed across a mammalian brain is encoded.';

export const kandelAplysia: DeepDive = {
  metaYear: '1960s–1970s',

  bridge:
    'The short version: Kandel picked a sea slug simple enough to find the single cell behind a reflex, trained the animal until that reflex got weaker and then stronger, and recorded the one synapse responsible while it changed. The layers below go in order — why that animal, what the reflex is, the two ways training changed it, where the change actually sits, and what makes it last a day instead of an hour.',

  simCaption:
    'Tap the siphon a few times, then shock the tail. Try the two training schedules at the bottom. The reading on the left explains whatever you just did.',

  layers: [
    {
      num: '01',
      title: 'Why a sea slug',
      summary: '20,000 neurons, some visible to the naked eye, individually identifiable across animals.',
      paras: [
        'Aplysia californica has roughly twenty thousand neurons. Some are a millimetre across and many are identifiable — the same cell in the same place in every animal, with a name. The gill motor neuron is L7 in every specimen.',
        'Kandel chose it deliberately over mammals in the early 1960s, against colleagues who thought memory was too complex to study in an invertebrate. The bet was that the storage mechanism would be conserved even where the animal was not.',
      ],
    },
    {
      num: '02',
      title: 'The behaviour',
      summary: 'Touch the siphon, the animal retracts its gill. Reflexive, graded, measurable.',
      paras: [
        'Touch the siphon and the gill pulls in under the mantle. How far it moves and how long it stays in is the entire behavioural measurement. The reflex is reliable enough that a small change in it is visible without statistics.',
      ],
    },
    {
      num: '03',
      title: 'Two kinds of learning in one reflex',
      summary: 'Repetition weakens it. A shock elsewhere on the body strengthens it past baseline.',
      paras: [
        'Habituation: repeat the touch and the withdrawal weakens over about ten trials. The animal has learned the stimulus is harmless. It is not fatigue — a tail shock restores the full response instantly, which is the control that makes this learning.',
        'Sensitization: shock the tail, then touch the siphon. The withdrawal is now larger than it ever was untrained, and stays larger. The shock is nowhere near the siphon, so nothing local at the stimulation site can account for it.',
      ],
      subTitle: 'the control that rules out fatigue',
      subBody:
        'A tired muscle and a habituated reflex look identical from outside the animal. The tail shock separates them in one trial: if the response comes back at full strength immediately, the machinery was never depleted. This single control is why the habituation result counts as learning at all.',
    },
    {
      num: '04',
      title: 'Where the change actually is',
      summary: 'Same number of impulses, less transmitter released per impulse. The synapse is the storage site.',
      paras: [
        'The sensory neuron carrying the siphon touch synapses directly onto the motor neuron that moves the gill. Both are identifiable and large enough to impale, so the connection can be recorded while the animal is trained.',
        'After habituation the sensory neuron fires the same number of impulses but releases less transmitter per impulse. After sensitization, more. The muscle, the sensory ending and the spike count are unchanged. The behavioural change and the synaptic change are the same event, measured twice.',
      ],
    },
    {
      num: '05',
      title: 'Short term against long term',
      summary: 'One session strengthens existing synapses and fades. Spaced sessions grow new ones and need new protein.',
      paras: [
        'A single training session changes the strength of synapses that already exist, and it fades within hours. Spaced sessions grow new synaptic connections between the same two neurons — there is more contact afterwards than there was.',
        'Long-term memory requires new protein synthesis; short-term memory does not. Block protein synthesis during training and short-term memory is completely intact while long-term memory never forms.',
      ],
      subTitle: 'why the dissociation matters',
      subBody:
        'If long-term memory were just short-term memory lasting longer, anything that abolished the long form would have to damage the short form on the way. Blocking protein synthesis leaves the short form untouched. Two processes running in parallel, sharing a synapse.',
    },
    {
      num: '06',
      title: 'Why it matters',
      summary: 'The first unbroken chain from a training session to the molecules that hold the change — and the same chain runs in flies, mice and us.',
      paras: [
        'Before this, memory could be described at the level of behaviour or hypothesised at the level of synapses, and there was no way to hold the two accounts against each other. Everything in between was inference. In an animal whose cells can be named and impaled, every step from the touch on the siphon to the gill moving is accountable, so “the memory is in the synapse” stops being a claim about where to look and becomes a measurement of transmitter released at a known junction, before and after training.',
        'The bet that made it work was the animal itself, and it was not an obvious one in the early 1960s — colleagues thought memory too complex to survive that much simplification. What justified it was that the mechanism generalised. cAMP and CREB turned out to be doing the same job in Drosophila and in mice, and the short-term/long-term dissociation found here holds across species, which is why a result about an invertebrate reflex sits on a list about the human mind.',
        'It also set the terms for the memory work that followed. Once a memory is a physical change at identified synapses, the questions become which synapses, tagged how, and reachable how — which is the line running through long-term potentiation and the engram experiments further along, both of which are asking Kandel’s question in tissue that is far harder to hold still.',
      ],
    },
    {
      num: '07',
      title: 'How solid is this',
      summary: 'Replicated across labs; the cAMP/CREB pathway generalises to flies, mice and humans. Nobel 2000.',
      paras: [
        REPLICATION,
        'The limit is scope. This is a two-neuron circuit in an animal with twenty thousand cells. It explains how a synapse holds a change, not how a memory distributed across a mammalian brain is written or retrieved.',
      ],
    },
  ],
};
