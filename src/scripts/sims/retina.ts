/**
 * <retina-sim> — mapping one retinal ganglion cell, as a guided instrument.
 *
 * The markup is server-rendered by RetinaSim.astro; this class attaches to it
 * and drives the readouts. Rather than one free-play instrument, the panel is a
 * guided path: four mode tabs, one obvious action apiece, and a caption that
 * always describes what you are looking at now.
 *
 *   Centre spot   — a small spot on the field centre drives the cell hard.
 *   Surround spot — the same spot in the ring around it silences the cell.
 *   Map the field — sweep the spot everywhere; the map is a ring, not a patch.
 *   Even flood    — the insight: flood the whole field and centre excitation
 *                   and surround inhibition cancel. Turn the light up and both
 *                   scale together, so the difference the cell reports barely
 *                   moves. The eye reports contrast, not brightness.
 *
 * The cell is a difference of two Gaussians: a narrow excitatory centre and a
 * broad inhibitory surround, weighted so their integrals cancel. Nothing is
 * looked up — a flash is scored by integrating that field over the disc the
 * light covers, so moving the spot two millimetres out and watching the rate
 * fall through baseline is the measurement Kuffler actually made.
 */

import { SimElement, clamp, defineSim, noise } from './base';

type Mode = 'centre' | 'surround' | 'map' | 'insight';

interface Flash {
  x: number;
  y: number;
  r: number;
  rate: number;
}

const W = 320;
const H = 200;
const CX = 160;
const CY = 100;

/** Centre and surround widths. The surround is broad and weak; the weight
 *  below is exactly σc²/σs², which is what makes the two integrals cancel. */
const SIGMA_C = 13;
const SIGMA_S = 32;
const SURROUND_WEIGHT = (SIGMA_C * SIGMA_C) / (SIGMA_S * SIGMA_S);

const BASE_RATE = 12;
const GAIN = 0.13;
const MAX_RATE = 90;
const STEP = 2; // sampling step when integrating over the spot, in px
const RADIUS = 11; // the small probe spot, fixed across the guided beats

/** Where each spot beat lands the probe: dead centre, and out in the ring. */
const SURR_X = CX + 36;
const SURR_Y = CY;

/** The field at one squared distance from the receptive-field centre. */
const field = (d2: number): number =>
  Math.exp(-d2 / (2 * SIGMA_C * SIGMA_C)) - SURROUND_WEIGHT * Math.exp(-d2 / (2 * SIGMA_S * SIGMA_S));

/** Integrate the field over the disc the light covers. */
function respond(x: number, y: number, r: number): number {
  let sum = 0;
  for (let sx = x - r; sx <= x + r; sx += STEP)
    for (let sy = y - r; sy <= y + r; sy += STEP) {
      if ((sx - x) ** 2 + (sy - y) ** 2 > r * r) continue;
      sum += field((sx - CX) ** 2 + (sy - CY) ** 2) * STEP * STEP;
    }
  return clamp(BASE_RATE + GAIN * sum, 0, MAX_RATE);
}

/** Flood the whole retina evenly: the excitatory and inhibitory halves of the
 *  field, integrated separately over the stage. Their near-equality is the
 *  entire result — the reported rate is BASE + GAIN·(drive − suppress), and
 *  turning the light up by k scales both, leaving that difference alone. */
function floodParts(): { drive: number; suppress: number; net: number } {
  let drive = 0;
  let suppress = 0;
  for (let sx = 0; sx < W; sx += STEP)
    for (let sy = 0; sy < H; sy += STEP) {
      const d2 = (sx - CX) ** 2 + (sy - CY) ** 2;
      drive += Math.exp(-d2 / (2 * SIGMA_C * SIGMA_C)) * STEP * STEP;
      suppress += SURROUND_WEIGHT * Math.exp(-d2 / (2 * SIGMA_S * SIGMA_S)) * STEP * STEP;
    }
  return { drive, suppress, net: drive - suppress };
}

const FLOOD = floodParts();

