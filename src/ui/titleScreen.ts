/**
 * TitleScreen - the quiet front door (M7).
 *
 * One panel over the already-rendering ship interior: the name, a line of
 * fiction, and Begin. The Begin click is the user gesture that unlocks
 * audio (browser autoplay rules), so the callback receives it directly.
 */

export interface TitleScreenCallbacks {
  readonly dockedAt?: string | undefined;
  /** The player pressed Begin (a genuine user gesture). */
  onBegin(): void;
}

export class TitleScreen {
  private root: HTMLDivElement | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(callbacks: TitleScreenCallbacks, parent: HTMLElement = document.body): void {
    if (this.root) this.close();

    this.root = document.createElement('div');
    this.root.id = 'title';

    const panel = document.createElement('div');
    panel.className = 'panel';

    const name = document.createElement('h1');
    name.textContent = 'DRIFT';

    const tagline = document.createElement('p');
    tagline.className = 'tagline';
    tagline.textContent = 'The crew sleeps. The ship hums. Somebody has to do the rounds.';

    const begin = document.createElement('button');
    begin.className = 'begin';
    begin.type = 'button';
    begin.textContent = callbacks.dockedAt ? 'Continue' : 'Begin';
    if (callbacks.dockedAt) tagline.textContent = `Docked at ${callbacks.dockedAt}.`;
    begin.addEventListener('click', () => {
      const cb = callbacks;
      this.close();
      cb.onBegin();
    });

    panel.append(name, tagline, begin);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }
}
