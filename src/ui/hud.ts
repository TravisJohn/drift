/**
 * Hud - the quiet in-game overlay: ship status line, interaction prompt,
 * the ship AI's subtitles (M5) and an optional performance readout.
 * Plain DOM over the canvas.
 */

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly perf: HTMLDivElement;
  private lastSubtitle: string | null = null;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'hud';

    this.status = document.createElement('div');
    this.status.className = 'ship-status';

    this.prompt = document.createElement('div');
    this.prompt.className = 'prompt';

    this.subtitle = document.createElement('div');
    this.subtitle.className = 'subtitle';

    this.perf = document.createElement('div');
    this.perf.className = 'perf';

    this.root.append(this.status, this.prompt, this.subtitle, this.perf);
    parent.appendChild(this.root);
  }

  /** The top-left ship status line, e.g. "DOCKED — ANCHORAGE POINT". */
  setStatus(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  /** Show the interaction prompt (null hides it). */
  setPrompt(text: string | null): void {
    if (text === null) {
      this.prompt.classList.remove('visible');
    } else {
      this.prompt.textContent = text;
      this.prompt.classList.add('visible');
    }
  }

  /** Show an AI subtitle (null fades it out). Idempotent per frame. */
  setSubtitle(text: string | null): void {
    if (text === this.lastSubtitle) return;
    this.lastSubtitle = text;
    if (text === null) {
      this.subtitle.classList.remove('visible');
    } else {
      this.subtitle.textContent = text;
      this.subtitle.classList.add('visible');
    }
  }

  /**
   * Show the performance readout (frame rate, resolution, graphics chip);
   * null hides it. It answers "is it slow because of my machine?".
   */
  setPerf(text: string | null): void {
    this.perf.classList.toggle('visible', text !== null);
    if (text !== null) this.perf.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
