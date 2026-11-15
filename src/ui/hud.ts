/**
 * Hud - the quiet in-game overlay: ship status line + interaction prompt.
 * Grows in M5 (subtitles for the ship AI). Plain DOM over the canvas.
 */

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly prompt: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'hud';

    this.status = document.createElement('div');
    this.status.className = 'ship-status';

    this.prompt = document.createElement('div');
    this.prompt.className = 'prompt';

    this.root.append(this.status, this.prompt);
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

  dispose(): void {
    this.root.remove();
  }
}
