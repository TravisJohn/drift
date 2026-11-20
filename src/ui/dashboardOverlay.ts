/**
 * DashboardOverlay - the ship's holographic command dashboard.
 *
 * The 3D hologram of the ship floats in the middle (drawn by the game).
 * Around it: a status column on the left (live journey and systems) and a
 * command panel on the right with five tabs - Navigation (star chart, set
 * course), Cameras (go outside), Ship (compartments, lit on the hologram),
 * Tactical (combat drills) and Training.
 *
 * Keyboard: 1-5 or A/D (←→) switch tabs; W/S (↑↓) move the selection;
 * Enter acts on it; T starts training from any tab; Esc or E closes.
 * Mouse: click a tab, hover or click an item, or use its button. The
 * overlay owns its own key listener while open so its keys never leak
 * into gameplay. Leaving for training or the outside view closes the
 * overlay first and reports only that action, not a close.
 */
import type { DashboardData, DashboardRow } from './dashboardModel';
import { NavigationPanel } from './dashboard/navigationPanel';
import {
  type DashboardPanel,
  type DashboardTabId,
  el,
  heading,
  wrapIndex,
} from './dashboard/panel';
import {
  CamerasPanel,
  ShipPanel,
  TacticalPanel,
  TrainingPanel,
  type PowerCommand,
} from './dashboard/simplePanels';
import type { DifficultyId } from '../combat/combatTypes';

export type { DashboardTabId } from './dashboard/panel';

export interface DashboardCallbacks {
  onPowerCommand(command: PowerCommand): void;
  /** A compartment was picked (lit on the hologram); null when none is. */
  onRoomSelected(roomId: string | null): void;
  /** Engage a course (only offered while docked). The dashboard has closed. */
  onSetCourse(destinationId: string): void;
  /** Go outside: the exterior camera. The dashboard has closed. */
  onExteriorView(): void;
  /** Start a tactical fight. The dashboard has closed. */
  onCombat(difficulty: DifficultyId): void;
  /** Start a training module. The dashboard has closed. */
  onTraining(moduleId: string): void;
  /** The player closed the dashboard. */
  onClose(): void;
}

const TAB_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
};

export class DashboardOverlay {
  private root: HTMLDivElement | null = null;
  private callbacks: DashboardCallbacks | null = null;
  private panels: DashboardPanel[] = [];
  private tabs: HTMLButtonElement[] = [];
  private active = 0;
  private journeyBody: HTMLDivElement | null = null;
  private systemsBody: HTMLDivElement | null = null;
  private footer: HTMLDivElement | null = null;
  private data: DashboardData | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The tab now showing (for the game and tests). */
  get activeTab(): DashboardTabId | null {
    return this.panels[this.active]?.id ?? null;
  }

  open(
    data: DashboardData,
    callbacks: DashboardCallbacks,
    parent: HTMLElement = document.body,
    tab: DashboardTabId = 'navigation',
  ): void {
    if (this.root) this.close();
    if (data.rooms.length === 0) {
      throw new Error('DashboardOverlay: no compartments to show');
    }
    this.data = data;
    this.callbacks = callbacks;

    this.panels = [
      new NavigationPanel(data, (id) => this.leave((c) => c.onSetCourse(id))),
      new CamerasPanel(data, () => this.leave((c) => c.onExteriorView())),
      new ShipPanel(
        data,
        (id) => this.callbacks?.onRoomSelected(id),
        (command) => this.callbacks?.onPowerCommand(command),
      ),
      new TacticalPanel(data, (difficulty) => this.leave((c) => c.onCombat(difficulty))),
      new TrainingPanel(data, (id) => this.leave((c) => c.onTraining(id))),
    ];

    this.root = el('div');
    this.root.id = 'dashboard';

    const header = el('div', 'header');
    header.append(el('div', 'title', `Command deck · ${data.vessel}`));
    const tabBar = el('div', 'tabs');
    tabBar.setAttribute('role', 'tablist');
    this.tabs = this.panels.map((panel, index) => {
      const button = el('button', 'tab');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.append(el('span', 'key', String(index + 1)), el('span', '', panel.label));
      button.addEventListener('click', () => this.showTab(index));
      tabBar.appendChild(button);
      return button;
    });
    header.appendChild(tabBar);

    // --- Left: live status ---
    const status = el('div', 'holo left');
    this.journeyBody = el('div');
    this.systemsBody = el('div');
    status.append(heading('Journey'), this.journeyBody, heading('Systems'), this.systemsBody);

    // --- Right: the command panel, one tab at a time ---
    const command = el('div', 'holo right');
    for (const panel of this.panels) command.appendChild(panel.element);

    this.footer = el('div', 'footer');
    this.root.append(header, status, command, this.footer);
    parent.appendChild(this.root);
    document.addEventListener('keydown', this.onKeyDown);
    this.renderLive();
    this.showTab(
      Math.max(
        0,
        this.panels.findIndex((p) => p.id === tab),
      ),
    );
  }

