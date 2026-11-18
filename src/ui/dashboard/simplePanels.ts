/**
 * The smaller dashboard tabs: cameras, the ship's compartments, training.
 *
 * Each is a list with one selected item. Cameras and training leave the
 * dashboard when used (the overlay closes first); the ship tab lights the
 * selected compartment on the hologram.
 */
import type {
  DashboardCamera,
  DashboardData,
  DashboardRoom,
  DashboardTraining,
} from '../dashboardModel';
import { type DashboardPanel, el, heading, wrapIndex } from './panel';

/** A selectable list: the shared behaviour of the three tabs below. */
abstract class ListPanel<T> implements DashboardPanel {
  abstract readonly id: DashboardPanel['id'];
  abstract readonly label: string;
  abstract readonly hint: string;
  readonly element: HTMLElement;
  protected readonly list: HTMLDivElement;
  protected items: readonly T[] = [];
  protected selected = 0;
  private itemEls: HTMLElement[] = [];

  constructor(className: string, title: string) {
    this.element = el('section', `tab-panel ${className}`);
    this.list = el('div', 'list');
    this.element.append(heading(title), this.list);
  }

  abstract update(data: DashboardData): void;
  abstract activate(): void;
  protected abstract renderItem(item: T): HTMLElement;

  move(step: number): void {
    if (this.items.length > 0) this.select(this.selected + step);
  }

  show(): void {
    if (this.items.length > 0) this.select(this.selected);
  }

  /** Rebuild the list from `items`, keeping the selection in range. */
  protected renderList(empty: string): void {
    this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1));
    this.itemEls = this.items.map((item, index) => {
      const node = this.renderItem(item);
      node.classList.add('item');
      node.addEventListener('mouseenter', () => this.select(index));
      node.addEventListener('click', () => {
        this.select(index);
        this.onClickItem();
      });
      return node;
    });
    this.list.replaceChildren(
      ...(this.itemEls.length > 0 ? this.itemEls : [el('div', 'empty', empty)]),
    );
    this.markSelected();
  }

  protected select(index: number): void {
    this.selected = wrapIndex(index, this.items.length);
    this.markSelected();
    this.onSelect(this.items[this.selected] as T);
  }

  /** A click on an item: by default, act on it. */
  protected onClickItem(): void {
    this.activate();
  }

  protected onSelect(_item: T): void {}

  private markSelected(): void {
    this.itemEls.forEach((node, i) => node.classList.toggle('selected', i === this.selected));
  }
}

export class CamerasPanel extends ListPanel<DashboardCamera> {
  readonly id = 'cameras';
  readonly label = 'Cameras';
  readonly hint = 'Enter go outside · V returns';

  constructor(
    data: DashboardData,
    private readonly onExteriorView: () => void,
  ) {
    super('cameras', 'Ship cameras');
    this.update(data);
  }

  update(data: DashboardData): void {
    this.items = data.cameras;
    this.renderList('No cameras online.');
  }

  activate(): void {
    if (this.items[this.selected]?.id === 'exterior') this.onExteriorView();
  }

  protected renderItem(camera: DashboardCamera): HTMLElement {
    const node = el('div', 'camera');
    const top = el('div', 'dest-top');
    top.append(el('span', 'dest-name', camera.title), el('span', 'eta live', 'Live'));
    node.append(top, el('div', 'dest-blurb', camera.detail), el('div', 'cta', 'Go outside ▸'));
    return node;
  }
}

export class ShipPanel extends ListPanel<DashboardRoom> {
  readonly id = 'ship';
  readonly label = 'Ship';
  readonly hint = '↑↓ compartment';
  private readonly detail: HTMLDivElement;

  constructor(
    data: DashboardData,
    private readonly onRoomSelected: (roomId: string) => void,
  ) {
    super('ship', 'Compartments');
    this.detail = el('div', 'detail');
    this.element.appendChild(this.detail);
    this.update(data);
  }

  update(data: DashboardData): void {
    // Compartments never change during play; only build the list once.
    if (this.items.length === data.rooms.length) return;
    this.items = data.rooms;
    this.renderList('No compartments.');
  }

  activate(): void {}

  /** Clicking a compartment only selects it. */
  protected override onClickItem(): void {}

  protected override onSelect(room: DashboardRoom): void {
    this.detail.textContent = room.detail;
    this.onRoomSelected(room.id);
  }

  protected renderItem(room: DashboardRoom): HTMLElement {
    return el('div', 'room', room.name);
  }
}

export class TrainingPanel extends ListPanel<DashboardTraining> {
  readonly id = 'training';
  readonly label = 'Training';
  readonly hint = 'Enter start module';

  constructor(
    data: DashboardData,
    private readonly onTraining: (moduleId: string) => void,
  ) {
    super('training', 'Training modules');
    this.update(data);
  }

  update(data: DashboardData): void {
    if (this.items.length === data.training.length && this.items.length > 0) return;
    this.items = data.training;
    this.renderList('No modules installed.');
  }

  activate(): void {
    const module = this.items[this.selected];
    if (module) this.onTraining(module.id);
  }

  protected renderItem(module: DashboardTraining): HTMLElement {
    return el('div', 'training', module.title);
  }
}
