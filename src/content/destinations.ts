/**
 * Destinations - the places the ship can travel to (D4: content as data).
 *
 * The ship is always docked at exactly one location; the helm menu offers
 * the others. `travelTime` is the cruise phase in seconds (PRD: 60-120s),
 * scaled by `gameConfig.travel.cruiseScale` (shortened in debug runs).
 * `accentColor` seeds each location's look (skybox/body tint, M4).
 */

/** What the location looks like out the window (built in celestialBodies.ts). */
export type BodyKind = 'station' | 'ringed' | 'sun';

export interface BodySpec {
  readonly kind: BodyKind;
  /** World-units radius of the main body mesh. */
  readonly radius: number;
}

export interface LocationSpec {
  readonly id: string;
  readonly name: string;
  /** One line shown in the destination menu. */
  readonly blurb: string;
  /** Cruise duration in seconds at scale 1. */
  readonly travelTime: number;
  /** 0xRRGGBB accent used by the space scene (M4) and UI highlights. */
  readonly accentColor: number;
  /** The celestial body seen while docked here (M4). */
  readonly body: BodySpec;
  /** Where it sits on the dashboard's star chart: 0..1 across and down. */
  readonly chart: { readonly x: number; readonly y: number };
}

export const locations: readonly LocationSpec[] = [
  {
    id: 'anchorage',
    name: 'Anchorage Point',
    blurb: 'The long mooring. Quiet gantries and a dim service beacon.',
    travelTime: 75,
    accentColor: 0x8fa3b8,
    body: { kind: 'station', radius: 15 },
    chart: { x: 0.2, y: 0.6 },
  },
  {
    id: 'aurelia',
    name: 'Aurelia',
    blurb: 'An ice giant wrapped in pale rings. The survey is years overdue.',
    travelTime: 90,
    accentColor: 0x7fd4e8,
    body: { kind: 'ringed', radius: 30 },
    chart: { x: 0.76, y: 0.26 },
  },
  {
    id: 'cinder',
    name: 'Cinder',
    blurb: 'A dying red sun and the asteroid field it keeps.',
    travelTime: 70,
    accentColor: 0xe8865a,
    body: { kind: 'sun', radius: 34 },
    chart: { x: 0.7, y: 0.78 },
  },
];

/** Where the ship is docked when the game starts. */
export const START_LOCATION_ID = 'anchorage';

export function getLocation(id: string): LocationSpec {
  const location = locations.find((l) => l.id === id);
  if (!location) {
    throw new Error(`Unknown location id "${id}"`);
  }
  return location;
}

/** Content validation (mirrors validateLayout's fail-loud approach). */
export function validateLocations(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const loc of locations) {
    if (ids.has(loc.id)) problems.push(`duplicate location id "${loc.id}"`);
    ids.add(loc.id);
    if (loc.travelTime <= 0) problems.push(`location "${loc.id}" has non-positive travelTime`);
    if (!loc.name.trim()) problems.push(`location "${loc.id}" has an empty name`);
    if (loc.body.radius <= 0) problems.push(`location "${loc.id}" body has non-positive radius`);
    const { x, y } = loc.chart;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
      problems.push(`location "${loc.id}" chart position is off the chart`);
    }
  }
  if (locations.length < 2) problems.push('need at least 2 locations for travel to exist');
  if (!ids.has(START_LOCATION_ID)) problems.push(`start location "${START_LOCATION_ID}" missing`);
  return problems;
}
