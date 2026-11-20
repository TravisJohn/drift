/**
 * ShipState - the ship's journey as a pure state machine (D3).
 *
 *   docked -> departing -> cruising -> arriving -> docked (at destination)
 *
 * Owns its own phase timing: `update(dt)` advances phases and returns the
 * transitions that occurred, which the caller (game.ts) emits on the event
 * bus. Pure TypeScript, no Three.js, no bus dependency - exhaustively
 * testable. The TravelDirector (M4) reads this state to drive visuals.
 */

export type ShipPhase = 'docked' | 'departing' | 'cruising' | 'arriving';

export interface ShipPhaseChange {
  readonly from: ShipPhase;
  readonly to: ShipPhase;
  /** The travel target (null once docked again - see `locationId` then). */
  readonly destinationId: string | null;
}

export interface ShipTimings {
  /** Departure sequence length, seconds. */
  readonly departDuration: number;
  /** Arrival sequence length, seconds. */
  readonly arriveDuration: number;
}

export class ShipState {
  private _phase: ShipPhase = 'docked';
  private _locationId: string;
  private _destinationId: string | null = null;
  private cruiseDuration = 0;
  private phaseElapsed = 0;

  constructor(
    startLocationId: string,
    private readonly timings: ShipTimings,
  ) {
    this._locationId = startLocationId;
  }

  get phase(): ShipPhase {
    return this._phase;
  }

  /** Where the ship is docked (or was last docked, while traveling). */
  get locationId(): string {
    return this._locationId;
  }

  get destinationId(): string | null {
    return this._destinationId;
  }

  /** Time to docking, including the final approach. */
  get secondsToArrival(): number {
    const { departDuration, arriveDuration } = this.timings;
    switch (this._phase) {
      case 'departing':
        return departDuration + this.cruiseDuration + arriveDuration - this.phaseElapsed;
      case 'cruising':
        return this.cruiseDuration + arriveDuration - this.phaseElapsed;
      case 'arriving':
        return arriveDuration - this.phaseElapsed;
      case 'docked':
        return 0;
    }
  }

  /** Cruise progress in [0, 1]; 0 outside the cruising phase. */
  get progress(): number {
    if (this._phase !== 'cruising' || this.cruiseDuration <= 0) return 0;
    return Math.min(1, this.phaseElapsed / this.cruiseDuration);
  }

  /** Fraction of the current phase elapsed, [0, 1] (for M4 visuals). */
  get phaseProgress(): number {
    const duration =
      this._phase === 'departing'
        ? this.timings.departDuration
        : this._phase === 'arriving'
          ? this.timings.arriveDuration
          : this._phase === 'cruising'
            ? this.cruiseDuration
            : 0;
    if (duration <= 0) return 0;
    return Math.min(1, this.phaseElapsed / duration);
  }

  /**
   * Engage autopilot toward `destinationId`. Only valid while docked;
   * anything else is a programming error (fail loud, D3).
   */
  beginTravel(destinationId: string, cruiseDuration: number): ShipPhaseChange {
    if (this._phase !== 'docked') {
      throw new Error(`ShipState: cannot begin travel while ${this._phase}`);
    }
    if (destinationId === this._locationId) {
      throw new Error('ShipState: destination is the current location');
    }
    if (cruiseDuration <= 0) {
      throw new Error(`ShipState: cruiseDuration must be positive, got ${cruiseDuration}`);
    }
    this._destinationId = destinationId;
    this.cruiseDuration = cruiseDuration;
    this.phaseElapsed = 0;
    this._phase = 'departing';
    return { from: 'docked', to: 'departing', destinationId };
  }

  /** Advance time; returns every transition that occurred (usually 0-1). */
  update(dt: number): ShipPhaseChange[] {
    if (this._phase === 'docked') return [];
    const changes: ShipPhaseChange[] = [];
    this.phaseElapsed += dt;

    // A huge dt (debug scale, stalls) may cross several phases; loop.
    let guard = 4;
    while (guard-- > 0) {
      const next = this.phaseDeadlineCrossed();
      if (!next) break;
      changes.push(next);
    }
    return changes;
  }

  private phaseDeadlineCrossed(): ShipPhaseChange | null {
    const advance = (to: ShipPhase, duration: number): ShipPhaseChange | null => {
      if (this.phaseElapsed < duration) return null;
      const from = this._phase;
      this.phaseElapsed -= duration;
      this._phase = to;
      const change: ShipPhaseChange = { from, to, destinationId: this._destinationId };
      if (to === 'docked') {
        // Arrival: the destination becomes the current location.
        this._locationId = this._destinationId ?? this._locationId;
        this._destinationId = null;
        this.phaseElapsed = 0;
      }
      return change;
    };

    switch (this._phase) {
      case 'departing':
        return advance('cruising', this.timings.departDuration);
      case 'cruising':
        return advance('arriving', this.cruiseDuration);
      case 'arriving':
        return advance('docked', this.timings.arriveDuration);
      case 'docked':
        return null;
    }
  }
}
