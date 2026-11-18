/**
 * Navigation tab: the star chart and the list of destinations.
 *
 * Docked: pick a destination (hover, arrows or click) and engage (Enter,
 * double-click or the Engage button). Underway the course is locked and
 * the chart follows the ship along its route.
 */
import type { DashboardData, DashboardNavigation } from '../dashboardModel';
import { type DashboardPanel, el, heading, wrapIndex } from './panel';
import { drawStarChart } from './starChart';

export class NavigationPanel implements DashboardPanel {
  readonly id = 'navigation';
  readonly label = 'Navigation';
  readonly element: HTMLElement;
  private readonly chart: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly engage: HTMLButtonElement;
  private nav: DashboardNavigation;
  private chosen = 0;

  constructor(
    data: DashboardData,
    private readonly onSetCourse: (destinationId: string) => void,
  ) {
    this.nav = data.navigation;
    this.element = el('section', 'tab-panel navigation');
    this.chart = el('div', 'chart-frame');
    this.status = el('div', 'nav-status');
    this.list = el('div', 'destinations');
    this.engage = el('button', 'engage');
    this.engage.type = 'button';
    this.engage.addEventListener('click', () => this.activate());
    this.element.append(heading('Star chart'), this.chart, this.status, this.list, this.engage);
    this.render();
  }

  get hint(): string {
    return this.nav.canSetCourse ? '↑↓ destination · Enter engage' : 'Course locked until arrival';
  }

  update(data: DashboardData): void {
    const chosenId = this.chosenId();
    this.nav = data.navigation;
    const index = this.nav.destinations.findIndex((d) => d.id === chosenId);
    this.chosen = index >= 0 ? index : 0;
    this.render();
  }

  move(step: number): void {
    if (!this.nav.canSetCourse || this.nav.destinations.length === 0) return;
    this.choose(this.chosen + step);
  }

  activate(): void {
    const id = this.chosenId();
    if (this.nav.canSetCourse && id) this.onSetCourse(id);
  }

  show(): void {
    this.render();
  }

  private chosenId(): string | null {
    return this.nav.destinations[this.chosen]?.id ?? null;
  }

  private choose(index: number): void {
    this.chosen = wrapIndex(index, this.nav.destinations.length);
    this.render();
  }

  private render(): void {
    const nav = this.nav;
    // Underway the course is what matters; docked, the one being considered.
    const shownId = nav.courseId ?? this.chosenId();
    this.chart.replaceChildren(drawStarChart(nav, nav.canSetCourse ? shownId : null));
    this.status.textContent = nav.status;
    this.status.classList.toggle('active', !nav.canSetCourse);

    this.list.replaceChildren(
      ...nav.destinations.map((place, index) => {
        const item = el('div', 'item destination');
        item.style.setProperty('--accent', place.accent);
        const top = el('div', 'dest-top');
        top.append(
          el('span', 'dest-name', place.name),
          el('span', 'eta', `ETA ${place.etaSeconds}s`),
        );
        item.append(top, el('div', 'dest-blurb', place.blurb));
        const selected = nav.canSetCourse ? index === this.chosen : place.id === nav.courseId;
        item.classList.toggle('selected', selected);
        item.classList.toggle('locked', !nav.canSetCourse);
        if (nav.canSetCourse) {
          item.addEventListener('mouseenter', () => {
            if (this.chosen !== index) this.choose(index);
          });
          // Only redraw on a real change, so a double-click lands on the same item.
          item.addEventListener('click', () => {
            if (this.chosen !== index) this.choose(index);
          });
          item.addEventListener('dblclick', () => this.activate());
        }
        return item;
      }),
    );

    const target = nav.destinations[this.chosen];
    this.engage.disabled = !nav.canSetCourse || !target;
    this.engage.textContent =
      nav.canSetCourse && target ? `Engage · ${target.name}` : 'Autopilot engaged';
  }
}
