/**
 * dashboardModel - what the ship dashboard shows, worked out from the
 * game's state. Pure: state in, plain display data out. The overlay
 * (dashboardOverlay.ts and its panels) only draws what this returns.
 *
 * The dashboard is the ship's command hub: navigation (set a course on the
 * star chart), cameras (the view from outside), the ship's compartments,
 * tactical (combat drills on the hologram) and training. Live journey and systems readouts sit beside all of them.
 */
import { journeySeconds } from '../content/destinations';
import type { DifficultyId } from '../combat/combatTypes';
import type { CabinPowerStatus } from '../world/ship/cabinLighting';
import type { RoomSpec } from '../content/shipLayout';
import { VESSEL_NAME, roomReadouts } from '../content/shipSystems';

/** How a readout should be coloured: steady, doing something, or resting. */
export type DashboardTone = 'ok' | 'active' | 'idle';

export interface DashboardRow {
  readonly label: string;
  readonly value: string;
  readonly tone: DashboardTone;
}

export interface DashboardRoom {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
}

/** One training module the dashboard can launch (the AWS entry point). */
export interface DashboardTraining {
  readonly id: string;
  readonly title: string;
}

/** A point on the star chart, 0..1 across and down. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** A place on the star chart. */
export interface DashboardPlace {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** Journey time from here, seconds (already scaled for this run). */
  readonly etaSeconds: number;
  /** CSS colour, e.g. "#7fd4e8". */
  readonly accent: string;
  readonly chart: ChartPoint;
}

export interface DashboardNavigation {
  /** True while docked: a course can be set. */
  readonly canSetCourse: boolean;
  /** One line under the chart: what the navigation computer is doing. */
  readonly status: string;
  /** Where the ship is, or is leaving. */
  readonly here: DashboardPlace;
  /** Places a course can be set for (never the one the ship is at). */
  readonly destinations: readonly DashboardPlace[];
  /** Where the ship is headed; null while docked. */
  readonly courseId: string | null;
  /** Where the ship is on the chart right now (on the route while underway). */
  readonly shipAt: ChartPoint;
}

export interface DashboardCamera {
  readonly id: 'exterior';
  readonly title: string;
  readonly detail: string;
}

/** A fight the tactical tab offers. */
export interface DashboardEngagement {
  readonly difficulty: DifficultyId;
  readonly title: string;
  readonly detail: string;
}

export interface DashboardData {
  readonly power: CabinPowerStatus;
  readonly vessel: string;
  readonly journey: readonly DashboardRow[];
  readonly systems: readonly DashboardRow[];
  readonly navigation: DashboardNavigation;
  readonly cameras: readonly DashboardCamera[];
  readonly rooms: readonly DashboardRoom[];
  readonly tactical: readonly DashboardEngagement[];
  readonly training: readonly DashboardTraining[];
}

export type DashboardPhase = 'docked' | 'departing' | 'cruising' | 'arriving';

/** The parts of a location the dashboard needs (see content/destinations.ts). */
export interface PlaceInput {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** Cruise seconds at scale 1. */
  readonly travelTime: number;
  readonly accentColor: number;
  readonly chart: ChartPoint;
}

export interface DashboardInput {
  readonly power: CabinPowerStatus;
  readonly rooms: readonly RoomSpec[];
  /** Cryo pods aboard (counted from the layout). */
  readonly podCount: number;
  readonly phase: DashboardPhase;
  /** Journey progress 0..1 (meaningful while cruising). */
  readonly progress: number;
  /** Every place on the chart. */
  readonly places: readonly PlaceInput[];
  /** Where the ship is, or last was. */
  readonly locationId: string;
  /** Where it is headed; null while docked. */
  readonly destinationId: string | null;
  /** Travel-time scale for this run (gameConfig.travel.cruiseScale). */
  readonly cruiseScale: number;
  readonly training: readonly DashboardTraining[];
}

const PHASE_LABEL: Record<DashboardPhase, string> = {
  docked: 'Docked',
  departing: 'Departing',
  cruising: 'Cruising',
  arriving: 'Arriving',
};

const REACTOR_LABEL: Record<DashboardPhase, string> = {
  docked: 'Low burn',
  departing: 'Ramping up',
  cruising: 'Cruise burn',
  arriving: 'Ramping down',
};

const CAMERAS: readonly DashboardCamera[] = [
  {
    id: 'exterior',
    title: 'Exterior orbit',
    detail: 'Hull camera on a slow orbit of the ship. Press V to come back in.',
  },
];

