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
src/data/types.ts              Study, DeepDive, Layer, status, motif and simulator keys
src/data/studies.ts            all twenty studies — the single source
src/data/sims.ts               simulator key → the caption under the panel
src/data/entries/<slug>.ts     authored deep dive for one study
src/data/entries/index.ts      slug → deep dive
src/lib/motif.ts               the nineteen looping idea sketches
src/lib/entry.ts               picks the authored deep dive, or falls back
src/components/                Motif, StatusDot, StudyCard, LayerList, Simulator
src/components/sims/           one Astro component per experiment
src/scripts/sims/base.ts       the shared custom-element base
src/scripts/sims/<name>.ts     one behaviour model per experiment
src/styles/global.css          design tokens, motif keyframes
src/styles/sim.css             the shell every experiment sits in
src/styles/sims/<name>.css     one experiment's own stage
```

## Adding a study

Append an object to `studies` in `src/data/studies.ts`. It appears on the index
and gets its own entry page immediately — the entry template falls back to the
study's own `finding`, `method` and replication note.

To write the full layered deep dive for it, add `src/data/entries/<slug>.ts`
exporting a `DeepDive` and register it in `src/data/entries/index.ts`.

## The experiments

An entry with `simulator: '<key>'` pins that experiment in its right-hand
column. `Simulator.astro` maps the key to a component; the component
server-renders the markup and a framework-free custom element attaches to it,
so every panel is readable before (and without) JavaScript.

Each element extends `SimElement` (`src/scripts/sims/base.ts`), which supplies
the querying, text-writing, control wiring and timer bookkeeping they all
repeat. They report what the reader did by firing a `sim:event` CustomEvent —
and calling an `onEvent(name, detail)` property if one is set.

### Adding one

1. Add its key to `SimulatorKey` in `src/data/types.ts`.
2. Write `src/components/sims/<Name>Sim.astro`, `src/scripts/sims/<name>.ts`
   and `src/styles/sims/<name>.css`.
3. Register the component in `src/components/Simulator.astro` and its caption
   in `src/data/sims.ts`.
4. Set `simulator: '<key>'` on the study.

Until a study has one, `hasDemo: true` renders a note in that column saying the
experiment is not built yet.

## Accessibility

- `prefers-reduced-motion` freezes the index motifs mid-cycle, drops the
  transmitter drift, and makes the gill and meters change state instantly.
- Every simulator control is at least a 44px target.
- Replication dots carry their status word as an accessible label.
- The simulator's mono labels sit at `--muted` rather than `--meta`, which
  keeps them above 4.5:1 on the warm ground.
- The reading layers are native `<details>`, so they work with no JavaScript.
