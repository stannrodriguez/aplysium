/**
 * Shared plumbing for the experiment islands.
 *
 * Every experiment is a framework-free custom element attached to markup Astro
 * rendered on the server, so the panel reads before — and without —
 * JavaScript. What the elements all repeat lives here: reading the
 * server-rendered markup, writing to it without churning the DOM, wiring
 * controls, keeping timers, and reporting what the reader just did.
 *
 * A simulator subclasses `SimElement`, implements `setup()` and `render()`,
 * and registers itself with `defineSim()`.
 */

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Deterministic 0–1 noise from an integer seed — used instead of Math.random
 *  where a reader should be able to re-run a trial and get the same picture. */
export const noise = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export abstract class SimElement extends HTMLElement {
  /** Optional hook: onEvent(name, detail) each time the reader does something. */
  onEvent?: (name: string, detail: unknown) => void;

  private timeouts = new Set<number>();
  private intervals = new Set<number>();
  private frames = new Set<number>();

  connectedCallback(): void {
    this.setup();
    this.render();
  }

  disconnectedCallback(): void {
    this.timeouts.forEach(id => window.clearTimeout(id));
    this.intervals.forEach(id => window.clearInterval(id));
    this.frames.forEach(id => window.cancelAnimationFrame(id));
    this.timeouts.clear();
    this.intervals.clear();
    this.frames.clear();
    this.teardown();
  }

  /** Wire up controls. Called once, before the first render. */
  protected abstract setup(): void;

  /** Paint every readout from current state. Called after any state change. */
  protected abstract render(): void;

  /** Anything to release beyond the timers this class already tracks. */
  protected teardown(): void {}

  /* ── reading the markup ── */

  protected q<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return this.querySelector<T>(selector);
  }

  protected qa<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(this.querySelectorAll<T>(selector));
  }

  /* ── writing to it ── */

  /** Set text only when it changed, so live regions do not re-announce. */
  protected text(selector: string, value: string): void {
    const el = this.q(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }

  protected html(selector: string, value: string): void {
    const el = this.q(selector);
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }

  protected css(selector: string, prop: string, value: string): void {
    this.q(selector)?.style.setProperty(prop, value);
  }

  protected show(selector: string, visible: boolean): void {
    const el = this.q(selector);
    if (el) el.hidden = !visible;
  }

  protected disable(selector: string, disabled: boolean): void {
    const el = this.q<HTMLButtonElement>(selector);
    if (el) el.disabled = disabled;
  }

  /** Mark the one button in a group whose data value matches as pressed. */
  protected pressed(selector: string, dataKey: string, value: string | null): void {
    this.qa(selector).forEach(el =>
      el.setAttribute('aria-pressed', String(el.dataset[dataKey] === value)),
    );
  }

  /* ── controls ── */

  protected on<K extends keyof HTMLElementEventMap>(
    selector: string,
    type: K,
    handler: (el: HTMLElement, event: HTMLElementEventMap[K]) => void,
  ): void {
    this.qa(selector).forEach(el =>
      el.addEventListener(type, event => handler(el, event as HTMLElementEventMap[K])),
    );
  }

  /** Click handler for every element matching the selector. */
  protected onClick(selector: string, handler: (el: HTMLElement) => void): void {
    this.on(selector, 'click', el => handler(el));
  }

  /* ── timers, all released on disconnect ── */

  protected delay(ms: number, fn: () => void): number {
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
    return id;
  }

  protected every(ms: number, fn: () => void): number {
    const id = window.setInterval(fn, ms);
    this.intervals.add(id);
    return id;
  }

  protected frame(fn: (t: number) => void): number {
    const id = window.requestAnimationFrame(t => {
      this.frames.delete(id);
      fn(t);
    });
    this.frames.add(id);
    return id;
  }

  protected cancel(id: number): void {
    window.clearTimeout(id);
    this.timeouts.delete(id);
  }

  protected cancelInterval(id: number): void {
    window.clearInterval(id);
    this.intervals.delete(id);
  }

  protected cancelFrame(id: number): void {
    window.cancelAnimationFrame(id);
    this.frames.delete(id);
  }

  /* ── reporting ── */

  /** Flash a class on an element for a moment — the visual "that registered". */
  protected pulse(selector: string, className = 'is-flash', ms = 380): void {
    const el = this.q(selector);
    if (!el) return;
    el.classList.add(className);
    this.delay(ms, () => el.classList.remove(className));
  }

  /** Tell the page what the reader just did. */
  protected emit(name: string, detail: unknown = null): void {
    this.onEvent?.(name, detail);
    this.dispatchEvent(new CustomEvent('sim:event', { detail: { name, detail }, bubbles: true }));
  }
}

/** Register a simulator element, tolerating a second import of the same module. */
export function defineSim(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