const LEAD: Record<Mode, string> = {
  centre:
    'A small spot of light on the receptive-field centre. The cell fires hard above its resting rate — this is where light drives it.',
  surround:
    'Move the same spot out into the ring around the centre. Now the light silences the cell: it fires below its resting rate. Light here opposes the centre.',
  map:
    'Sweep the small spot across the whole patch and mark every reading. What comes out is a ring, not a patch — a centre that drives, wrapped in a surround that does the opposite.',
  insight:
    'Now flood the whole field evenly. Centre excitation and surround inhibition cancel, so the cell barely moves — and turning the light up scales both together, leaving the difference it reports unchanged. The eye reports contrast, not brightness.',
};

const STATUS: Record<Mode, string> = {
  centre: 'centre drives',
  surround: 'surround silences',
  map: 'mapping the field',
  insight: 'reports contrast',
};

class RetinaSim extends SimElement {
  private mode: Mode = 'centre';
  private x = CX;
  private y = CY;
  private last: Flash | null = null;
  private history: Flash[] = [];
  /** Rate at each probed grid point, once the field has been mapped. */
  private map: Array<{ x: number; y: number; rate: number }> = [];
  private bright = 1;

  protected setup(): void {
    this.onClick('[data-sim-mode]', el => this.setMode(el.dataset.simMode as Mode));
    this.onClick('[data-sim-bright]', el => this.setBright(Number(el.dataset.simBright)));

    const stage = this.q('[data-sim-retina]');
    stage?.addEventListener('click', event => {
      // Free exploration in the two spot beats: drop the probe where you click.
      if (this.mode !== 'centre' && this.mode !== 'surround') return;
      const box = stage.getBoundingClientRect();
      const e = event as MouseEvent;
      this.x = clamp(((e.clientX - box.left) / box.width) * W, 0, W);
      this.y = clamp(((e.clientY - box.top) / box.height) * H, 0, H);
      this.flashSpot();
      this.render();
      this.emit('flashed', { rate: this.last?.rate });
    });

    this.setMode('centre');
  }

  /* ── model ── */

  private flashSpot(): void {
    const rate = respond(this.x, this.y, RADIUS);
    this.last = { x: this.x, y: this.y, r: RADIUS, rate };
    this.history = [...this.history, this.last].slice(-16);
  }

  /** Sweep a small spot across the retina and record the rate at each point —
   *  which is the only way the ring shows up as a shape rather than a number. */
  private mapField(): void {
    const points: Array<{ x: number; y: number; rate: number }> = [];
    for (let gx = 20; gx <= W - 20; gx += 15)
      for (let gy = 16; gy <= H - 16; gy += 15) points.push({ x: gx, y: gy, rate: respond(gx, gy, 7) });
    this.map = points;
  }

  /* ── mode machine ── */

  private setMode(mode: Mode): void {
    this.mode = mode;
    // Each beat starts its own story and immediately shows its own result.
    if (mode === 'centre') {
      this.x = CX;
      this.y = CY;
      this.flashSpot();
    } else if (mode === 'surround') {
      this.x = SURR_X;
      this.y = SURR_Y;
      this.flashSpot();
    } else if (mode === 'map') {
      this.mapField();
    } else {
      this.bright = 1;
    }
    this.buildControls();
    this.render();
    this.emit(`mode-${mode}`);
  }

  private setBright(k: number): void {
    this.bright = k;
    this.render();
    this.emit('brightness', { bright: k });
  }

  /* ── controls, per mode ── */

  private buildControls(): void {
    const bar = this.q('[data-sim-controls]');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mode === 'insight') {
      // The insight beat runs from its own in-panel brightness toggle.
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (this.mode === 'centre') {
      this.addBtn(bar, 'Flash the centre', 'sim-btn-primary', () => {
        this.x = CX;
        this.y = CY;
        this.flashSpot();
        this.render();
        this.emit('flashed', { rate: this.last?.rate });
      });
    } else if (this.mode === 'surround') {
      this.addBtn(bar, 'Flash the surround', 'sim-btn-primary', () => {
        this.x = SURR_X;
        this.y = SURR_Y;
        this.flashSpot();
        this.render();
        this.emit('flashed', { rate: this.last?.rate });
      });
    } else {
      this.addBtn(bar, 'Sweep the field again', 'sim-btn-primary', () => {
        this.mapField();
        this.render();
        this.emit('mapped', { points: this.map.length });
      });
    }
  }

