# Twenty things we figured out about the mind

A reading-first static site of twenty landmark neuroscience studies that hold up
under replication. One deep-dive entry per study; every page stands alone — no
backend, no login, no accounts.

Built with [Astro](https://astro.build). Ships zero JavaScript except one small
custom element for the Aplysia simulator and ~20 lines for expand-all.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview
```

## Routes

| Route | What it is |
|---|---|
| `/` | The index — an idea-first grid of all twenty studies, earliest first |
| `/studies/<slug>/` | The deep-dive entry for one study |

## Where things live

```
src/data/types.ts              Study, DeepDive, Layer, status and motif keys
src/data/studies.ts            all twenty studies — the single source
src/data/entries/<slug>.ts     authored deep dive for one study
src/data/entries/index.ts      slug → deep dive
src/lib/motif.ts               the nineteen looping idea sketches
src/lib/entry.ts               picks the authored deep dive, or falls back
src/components/                Motif, StatusDot, StudyCard, LayerList, AplysiaSim
src/scripts/aplysia-sim.ts     simulator behaviour model
src/styles/global.css          design tokens, motif keyframes
src/styles/sim.css             the dark instrument panel
```

## Adding a study

Append an object to `studies` in `src/data/studies.ts`. It appears on the index
and gets its own entry page immediately — the entry template falls back to the
study's own `finding`, `method` and replication note.

To write the full layered deep dive for it, add `src/data/entries/<slug>.ts`
exporting a `DeepDive` and register it in `src/data/entries/index.ts`.

## The simulator

`<aplysia-sim>` is a framework-free custom element. Its markup is server-rendered
by `AplysiaSim.astro`, so the panel is readable before (and without) JavaScript.

```astro
<AplysiaSim show="animal,synapse,trace,longterm" />
```

`show` selects panels: `animal`, `synapse`, `trace`, `longterm`. The element
fires an `aplysia:event` CustomEvent — and calls an `onEvent(name, state)`
property if one is set — on tap, shock, rest and train.

## Accessibility

- `prefers-reduced-motion` freezes the index motifs mid-cycle, drops the
  transmitter drift, and makes the gill and meters change state instantly.
- Every simulator control is at least a 44px target.
- Replication dots carry their status word as an accessible label.
- The reading layers are native `<details>`, so they work with no JavaScript.
