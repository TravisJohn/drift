/**
 * dashboardModel - what the ship dashboard shows, worked out from the
 * game's state. Pure: state in, plain display data out. The overlay
 * (dashboardOverlay.ts) only draws what this returns.
 */
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

export interface DashboardData {
  readonly vessel: string;
  readonly journey: readonly DashboardRow[];
  readonly systems: readonly DashboardRow[];
  readonly rooms: readonly DashboardRoom[];
  readonly training: readonly DashboardTraining[];
}

export type DashboardPhase = 'docked' | 'departing' | 'cruising' | 'arriving';

export interface DashboardInput {
  readonly rooms: readonly RoomSpec[];
  /** Cryo pods aboard (counted from the layout). */
  readonly podCount: number;
  readonly phase: DashboardPhase;
  /** Journey progress 0..1 (meaningful while cruising). */
  readonly progress: number;
  /** Where the ship is, or last was. */
  readonly locationName: string;
  /** Where it is headed; null while docked. */
  readonly destinationName: string | null;
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

function journeyRows(input: DashboardInput): DashboardRow[] {
  const underway = input.phase !== 'docked';
  const rows: DashboardRow[] = [
    { label: 'Status', value: PHASE_LABEL[input.phase], tone: underway ? 'active' : 'ok' },
  ];
  if (!underway || input.destinationName === null) {
    rows.push({ label: 'Location', value: input.locationName, tone: 'ok' });
    rows.push({ label: 'Course', value: 'None set', tone: 'idle' });
    return rows;
  }
  rows.push({ label: 'From', value: input.locationName, tone: 'idle' });
  rows.push({ label: 'To', value: input.destinationName, tone: 'active' });
  const percent = Math.round(Math.min(1, Math.max(0, input.progress)) * 100);
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
    journey: journeyRows(input),
    systems: systemRows(input),
    rooms: input.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      detail: roomReadouts[room.id],
    })),
    training: input.training,
  };
}
