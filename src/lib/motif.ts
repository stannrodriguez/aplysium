import type { MotifKey } from '../data/types';

/**
 * The looping idea sketches from the index design, ported from `renderMotif()`
 * in the handoff. Abstract on purpose: dots, bars, a ring, an orbiting dot.
 * Emitted as plain markup with inline styles — the keyframes themselves and the
 * reduced-motion freeze live in `global.css`.
 */

const INK = 'var(--motif-ink)';
const MUT = 'var(--motif-mut)';

const css = (rules: Record<string, string | undefined>): string =>
  Object.entries(rules)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

const div = (rules: Record<string, string | undefined>, kids = ''): string =>
  `<div style="${css(rules)}">${kids}</div>`;

const dot = (extra: Record<string, string | undefined> = {}): string =>
  div({ width: '8px', height: '8px', 'border-radius': '50%', background: INK, flex: 'none', ...extra });

const bar = (h: number, extra: Record<string, string | undefined> = {}): string =>
  div({
    width: '9px',
    height: `${h}px`,
    background: INK,
    'border-radius': '2px',
    'transform-origin': 'bottom center',
    ...extra,
  });

const frame = (kids: string, extra: Record<string, string | undefined> = {}): string =>
  div({
    width: '52px',
    height: '52px',
    display: 'flex',
    'align-items': 'flex-end',
    'justify-content': 'center',
    gap: '4px',
    ...extra,
  }, kids);

const gridBox = (kids: string): string =>
  div({
    width: '52px',
    height: '52px',
    display: 'grid',
    'grid-template-columns': 'repeat(3,1fr)',
    gap: '5px',
    'align-content': 'center',
    'justify-items': 'center',
    'align-items': 'center',
  }, kids);

const box = (kids: string, extra: Record<string, string | undefined> = {}): string =>
  div({ width: '52px', height: '52px', ...extra }, kids);

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const stagger = (i: number, step: number): string => `${(i * step).toFixed(2)}s`;

