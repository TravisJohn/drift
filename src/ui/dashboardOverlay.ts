/**
 * DashboardOverlay - the holographic panels of the ship dashboard.
 *
 * Two translucent panels float either side of the view (the 3D hologram of
 * the ship sits between them, drawn by the game): journey and systems on
 * the left; compartments and training on the right.
 *
 * Keyboard: W/S or arrows pick a compartment, T or Enter opens training,
 * Esc or E closes. Mouse: hover picks, click opens. The overlay owns its
 * own key listener while open so its keys never leak into gameplay.
 */
import type { DashboardData, DashboardRow } from './dashboardModel';

export interface DashboardCallbacks {
  /** A compartment was picked (so the hologram can light it up). */
  onRoomSelected(roomId: string): void;
  /** The player asked to start a training module. */
  onTraining(moduleId: string): void;
  /** The player closed the dashboard. */
  onClose(): void;
}

export class DashboardOverlay {
  private root: HTMLDivElement | null = null;
  private callbacks: DashboardCallbacks | null = null;
  private data: DashboardData | null = null;
  private selectedRoom = 0;
  private journeyBody: HTMLDivElement | null = null;
  private systemsBody: HTMLDivElement | null = null;
  private detail: HTMLDivElement | null = null;
  private roomItems: HTMLDivElement[] = [];

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(
    data: DashboardData,
    callbacks: DashboardCallbacks,
    parent: HTMLElement = document.body,
  ): void {
    if (this.root) this.close();
    if (data.rooms.length === 0) {
      throw new Error('DashboardOverlay: no compartments to show');
    }
    this.data = data;
    this.callbacks = callbacks;
    this.selectedRoom = 0;

    this.root = document.createElement('div');
    this.root.id = 'dashboard';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `Ship dashboard · ${data.vessel}`;

    // --- Left: journey and systems (live values) ---
    const left = this.panel('left');
    left.appendChild(this.heading('Journey'));
    this.journeyBody = document.createElement('div');
    left.appendChild(this.journeyBody);
    left.appendChild(this.heading('Systems'));
    this.systemsBody = document.createElement('div');
    left.appendChild(this.systemsBody);

    // --- Right: compartments and training ---
    const right = this.panel('right');
    right.appendChild(this.heading('Compartments'));
    this.roomItems = data.rooms.map((room, index) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.textContent = room.name;
      item.addEventListener('mouseenter', () => this.selectRoom(index));
      right.appendChild(item);
      return item;
    });
    this.detail = document.createElement('div');
    this.detail.className = 'detail';
    right.appendChild(this.detail);

    right.appendChild(this.heading('Training'));
    if (data.training.length === 0) {
      const none = document.createElement('div');
      none.className = 'detail';
      none.textContent = 'No modules installed.';
      right.appendChild(none);
    }
    for (const module of data.training) {
      const item = document.createElement('div');
      item.className = 'item training';
      item.textContent = module.title;
      item.addEventListener('click', () => this.startTraining(module.id));
      right.appendChild(item);
    }

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.textContent =
      data.training.length > 0
        ? '↑↓ compartment · T training · Esc close'
        : '↑↓ compartment · Esc close';

    this.root.append(title, left, right, footer);
    parent.appendChild(this.root);
    document.addEventListener('keydown', this.onKeyDown);
    this.renderLive();
    this.selectRoom(0);
  }

  /** Refresh the live readouts (journey, systems) while open. */
  update(data: DashboardData): void {
    if (!this.root) return;
    this.data = data;
    this.renderLive();
  }

  /** Remove the overlay without telling anyone (the caller knows). */
  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root?.remove();
    this.root = null;
    this.callbacks = null;
    this.data = null;
    this.journeyBody = null;
    this.systemsBody = null;
    this.detail = null;
    this.roomItems = [];
  }

  private panel(side: 'left' | 'right'): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = `holo ${side}`;
    return panel;
  }

  private heading(text: string): HTMLHeadingElement {
    const heading = document.createElement('h3');
    heading.textContent = text;
    return heading;
  }

  private renderLive(): void {
    if (!this.data || !this.journeyBody || !this.systemsBody) return;
    this.journeyBody.replaceChildren(...this.data.journey.map((row) => this.row(row)));
    this.systemsBody.replaceChildren(...this.data.systems.map((row) => this.row(row)));
  }

  private row(row: DashboardRow): HTMLDivElement {
    const line = document.createElement('div');
    line.className = 'row';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = row.label;
    const value = document.createElement('span');
    value.className = `value ${row.tone}`;
    value.textContent = row.value;
    line.append(label, value);
    return line;
  }

  private selectRoom(index: number): void {
    if (!this.data || !this.callbacks) return;
    const count = this.data.rooms.length;
    this.selectedRoom = ((index % count) + count) % count; // wraps both ways
    const room = this.data.rooms[this.selectedRoom];
    if (!room) return;
    this.roomItems.forEach((item, i) => item.classList.toggle('selected', i === this.selectedRoom));
    if (this.detail) this.detail.textContent = room.detail;
    this.callbacks.onRoomSelected(room.id);
  }

  private startTraining(moduleId: string): void {
    const callbacks = this.callbacks;
    this.close();
    callbacks?.onTraining(moduleId);
  }

  private requestClose(): void {
    const callbacks = this.callbacks;
    this.close();
    callbacks?.onClose();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A held key repeats: the E that opened the dashboard must not close it.
    if (event.repeat) return;
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.selectRoom(this.selectedRoom - 1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.selectRoom(this.selectedRoom + 1);
        break;
      case 'KeyT':
      case 'Enter': {
        const first = this.data?.training[0];
        if (first) this.startTraining(first.id);
        break;
      }
      case 'Escape':
      case 'KeyE':
        this.requestClose();
        break;
      default:
        return;
    }
    event.preventDefault();
  };
}
