import { beforeEach, describe, expect, it } from 'vitest';
import { GameProgress, PROGRESS_KEY } from '../../src/state/gameProgress';

const LEGACY_KEY = 'drift.drone-loadout';

describe('GameProgress', () => {
  beforeEach(() => {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  it('restores the last dock, the Vesper recovery and every scout earned on full returns', () => {
    const initial = new GameProgress();
    expect(initial.canContinue).toBe(false);
    initial.dock('vesper');
    expect(initial.recoverVesper(false)).toBeNull();
    expect(new GameProgress().snapshot).toEqual({
      locationId: 'vesper',
      vesperRecovered: true,
      companions: [],
    });

    expect(initial.recoverVesper(true)).toBe(1);
    const resumed = new GameProgress();
    expect(resumed.canContinue).toBe(true);
    expect(resumed.recoverVesper(true)).toBe(2);
    resumed.dock('cinder');
    expect(new GameProgress().snapshot).toEqual({
      locationId: 'cinder',
      vesperRecovered: true,
      companions: [1, 2],
    });
  });

  it.each(['vesper-scout', 'maintenance'])(
    'migrates a previous scout unlock saved as %s once',
    (legacy) => {
      localStorage.setItem(LEGACY_KEY, legacy);
      const progress = new GameProgress();
      expect(progress.snapshot).toEqual({
        locationId: 'vesper',
        vesperRecovered: true,
        companions: [1],
      });
      progress.dock('aurelia');
      expect(new GameProgress().snapshot).toEqual({
        locationId: 'aurelia',
        vesperRecovered: true,
        companions: [1],
      });
    },
  );

  it.each(['broken json', '{"locationId":"unknown","vesperRecovered":true,"companions":[1]}'])(
    'ignores an invalid checkpoint',
    (broken) => {
      localStorage.setItem(PROGRESS_KEY, broken);
      const progress = new GameProgress();
      expect(progress.canContinue).toBe(false);
      expect(progress.snapshot.locationId).toBe('anchorage');
      expect(progress.snapshot.companions).toEqual([]);
    },
  );
});