  private addBtn(bar: HTMLElement, label: string, cls: string, fn: () => void): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sim-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  /* ── view ── */

  protected render(): void {
    const isInsight = this.mode === 'insight';
    const isMap = this.mode === 'map';

    this.pressed('[data-sim-mode]', 'simMode', this.mode);
    this.text('[data-sim-lead]', LEAD[this.mode]);
    this.text('[data-sim-status]', STATUS[this.mode]);
    this.setAttribute('data-mode', this.mode);

    this.show('[data-sim-experiment]', !isInsight);
    this.show('[data-sim-insight]', isInsight);

    if (isInsight) {
      this.renderInsight();
      return;
    }

    const rate = this.last ? this.last.rate : BASE_RATE;
    this.text('[data-sim-rate]', `${rate.toFixed(0)} /s`);

    // Map view shows the ring; the two spot views show the electrode's record.
    this.show('[data-sim-mapwrap]', isMap);
    this.show('[data-sim-recordwrap]', !isMap);

    this.html('[data-sim-retina]', this.retinaSvg(isMap));
    if (!isMap) this.html('[data-sim-raster]', this.rasterSvg(rate));
    if (isMap) {
      this.html('[data-sim-mapplot]', this.mapSvg());
      this.show('[data-sim-map-empty]', this.map.length === 0);
    }

    this.text('[data-sim-retina-note]', this.retinaNote());
  }

  private retinaSvg(isMap: boolean): string {
    const spot = isMap
      ? '' // in the map view the single spot is meaningless — only the sweep matters
      : `<circle class="rf-spot" cx="${this.x.toFixed(1)}" cy="${this.y.toFixed(1)}" r="${RADIUS}"/>`;

    const where = isMap
      ? 'The small spot is being swept across the whole patch to map the field.'
      : `The light spot is at ${Math.round(this.x)}, ${Math.round(this.y)}. Click anywhere to move it and flash again.`;

    // The field is never drawn as a labelled diagram — it is only ever the
    // faint thing you are hunting for.
    return (
      `<svg class="rf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A patch of retina. ${where}">` +
      `<rect class="rf-bg" x="0" y="0" width="${W}" height="${H}"/>` +
      spot +
      `<circle class="rf-electrode" cx="${CX}" cy="${CY}" r="3"/>` +
      `<text class="rf-label" x="${CX + 8}" y="${CY + 4}">ELECTRODE</text>` +
      `</svg>`
    );
  }

  /** One second of the cell's output: 300 ms before the light, 400 ms of it,
   *  300 ms after. The ticks are what an audio monitor would have clicked at. */
  private rasterSvg(rate: number): string {
    const rows = 4;
    const ticks: string[] = [];
    for (let row = 0; row < rows; row++) {
      for (let t = 0; t < 1000; t += 4) {
        const during = t >= 300 && t < 700;
        const r = during ? rate : BASE_RATE;
        // Poisson-ish: fire when the seeded draw falls under the rate.
        if (noise(row * 977 + t * 3 + (this.history.length + 1) * 31) < (r * 4) / 1000) {
          const x = 8 + (t / 1000) * 304;
          const y = 10 + row * 13;
          ticks.push(`<line class="rf-tick" x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${y + 9}"/>`);
        }
      }
    }
    return (
      `<svg class="rf-svg" viewBox="0 0 320 74" role="img" aria-label="Four repeats of the cell's firing. The light is on for the shaded 400 milliseconds; it fires at ${rate.toFixed(
        0,
      )} per second during it against ${BASE_RATE} per second at rest.">` +
      `<rect class="rf-window" x="${8 + 0.3 * 304}" y="4" width="${0.4 * 304}" height="62"/>` +
      ticks.join('') +
      `<text class="rf-label" x="8" y="71">1 s</text>` +
      `<text class="rf-label" x="${8 + 0.5 * 304}" y="71" text-anchor="middle">LIGHT ON</text>` +
      `</svg>`
    );
  }

