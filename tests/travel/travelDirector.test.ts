import { describe, expect, it } from 'vitest';
import {
  computeTravelView,
  smoothstep,
  type TravelShipSnapshot,
} from '../../src/travel/travelDirector';

const snap = (partial: Partial<TravelShipSnapshot>): TravelShipSnapshot => ({
  phase: 'docked',
  phaseProgress: 0,
  locationId: 'anchorage',
  destinationId: null,
  ...partial,
});

describe('smoothstep', () => {
  it('clamps to [0,1] and hits the endpoints exactly', () => {
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(9)).toBe(1);
  });
});

describe('computeTravelView', () => {
  it('docked: space is still and the current body sits alongside', () => {
    const view = computeTravelView(snap({}));
    expect(view.driftSpeed).toBe(0);
    expect(view.engineIntensity).toBe(0);
    expect(view.currentBodyId).toBe('anchorage');
    expect(view.currentBodyPresence).toBe(1);
    expect(view.destinationBodyId).toBeNull();
    expect(view.destinationBodyPresence).toBe(0);
  });

  it('departing: drift ramps up as the current body recedes', () => {
    const start = computeTravelView(
      snap({ phase: 'departing', phaseProgress: 0, destinationId: 'aurelia' }),
    );
    const mid = computeTravelView(
      snap({ phase: 'departing', phaseProgress: 0.5, destinationId: 'aurelia' }),
    );
    const end = computeTravelView(
      snap({ phase: 'departing', phaseProgress: 1, destinationId: 'aurelia' }),
    );
    expect(start.driftSpeed).toBe(0);
    expect(mid.driftSpeed).toBeCloseTo(0.5, 10);
    expect(end.driftSpeed).toBe(1);
    expect(start.currentBodyPresence).toBe(1);
    expect(end.currentBodyPresence).toBe(0);
    // No destination body yet - it only grows in during arrival.
    expect(mid.destinationBodyPresence).toBe(0);
  });

  it('cruising: full drift, full engines, empty space in every direction', () => {
    const view = computeTravelView(
      snap({ phase: 'cruising', phaseProgress: 0.4, destinationId: 'aurelia' }),
    );
    expect(view.driftSpeed).toBe(1);
    expect(view.engineIntensity).toBe(1);
    expect(view.currentBodyPresence).toBe(0);
    expect(view.destinationBodyPresence).toBe(0);
  });

  it('arriving: drift eases off as the destination grows in ahead', () => {
    const mid = computeTravelView(
      snap({ phase: 'arriving', phaseProgress: 0.5, destinationId: 'aurelia' }),
    );
    const end = computeTravelView(
      snap({ phase: 'arriving', phaseProgress: 1, destinationId: 'aurelia' }),
    );
    expect(mid.driftSpeed).toBeCloseTo(0.5, 10);
    expect(mid.destinationBodyId).toBe('aurelia');
    expect(mid.destinationBodyPresence).toBeCloseTo(0.5, 10);
    expect(end.driftSpeed).toBe(0);
    expect(end.destinationBodyPresence).toBe(1);
  });

  it('arriving with no destination is a programming error (fail loud)', () => {
    expect(() =>
      computeTravelView(snap({ phase: 'arriving', phaseProgress: 0.5, destinationId: null })),
    ).toThrow(/no destination/);
  });

  it('drift ramps are monotonic within their phases', () => {
    let previous = -1;
    for (let p = 0; p <= 1.001; p += 0.1) {
      const view = computeTravelView(
        snap({ phase: 'departing', phaseProgress: p, destinationId: 'cinder' }),
      );
      expect(view.driftSpeed).toBeGreaterThanOrEqual(previous);
      previous = view.driftSpeed;
    }
  });
});
