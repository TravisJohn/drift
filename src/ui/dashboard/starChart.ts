/**
 * The navigation tab's star chart: an SVG of the known places, where the
 * ship is, and the course it is on (or the one being considered).
 *
 * Pure drawing: data in, a fresh SVG out. Redrawn whenever the navigation
 * data or the selection changes; it is a handful of shapes.
 */
import type { ChartPoint, DashboardNavigation, DashboardPlace } from '../dashboardModel';

const SVG = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 190;
/** Background specks, fixed so the chart looks the same every time. */
const SPECKS = 46;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const px = (p: ChartPoint) => ({ x: p.x * W, y: p.y * H });

/** A repeatable pseudo-random number in [0, 1) for speck `i`. */
function speck(i: number, salt: number): number {
  const s = Math.sin(i * 91.7 + salt * 47.3) * 43758.5453;
  return s - Math.floor(s);
}

function placeMark(
  place: DashboardPlace,
  role: 'here' | 'course' | 'chosen' | 'other',
): SVGGElement {
  const { x, y } = px(place.chart);
  const group = svg('g', { class: `place ${role}`, 'data-id': place.id });
  if (role === 'here' || role === 'course' || role === 'chosen') {
    group.appendChild(svg('circle', { class: 'ring', cx: x, cy: y, r: 11, stroke: place.accent }));
  }
  group.appendChild(svg('circle', { class: 'body', cx: x, cy: y, r: 4.5, fill: place.accent }));
  const label = svg('text', { x: x + 14, y: y + 4, class: 'label' });
  label.textContent = place.name;
  group.appendChild(label);
  return group;
}

/**
 * Draw the chart. `chosenId` is the destination highlighted in the list
 * while docked (its route shows dashed); underway, the course shows solid
 * with the ship on it.
 */
export function drawStarChart(nav: DashboardNavigation, chosenId: string | null): SVGSVGElement {
  const root = svg('svg', { class: 'star-chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });
  root.setAttribute('aria-label', 'Star chart');

  // Grid and range rings centred on the ship.
  const grid = svg('g', { class: 'grid' });
  for (let x = 40; x < W; x += 40) grid.appendChild(svg('line', { x1: x, y1: 0, x2: x, y2: H }));
  for (let y = 38; y < H; y += 38) grid.appendChild(svg('line', { x1: 0, y1: y, x2: W, y2: y }));
  const ship = px(nav.shipAt);
  for (const r of [40, 80, 120]) {
    grid.appendChild(svg('circle', { class: 'range', cx: ship.x, cy: ship.y, r }));
  }
  root.appendChild(grid);

  const specks = svg('g', { class: 'specks' });
  for (let i = 0; i < SPECKS; i++) {
    specks.appendChild(
      svg('circle', { cx: speck(i, 1) * W, cy: speck(i, 2) * H, r: 0.4 + speck(i, 3) * 0.8 }),
    );
  }
  root.appendChild(specks);

  // The route: the course while underway, else the destination being considered.
  const routeTo = nav.destinations.find((d) => d.id === (nav.courseId ?? chosenId));
  if (routeTo) {
    const a = px(nav.here.chart);
    const b = px(routeTo.chart);
    root.appendChild(
      svg('line', {
        class: nav.courseId ? 'route locked' : 'route',
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      }),
    );
  }

  root.appendChild(placeMark(nav.here, nav.courseId ? 'other' : 'here'));
  for (const place of nav.destinations) {
    const role = place.id === nav.courseId ? 'course' : place.id === chosenId ? 'chosen' : 'other';
    root.appendChild(placeMark(place, role));
  }

  // The ship itself: a small chevron, pointing along the route when underway.
  const angle = routeTo
    ? (Math.atan2(px(routeTo.chart).y - ship.y, px(routeTo.chart).x - ship.x) * 180) / Math.PI
    : 0;
  const marker = svg('g', {
    class: 'ship-marker',
    transform: `translate(${ship.x} ${ship.y}) rotate(${nav.courseId ? angle : -90})`,
  });
  marker.appendChild(svg('path', { d: 'M 7 0 L -5 -4.5 L -2.5 0 L -5 4.5 Z' }));
  root.appendChild(marker);
  return root;
}
