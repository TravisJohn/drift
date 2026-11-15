/**
 * TravelDirector - turns the ship's journey state into visual intent (M4).
 *
 * Deliberately visuals-only (logged deviation, M3): ShipState owns the
 * travel timeline; this module just reads a snapshot of it and answers
 * "how fast should space drift, how bright are the engines, and which
 * celestial bodies are visible right now". Pure TypeScript, no Three.js.
 */
import type { ShipPhase } from '../state/shipState';

/** The slice of ShipState the director needs (matches its getters). */
export interface TravelShipSnapshot {
  readonly phase: ShipPhase;
  /** 0..1 within the current phase. */
  readonly phaseProgress: number;
  readonly locationId: string;
  readonly destinationId: string | null;
}

export interface TravelView {
  /** 0..1 of full cruise speed; drives star drift. */
  readonly driftSpeed: number;
  /** 0..1 engine glow on the ship's exterior. */
  readonly engineIntensity: number;
  /** The body of the location we are docked at / leaving. */
  readonly currentBodyId: string;
  /** 1 = docked alongside it, 0 = gone behind us. */
  readonly currentBodyPresence: number;
  /** The body we are arriving at (null outside the arriving phase). */
  readonly destinationBodyId: string | null;
  /** 0 = still a point ahead, 1 = alongside. */
  readonly destinationBodyPresence: number;
}

/** Hermite smoothstep - soft ramps for departures and arrivals. */
export function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function computeTravelView(ship: TravelShipSnapshot): TravelView {
  const t = smoothstep(ship.phaseProgress);

  switch (ship.phase) {
    case 'docked':
      return {
        driftSpeed: 0,
        engineIntensity: 0,
        currentBodyId: ship.locationId,
        currentBodyPresence: 1,
        destinationBodyId: null,
        destinationBodyPresence: 0,
      };
    case 'departing':
      return {
        driftSpeed: t,
        engineIntensity: t,
        currentBodyId: ship.locationId,
        currentBodyPresence: 1 - t,
        destinationBodyId: null,
        destinationBodyPresence: 0,
      };
    case 'cruising':
      return {
        driftSpeed: 1,
        engineIntensity: 1,
        currentBodyId: ship.locationId,
        currentBodyPresence: 0,
        destinationBodyId: ship.destinationId,
        destinationBodyPresence: 0,
      };
    case 'arriving': {
      if (ship.destinationId === null) {
        // ShipState guarantees a destination during travel; losing it here
        // is a programming error, not a content error.
        throw new Error('computeTravelView: arriving with no destination');
      }
      return {
        driftSpeed: 1 - t,
        engineIntensity: 1 - t,
        currentBodyId: ship.locationId,
        currentBodyPresence: 0,
        destinationBodyId: ship.destinationId,
        destinationBodyPresence: t,
      };
    }
  }
}
