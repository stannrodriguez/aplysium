# Copy Audit: Aplysium

## Issues found and changes made

- **Meta, page titles, and manifest (`Base.astro`, `index.astro`, `[slug].astro`, `site.webmanifest`)**: Replaced em dashes with colons or parentheses, added `Aplysium` to the homepage title, and aligned the manifest name and description with the site.
- **Replication legend and status dot (`src/data/types.ts`, `StatusDot.astro`, `index.astro`)**: Changed the index legend from `settled` to `holds up` to match the card dot tooltip and entry status line, clarified the dot `aria-label` to `Replication status: ...`, and removed the legend em dash.
- **README accuracy and punctuation (`README.md`)**: Fixed the experiment count from thirteen to fourteen, added the missing Kandel row to the experiments table, named Aplysium in the intro, and removed em and en dashes.
- **Simulator captions (`src/data/sims.ts`, `kandel-aplysia.ts`)**: Removed em dashes across all fourteen captions, tightened wordy phrasing, and replaced straight quotes in `retina` with curly quotes to match the rest.
- **Typos and grammar bugs (`grid.ts`, `iconic.ts`, `cajal.ts`, `replay.ts`, `GorillaSim.astro`)**: Fixed `1 vertice` to `1 vertex`, `is stood in for` to `stands in for`, `1 terminal traced, none` to `not continuous`, `running run back` to `played back`, `first-spikes` to `first spikes`, and US `afterward` to British `afterwards`.
- **Singular/plural readouts (`dopamine.ts`, `grid.ts`, `orientation.ts`, `placefield.ts`, `rotation.ts`)**: Fixed `1 trials`, `1 angles`, `1 readings`, and `1 spikes` to use singular nouns when count is 1.
- **Buttons, placeholders, tooltips, and empty states (`src/components/sims/*.astro`, `src/scripts/sims/*.ts`)**: Replaced vague `PRESENT SOMETHING` with `NO STIMULUS YET`, clarified the ringed-replay button to `Replay (gorilla ringed)`, tightened `That is my count` to `Submit count`, changed `nothing` to `None`, replaced figurative `weigh` with `compare`, clarified vague `placefield.ts` notes, replaced em-dash placeholders with `--` or `n/a`, and removed all server-rendered and initial-load em dashes.

## Left alone on purpose

- **Authored study entries (`src/data/studies.ts`)**: Preserved Stephanie's authored claims, summaries, findings, significance essays, and methods untouched.
- **Authored deep dive (`src/data/entries/kandel-aplysia.ts`)**: Preserved the bridge and all seven layers of authored prose; only synced `simCaption` with `src/data/sims.ts`.
- **Patient quotes (`src/data/homunculus.ts`, `PAIRS` in `src/scripts/sims/splitbrain.ts`)**: Preserved patient reports and spoken responses as authored dialogue.
- **Static social card (`public/og-card.svg`)**: Clean copy already rendered into `public/og-card.png`; left untouched to keep SVG and PNG in sync.
- **Existing voice and conventions**: Kept British spelling (`centre`, `behaviour`, `colour`, `afterwards`), neuroscience `sensitization`, lowercase `▶`/`■` play controls, and unpunctuated layer titles.

## Not done (next pass)

- **Secondary runtime captions in `src/scripts/sims/*.ts`**: Non-initial mode-switch and post-interaction captions and verdicts across the fourteen simulator scripts still contain em dashes; deferred to keep this pass within the 300-line change cap.
