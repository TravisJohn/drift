/**
 * PuzzleOverlay - the terminal's modal panel, hosting a PuzzleModule (M5).
 *
 * The overlay owns the chrome (panel, title, footer, Esc-to-close) and the
 * key listener while open, like DestinationMenu; the mounted module owns
 * everything inside the body. Closing always unmounts the module.
 */
import type { PuzzleModule } from '../learning/puzzleModule';

export interface PuzzleOverlayCallbacks {
  /** Player closed the overlay (Esc or the module asked). */
  onClose(): void;
  /** The module reported completion (fires before the overlay closes). */
  onComplete(): void;
}

export class PuzzleOverlay {
  private root: HTMLDivElement | null = null;
  private module: PuzzleModule | null = null;
  private callbacks: PuzzleOverlayCallbacks | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(
    module: PuzzleModule,
    callbacks: PuzzleOverlayCallbacks,
    parent: HTMLElement = document.body,
  ): void {
    if (this.root) this.close();
    this.module = module;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'puzzle';

    const panel = document.createElement('div');
    panel.className = 'panel';

    const title = document.createElement('h2');
    title.textContent = module.title;
    panel.appendChild(title);

    const body = document.createElement('div');
    body.className = 'body';
    panel.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.textContent = 'Esc close';
    panel.appendChild(footer);

    this.root.appendChild(panel);
    parent.appendChild(this.root);
    document.addEventListener('keydown', this.onKeyDown);

    module.mount(body, {
      close: () => this.requestClose(),
      complete: () => {
        this.callbacks?.onComplete();
        this.requestClose();
      },
    });
  }

  /** Tear down DOM, listener and the mounted module. Safe when closed. */
  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.module?.unmount();
    this.module = null;
    this.root?.remove();
    this.root = null;
    this.callbacks = null;
  }

  /** Close via the player/module (notifies the game), not via dispose. */
  private requestClose(): void {
    const callbacks = this.callbacks;
    this.close();
    callbacks?.onClose();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.requestClose();
    }
  };
}
