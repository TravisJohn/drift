import { describe, expect, it } from 'vitest';
import {
  START_LOCATION_ID,
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

  it('every cruise fits the PRD 60-120s window', () => {
    for (const loc of locations) {
      expect(loc.travelTime).toBeGreaterThanOrEqual(60);
      expect(loc.travelTime).toBeLessThanOrEqual(120);
    }
  });

  it('getLocation returns the location or fails loud', () => {
    expect(getLocation('aurelia').name).toBe('Aurelia');
    expect(() => getLocation('nowhere')).toThrow(/Unknown location/);
  });
});