export function motifHtml(type: MotifKey): string {
  switch (type) {
    case 'spike':
      return frame(bar(46, { animation: 'mo-spike 1.5s ease-in-out infinite' }));

    case 'rise':
      return frame(bar(46, { animation: 'mo-rise 2.4s ease-in-out infinite' }));

    case 'decay':
      return frame(bar(46, { animation: 'mo-decay 2.6s ease-in-out infinite' }));

    case 'bars':
      return frame(
        bar(16, { background: MUT }) +
          bar(30, { background: MUT }) +
          bar(46, { animation: 'mo-spike 1.7s ease-in-out infinite' }) +
          bar(22, { background: MUT }) +
          bar(12, { background: MUT }),
        { gap: '3px' },
      );

    case 'shrinkcol':
      return frame(
        bar(42, { animation: 'mo-shrink 3s ease-in-out infinite' }) + bar(42, { background: MUT }),
        { gap: '9px' },
      );

    case 'cells':
      return frame(
        dot({ animation: 'mo-pop 1.7s ease-in-out infinite' }) +
          dot({ animation: 'mo-pop 1.7s ease-in-out .28s infinite' }) +
          dot({ animation: 'mo-pop 1.7s ease-in-out .56s infinite' }),
        { 'align-items': 'center', gap: '8px' },
      );

    case 'twofade':
      return frame(
        dot() + dot({ background: MUT, animation: 'mo-pop 1.9s ease-in-out infinite' }),
        { 'align-items': 'center', gap: '11px' },
      );

    case 'switch':
      return box(
        range(4).map(() => dot({ animation: 'mo-pop 1.5s ease-in-out infinite' })).join(''),
        {
          display: 'grid',
          'grid-template-columns': '1fr 1fr',
          gap: '7px',
          'align-content': 'center',
          'justify-content': 'center',
        },
      );

    case 'streams':
      return box(
        div({ display: 'flex', gap: '6px' },
          range(3).map(i => dot({ animation: `mo-pop 1.5s ease-in-out ${stagger(i, 0.18)} infinite` })).join('')) +
        div({ display: 'flex', gap: '6px' }, range(3).map(() => dot({ background: MUT })).join('')),
        {
          display: 'flex',
          'flex-direction': 'column',
          gap: '9px',
          'align-items': 'center',
          'justify-content': 'center',
        },
      );

    case 'sweep':
      return frame(
        range(5).map(i => dot({ animation: `mo-sweep 1.5s ease-in-out ${stagger(i, 0.13)} infinite` })).join(''),
        { 'align-items': 'center', gap: '5px' },
      );

    case 'gridfade':
      return gridBox(
        range(9).map(i => dot({ animation: `mo-pop 1.9s ease-in-out ${stagger(i, 0.1)} infinite` })).join(''),
      );

    case 'patch':
      return gridBox(
        range(9).map(i => dot({
          background: i === 4 ? INK : MUT,
          animation: i === 4 ? 'mo-pop 1.5s ease-in-out infinite' : undefined,
        })).join(''),
      );

    case 'hex': {
      const pos = [[22, 22], [22, 6], [36, 14], [36, 30], [22, 38], [8, 30], [8, 14]];
      return box(
        pos.map(([left, top], i) => dot({
          position: 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          animation: `mo-pop 2s ease-in-out ${stagger(i, 0.14)} infinite`,
        })).join(''),
        { position: 'relative' },
      );
    }

    case 'ring':
      return box(
        div({
          position: 'absolute',
          width: '46px',
          height: '46px',
          'border-radius': '50%',
          border: `2px solid ${INK}`,
          animation: 'mo-ring 1.9s ease-out infinite',
        }) + dot({ width: '13px', height: '13px' }),
        { position: 'relative', display: 'flex', 'align-items': 'center', 'justify-content': 'center' },
      );

    case 'orbit':
      return box(
        div({
          position: 'absolute',
          left: '8px',
          top: '8px',
          width: '36px',
          height: '36px',
          border: `1px solid ${MUT}`,
        }) +
        dot({ position: 'absolute', left: '6px', top: '6px', animation: 'mo-orbit 3.4s linear infinite' }),
        { position: 'relative' },
      );

    case 'spin':
      return box(
        div({ width: '28px', height: '28px', border: `2px solid ${INK}`, animation: 'mo-spin 3.4s linear infinite' }),
        { display: 'flex', 'align-items': 'center', 'justify-content': 'center' },
      );

    case 'rotatebar':
      return box(
        div({
          width: '5px',
          height: '42px',
          'border-radius': '3px',
          background: INK,
          animation: 'mo-rotbar 2.6s ease-in-out infinite',
          'transform-origin': 'center',
        }),
        { display: 'flex', 'align-items': 'center', 'justify-content': 'center' },
      );

    case 'cross': {
      const still = [[12, 12], [18, 34], [34, 16], [40, 32]];
      return box(
        still.map(([left, top]) => dot({
          position: 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          width: '6px',
          height: '6px',
          background: MUT,
        })).join('') +
        dot({ position: 'absolute', top: '23px', left: '0px', animation: 'mo-cross 2.8s ease-in-out infinite' }),
        { position: 'relative', display: 'flex', 'align-items': 'center' },
      );
    }

    case 'split':
      return frame(
        bar(40, { animation: 'mo-teeter 2s ease-in-out infinite' }) +
          bar(40, { background: MUT, animation: 'mo-teeter 2s ease-in-out -1s infinite' }),
        { 'align-items': 'center', gap: '8px' },
      );

    default:
      return box(
        dot({ width: '12px', height: '12px', animation: 'mo-pop 1.6s ease-in-out infinite' }),
        { display: 'flex', 'align-items': 'center', 'justify-content': 'center' },
      );
  }
}