const ENGAGEMENTS: readonly DashboardEngagement[] = [
  {
    difficulty: 'rookie',
    title: 'Raider patrol · Rookie',
    detail: 'Three waves of light raiders. They shoot slowly and miss often.',
  },
  {
    difficulty: 'ace',
    title: 'Raider patrol · Ace',
    detail: 'The same patrol, tougher and sharper. Shields will not save you for long.',
  },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0xRRGGBB to a CSS colour. */
export function cssColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

function findPlace(places: readonly PlaceInput[], id: string): PlaceInput {
  const place = places.find((p) => p.id === id);
  if (!place) throw new Error(`dashboardModel: unknown place "${id}"`);
  return place;
}

function toPlace(place: PlaceInput, cruiseScale: number): DashboardPlace {
  return {
    id: place.id,
    name: place.name,
    blurb: place.blurb,
    etaSeconds: Math.round(journeySeconds(place.travelTime, cruiseScale)),
    accent: cssColor(place.accentColor),
    chart: place.chart,
  };
}

/** How far along the route the ship is: departure is the start, arrival the end. */
function routeFraction(phase: DashboardPhase, progress: number): number {
  if (phase === 'departing' || phase === 'docked') return 0;
  if (phase === 'arriving') return 1;
  return clamp01(progress);
}

function navigation(input: DashboardInput): DashboardNavigation {
  const here = toPlace(findPlace(input.places, input.locationId), input.cruiseScale);
  const course =
    input.phase !== 'docked' && input.destinationId !== null
      ? toPlace(findPlace(input.places, input.destinationId), input.cruiseScale)
      : null;
  const underway = course !== null;
  const t = routeFraction(input.phase, input.progress);
  return {
    canSetCourse: !underway,
    status: course
      ? `Autopilot engaged · bound for ${course.name}`
      : 'Docked · choose a destination and engage',
    here,
    destinations: input.places
      .filter((p) => p.id !== input.locationId)
      .map((p) => toPlace(p, input.cruiseScale)),
    courseId: course?.id ?? null,
    shipAt: course
      ? {
          x: here.chart.x + (course.chart.x - here.chart.x) * t,
          y: here.chart.y + (course.chart.y - here.chart.y) * t,
        }
      : here.chart,
  };
}

function journeyRows(input: DashboardInput): DashboardRow[] {
  const underway = input.phase !== 'docked';
  const locationName = findPlace(input.places, input.locationId).name;
  const rows: DashboardRow[] = [
    { label: 'Status', value: PHASE_LABEL[input.phase], tone: underway ? 'active' : 'ok' },
  ];
  if (!underway || input.destinationId === null) {
    rows.push({ label: 'Location', value: locationName, tone: 'ok' });
    rows.push({ label: 'Course', value: 'None set', tone: 'idle' });
    return rows;
  }
  rows.push({ label: 'From', value: locationName, tone: 'idle' });
  rows.push({
    label: 'To',
    value: findPlace(input.places, input.destinationId).name,
    tone: 'active',
  });
  const percent = Math.round(clamp01(input.progress) * 100);
  rows.push({
    label: 'Progress',
    // Departure and arrival are manoeuvres, not distance covered.
    value: input.phase === 'cruising' ? `${percent}%` : PHASE_LABEL[input.phase],
    tone: 'active',
  });
  return rows;
}

function systemRows(input: DashboardInput): DashboardRow[] {
  const underway = input.phase !== 'docked';
  return [
    {
      label: 'Autopilot',
      value: underway ? 'Engaged' : 'Standby',
      tone: underway ? 'active' : 'idle',
    },
    { label: 'Reactor', value: REACTOR_LABEL[input.phase], tone: underway ? 'active' : 'ok' },
    {
      label: 'Cryo',
      value: `${input.podCount} ${input.podCount === 1 ? 'pod' : 'pods'} · stable`,
      tone: 'ok',
    },
    { label: 'Life support', value: 'Nominal', tone: 'ok' },
    { label: 'Hull', value: 'Sealed', tone: 'ok' },
  ];
}

export function buildDashboardData(input: DashboardInput): DashboardData {
  return {
    vessel: VESSEL_NAME,
    power: input.power,
    journey: journeyRows(input),
    systems: systemRows(input),
    navigation: navigation(input),
    cameras: CAMERAS,
    tactical: ENGAGEMENTS,
    rooms: input.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      detail: roomReadouts[room.id],
    })),
    training: input.training,
  };
}
