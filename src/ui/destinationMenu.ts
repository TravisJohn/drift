/**
 * DestinationMenu - the helm's "set course" overlay.
 *
 * Keyboard: W/S or arrows move the highlight, Enter/E engages, Esc cancels.
 * Mouse: hover highlights, click engages. The menu owns its own key
 * listener while open so menu keys never leak into gameplay.
 */
import type { LocationSpec } from '../content/destinations';

export interface DestinationMenuCallbacks {
  onSelect(destinationId: string): void;
  onCancel(): void;
}

export class DestinationMenu {
  private root: HTMLDivElement | null = null;
  private items: LocationSpec[] = [];
  private selectedIndex = 0;
  private callbacks: DestinationMenuCallbacks | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(
    destinations: readonly LocationSpec[],
    callbacks: DestinationMenuCallbacks,
    parent: HTMLElement = document.body,
  ): void {
    if (this.root) this.close();
    if (destinations.length === 0) {
      throw new Error('DestinationMenu: no destinations to show');
    }
    this.items = [...destinations];
    this.callbacks = callbacks;
    this.selectedIndex = 0;

    this.root = document.createElement('div');
    this.root.id = 'menu';

    const panel = document.createElement('div');
    panel.className = 'panel';

    const title = document.createElement('h2');
    title.textContent = 'Set course';
    panel.appendChild(title);

    this.items.forEach((loc, index) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.dataset['index'] = String(index);

      const eta = document.createElement('span');
      eta.className = 'eta';
      eta.textContent = `ETA ${Math.round(loc.travelTime)}s`;

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = loc.name;
      name.appendChild(eta);

      const blurb = document.createElement('div');
      blurb.className = 'blurb';
      blurb.textContent = loc.blurb;

      item.append(name, blurb);
      item.addEventListener('mouseenter', () => this.select(index));
      item.addEventListener('click', () => this.engage());
      panel.appendChild(item);
    });

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.textContent = '↑↓ select · Enter engage · Esc cancel';
    panel.appendChild(footer);

    this.root.appendChild(panel);
    parent.appendChild(this.root);
    document.addEventListener('keydown', this.onKeyDown);
    this.applySelection();
  }

  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root?.remove();
    this.root = null;
    this.callbacks = null;
  }

  private select(index: number): void {
    this.selectedIndex = (index + this.items.length) % this.items.length;
    this.applySelection();
  }

  private applySelection(): void {
    if (!this.root) return;
    this.root.querySelectorAll<HTMLElement>('.item').forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
    });
  }

  private engage(): void {
    const choice = this.items[this.selectedIndex];
    const callbacks = this.callbacks;
    if (!choice || !callbacks) return;
    this.close();
    callbacks.onSelect(choice.id);
  }

  private cancel(): void {
    const callbacks = this.callbacks;
    this.close();
    callbacks?.onCancel();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.select(this.selectedIndex + 1);
        break;
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault();
        this.select(this.selectedIndex - 1);
        break;
      case 'Enter':
      case 'KeyE':
        e.preventDefault();
        this.engage();
        break;
      case 'Escape':
        e.preventDefault();
        this.cancel();
        break;
    }
  };
}
