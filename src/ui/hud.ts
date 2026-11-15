/**
 * Hud - the quiet in-game overlay: ship status line, interaction prompt
 * and the ship AI's subtitles (M5). Plain DOM over the canvas.
 */

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
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

    this.root.append(this.status, this.prompt, this.subtitle);
    parent.appendChild(this.root);
  }

  /** The top-left ship status line, e.g. "DOCKED — ANCHORAGE POINT". */
  setStatus(text: string): void {
    this.status.textContent = text;
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

  dispose(): void {
    this.root.remove();
  }
}
