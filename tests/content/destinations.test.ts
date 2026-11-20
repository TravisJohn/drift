import { gameConfig } from '../../src/config/gameConfig';
import { ShipState } from '../../src/state/shipState';
import { describe, expect, it } from 'vitest';
import {
  START_LOCATION_ID,
  journeySeconds,
  getLocation,
  locations,
  validateLocations,
} from '../../src/content/destinations';

describe('destinations content', () => {
  it('the shipped locations are valid', () => {
    expect(validateLocations()).toEqual([]);
  });

  it('offers 2-3 selectable destinations from the start location (PRD)', () => {
    const selectable = locations.filter((l) => l.id !== START_LOCATION_ID);
    expect(selectable.length).toBeGreaterThanOrEqual(2);
    expect(selectable.length).toBeLessThanOrEqual(3);
  });

  it('every journey fits the 60-120s window', () => {
    for (const loc of locations) {
      expect(journeySeconds(loc.travelTime)).toBeGreaterThanOrEqual(60);
      expect(journeySeconds(loc.travelTime)).toBeLessThanOrEqual(120);
    }
  });

  it('reaches the abandoned station exactly sixty seconds after engaging', () => {
    const target = getLocation('vesper');
    const ship = new ShipState(START_LOCATION_ID, gameConfig.travel);
    ship.beginTravel(target.id, target.travelTime * gameConfig.travel.cruiseScale);
    expect(ship.secondsToArrival).toBe(60);
    ship.update(5);
    expect(ship.secondsToArrival).toBe(55);
    ship.update(54.875);
    expect(ship.secondsToArrival).toBe(0.125);
    expect(ship.phase).toBe('arriving');
    expect(ship.locationId).toBe(START_LOCATION_ID);
    expect(ship.update(0.125)).toEqual([
      { from: 'arriving', to: 'docked', destinationId: target.id },
    ]);
    expect(ship.locationId).toBe(target.id);
    expect(ship.secondsToArrival).toBe(0);
    expect(ship.update(60)).toEqual([]);
  });

  it('getLocation returns the location or fails loud', () => {
    expect(getLocation('aurelia').name).toBe('Aurelia');
    expect(() => getLocation('nowhere')).toThrow(/Unknown location/);
  });
});

describe('destinations on the star chart', () => {
  it('every place sits on the chart, and no two overlap', () => {
    for (const loc of locations) {
      expect(loc.chart.x).toBeGreaterThanOrEqual(0);
      expect(loc.chart.x).toBeLessThanOrEqual(1);
      expect(loc.chart.y).toBeGreaterThanOrEqual(0);
      expect(loc.chart.y).toBeLessThanOrEqual(1);
    }
    for (const a of locations) {
      for (const b of locations) {
        if (a.id !== b.id) {
          expect(Math.hypot(a.chart.x - b.chart.x, a.chart.y - b.chart.y)).toBeGreaterThan(0.15);
        }
      }
    }
  });
});