  private mapSvg(): string {
    if (!this.map.length) return '';
    // A small probe in the surround shifts the rate by a few spikes where the
    // same probe on the centre shifts it by forty. Scaling both against the
    // strongest reading and then compressing keeps the ring legible without
    // pretending the two effects are the same size.
    const strongest = Math.max(...this.map.map(p => Math.abs(p.rate - BASE_RATE)), 1);
    const dots = this.map
      .map(p => {
        const delta = p.rate - BASE_RATE;
        const strength = clamp(Math.abs(delta) / strongest, 0, 1) ** 0.45;
        const cls = delta > 0.6 ? 'rf-on' : delta < -0.6 ? 'rf-off' : 'rf-null';
        return `<circle class="rf-dot ${cls}" cx="${p.x}" cy="${p.y}" r="${(1.8 + strength * 4.6).toFixed(
          1,
        )}" opacity="${(0.2 + strength * 0.8).toFixed(2)}"/>`;
      })
      .join('');
    return `<svg class="rf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The mapped field: a filled disc where the small spot drove the cell, surrounded by a ring where it suppressed it.">${dots}</svg>`;
  }

  private retinaNote(): string {
    if (this.mode === 'map')
      return 'A filled centre with a ring around it that does the opposite — not a patch. That shape is why an even wash of light over both says almost nothing, while an edge laid across them says a great deal.';
    const last = this.last;
    if (!last) return 'Flash the spot and read the rate against its resting 12 per second.';
    const d = Math.hypot(last.x - CX, last.y - CY);
    if (d < 16) return 'On the centre: a small spot here drives the cell hard, well above its resting rate.';
    if (d < 45) return 'In the surround: the same light here pushes the cell below its resting rate.';
    return 'Outside the field entirely. The light is on and the cell has nothing to say about it.';
  }

  /* ── the insight ── */

  private renderInsight(): void {
    this.pressed('[data-sim-bright]', 'simBright', String(this.bright));

    const k = this.bright;
    const drive = GAIN * FLOOD.drive * k;
    const suppress = GAIN * FLOOD.suppress * k;
    const rate = clamp(BASE_RATE + GAIN * FLOOD.net * k, 0, MAX_RATE);

    // Bars share one scale — the drive at the brightest setting — so the two
    // stay the same length at every brightness and simply grow together.
    const full = GAIN * FLOOD.drive * 4;
    this.css('[data-sim-drivebar]', 'width', `${((drive / full) * 100).toFixed(1)}%`);
    this.css('[data-sim-suppressbar]', 'width', `${((suppress / full) * 100).toFixed(1)}%`);

    this.text('[data-sim-drivenum]', `+${drive.toFixed(0)}`);
    this.text('[data-sim-suppressnum]', `−${suppress.toFixed(0)}`);
    this.text('[data-sim-net]', `${rate.toFixed(0)} /s`);
    this.text('[data-sim-flood-rate]', `${rate.toFixed(0)} /s`);

    // The lit patch itself brightens with the setting, so the eye sees far more
    // light going in while the cell's output hardly stirs.
    const fill = k === 1 ? '#F6E7B8' : k === 2 ? '#FBEFC4' : '#FFF8D6';
    const el = this.q('[data-sim-flood-fill]');
    if (el) el.setAttribute('fill', fill);
    this.q('[data-sim-flood-svg]')?.setAttribute(
      'aria-label',
      `The whole patch flooded with light at ${k} times brightness. Centre excitation and surround inhibition both scale to it, so the cell still reports about ${rate.toFixed(
        0,
      )} per second against 12 at rest.`,
    );
  }
}

defineSim('retina-sim', RetinaSim);
