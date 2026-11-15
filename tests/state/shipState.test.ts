import { describe, expect, it } from 'vitest';
import { ShipState } from '../../src/state/shipState';

const TIMINGS = { departDuration: 4, arriveDuration: 4 };
const make = () => new ShipState('anchorage', TIMINGS);

describe('ShipState', () => {
  it('starts docked at the given location with no destination', () => {
    const ship = make();
    expect(ship.phase).toBe('docked');
    expect(ship.locationId).toBe('anchorage');
    expect(ship.destinationId).toBeNull();
  });

  it('beginTravel moves docked -> departing and records the destination', () => {
    const ship = make();
    const change = ship.beginTravel('aurelia', 90);
    expect(change).toEqual({ from: 'docked', to: 'departing', destinationId: 'aurelia' });
    expect(ship.phase).toBe('departing');
    expect(ship.destinationId).toBe('aurelia');
  });

  it('refuses to begin travel while already traveling (fail loud)', () => {
    const ship = make();
    ship.beginTravel('aurelia', 90);
    expect(() => ship.beginTravel('cinder', 70)).toThrow(/cannot begin travel/);
  });

  it('refuses to travel to the current location or with a bad duration', () => {
    const ship = make();
    expect(() => ship.beginTravel('anchorage', 90)).toThrow(/current location/);
    expect(() => ship.beginTravel('aurelia', 0)).toThrow(/cruiseDuration/);
  });

  it('runs the full journey: departing -> cruising -> arriving -> docked at destination', () => {
    const ship = make();
    ship.beginTravel('aurelia', 10);

    expect(ship.update(4)).toEqual([
      { from: 'departing', to: 'cruising', destinationId: 'aurelia' },
    ]);
    expect(ship.update(10)).toEqual([
      { from: 'cruising', to: 'arriving', destinationId: 'aurelia' },
    ]);
    expect(ship.update(4)).toEqual([{ from: 'arriving', to: 'docked', destinationId: 'aurelia' }]);

    expect(ship.phase).toBe('docked');
    expect(ship.locationId).toBe('aurelia');
    expect(ship.destinationId).toBeNull();
  });

  it('a single huge dt crosses several phases and reports each transition', () => {
    const ship = make();
    ship.beginTravel('cinder', 10);
    const changes = ship.update(1000);
    expect(changes.map((c) => c.to)).toEqual(['cruising', 'arriving', 'docked']);
    expect(ship.locationId).toBe('cinder');
  });

  it('progress is 0 before cruising, rises monotonically during it, and 0 when docked', () => {
    const ship = make();
    ship.beginTravel('aurelia', 10);
    expect(ship.progress).toBe(0);
    ship.update(4); // -> cruising
    ship.update(2.5);
    expect(ship.progress).toBeCloseTo(0.25, 5);
    ship.update(5);
    expect(ship.progress).toBeCloseTo(0.75, 5);
    ship.update(2.5); // -> arriving
    expect(ship.progress).toBe(0);
  });

  it('phaseProgress tracks the current phase fraction', () => {
    const ship = make();
    ship.beginTravel('aurelia', 10);
    ship.update(1);
    expect(ship.phaseProgress).toBeCloseTo(0.25, 5); // 1s of 4s departure
    ship.update(3); // -> cruising, elapsed 0
    ship.update(5);
    expect(ship.phaseProgress).toBeCloseTo(0.5, 5);
  });

  it('update while docked does nothing', () => {
    const ship = make();
    expect(ship.update(100)).toEqual([]);
    expect(ship.phase).toBe('docked');
  });

  it('can travel again after arriving', () => {
    const ship = make();
    ship.beginTravel('aurelia', 5);
    ship.update(100);
    const change = ship.beginTravel('anchorage', 5); // back home is now valid
    expect(change.destinationId).toBe('anchorage');
    ship.update(100);
    expect(ship.locationId).toBe('anchorage');
  });

  it('leftover time carries across a phase boundary (no dropped fractions)', () => {
    const ship = make();
    ship.beginTravel('aurelia', 10);
    ship.update(5); // 4s departure + 1s into cruise
    expect(ship.phase).toBe('cruising');
    expect(ship.progress).toBeCloseTo(0.1, 5);
  });
});
