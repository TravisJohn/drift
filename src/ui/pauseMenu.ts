/**
 * PauseMenu - Esc while roaming (M7). The simulation freezes underneath.
 *
 * Owns its key listener while open, like the other overlays: Esc resumes.
 * A small controls reminder lives here so the HUD can stay empty.
 */

export interface PauseMenuCallbacks {
  onResume(): void;
}

const CONTROLS: readonly (readonly [string, string])[] = [
  ['WASD', 'move'],
  ['Space / Shift', 'up & down'],
  ['Right mouse + drag', 'look around'],
  ['E', 'interact'],
  ['V', 'exterior view in flight'],
  ['Esc', 'pause / resume'],
  ['F2', 'performance readout'],
];

export class PauseMenu {
  private root: HTMLDivElement | null = null;
  private callbacks: PauseMenuCallbacks | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(callbacks: PauseMenuCallbacks, parent: HTMLElement = document.body): void {
    if (this.root) this.close();
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'pause';

    const panel = document.createElement('div');
    panel.className = 'panel';

    const title = document.createElement('h2');
    title.textContent = 'Paused';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'controls';
    for (const [keys, action] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span');
      k.className = 'keys';
      k.textContent = keys;
      const a = document.createElement('span');
      a.className = 'action';
      a.textContent = action;
      row.append(k, a);
      list.appendChild(row);
    }
    panel.appendChild(list);

    const resume = document.createElement('button');
    resume.className = 'resume';
    resume.type = 'button';
    resume.textContent = 'Resume';
    resume.addEventListener('click', () => this.requestResume());
    panel.appendChild(resume);

    this.root.appendChild(panel);
    parent.appendChild(this.root);
    document.addEventListener('keydown', this.onKeyDown);
  }

  /** Tear down without notifying (dispose path). Safe when closed. */
  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root?.remove();
    this.root = null;
    this.callbacks = null;
  }

  private requestResume(): void {
    const callbacks = this.callbacks;
    this.close();
    callbacks?.onResume();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.requestResume();
    }
  };
}