  /** Refresh the live readouts and every tab while open. */
  update(data: DashboardData): void {
    if (!this.root) return;
    this.data = data;
    this.renderLive();
    for (const panel of this.panels) panel.update(data);
    this.renderFooter();
  }

  /** Remove the overlay without telling anyone (the caller knows). */
  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root?.remove();
    this.root = null;
    this.callbacks = null;
    this.panels = [];
    this.tabs = [];
    this.journeyBody = null;
    this.systemsBody = null;
    this.footer = null;
    this.data = null;
  }

  private showTab(index: number): void {
    if (!this.callbacks) return;
    this.active = wrapIndex(index, this.panels.length);
    this.panels.forEach((panel, i) => {
      panel.element.hidden = i !== this.active;
      this.tabs[i]?.classList.toggle('active', i === this.active);
      this.tabs[i]?.setAttribute('aria-selected', String(i === this.active));
    });
    const panel = this.panels[this.active];
    // Only the ship tab lights a compartment on the hologram.
    if (panel?.id !== 'ship') this.callbacks.onRoomSelected(null);
    panel?.show();
    this.renderFooter();
  }

  /** Close the overlay, then report an action that takes the player elsewhere. */
  private leave(action: (callbacks: DashboardCallbacks) => void): void {
    const callbacks = this.callbacks;
    this.close();
    if (callbacks) action(callbacks);
  }

  private requestClose(): void {
    this.leave((c) => c.onClose());
  }

  private renderLive(): void {
    if (!this.data || !this.journeyBody || !this.systemsBody) return;
    this.journeyBody.replaceChildren(...this.data.journey.map((row) => this.row(row)));
    this.systemsBody.replaceChildren(...this.data.systems.map((row) => this.row(row)));
  }

  private renderFooter(): void {
    const panel = this.panels[this.active];
    if (this.footer && panel)
      this.footer.textContent = `1-${this.panels.length} tabs · ${panel.hint} · Esc close`;
  }

  private row(row: DashboardRow): HTMLDivElement {
    const line = el('div', 'row');
    line.append(el('span', 'label', row.label), el('span', `value ${row.tone}`, row.value));
    return line;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A held key repeats: the E that opened the dashboard must not close it.
    if (event.repeat) return;
    const panel = this.panels[this.active];
    const tabKey = TAB_KEYS[event.code];
    if (tabKey !== undefined) {
      this.showTab(tabKey);
    } else {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.showTab(this.active - 1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.showTab(this.active + 1);
          break;
        case 'ArrowUp':
        case 'KeyW':
          panel?.move(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          panel?.move(1);
          break;
        case 'Enter':
          if (event.target instanceof HTMLButtonElement && event.target.closest('.power-controls'))
            return;
          panel?.activate();
          this.renderFooter();
          break;
        case 'KeyT': {
          const first = this.data?.training[0];
          if (first) this.leave((c) => c.onTraining(first.id));
          break;
        }
        case 'Escape':
        case 'KeyE':
          this.requestClose();
          break;
        default:
          return;
      }
    }
    event.preventDefault();
  };
}
