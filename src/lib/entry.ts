import { getDeepDive } from '../data/entries';
import { STATUS } from '../data/types';
import type { DeepDive, Study } from '../data/types';

/**
 * The layers an entry renders. A study with an authored deep dive uses it; the
 * rest fall back to the claim, method and replication note already carried on
 * the study itself, through the same template.
 */
export function entryFor(study: Study): { dive: DeepDive; authored: boolean } {
  const authored = getDeepDive(study.slug);
  if (authored) return { dive: authored, authored: true };

  return {
    authored: false,
    dive: {
      bridge: study.why,
      layers: [
        {
          // No summary line here — the claim above the layers already is one.
          num: '01',
          title: 'What they found',
          paras: [study.finding],
        },
        {
          num: '02',
          title: 'How they did it',
          paras: [study.method],
        },
        {
          num: '03',
          title: 'How solid is this',
          summary: STATUS[study.status].word,
          paras: [STATUS[study.status].note],
        },
      ],
    },
  };
}
