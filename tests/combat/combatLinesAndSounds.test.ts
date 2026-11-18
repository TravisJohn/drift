import { afterEach, describe, expect, it, vi } from 'vitest';
import { CombatSounds, recipeFor } from '../../src/combat/combatSounds';
import type { CombatEvent } from '../../src/combat/combatTypes';
import { vec2 } from '../../src/combat/vec2';
import { CombatVoice, combatLines, momentFor } from '../../src/content/combatLines';

const at = vec2(0, 0);

describe('combat lines: what the ship AI says', () => {
  it('every moment has at least one line written for it', () => {
    for (const [moment, lines] of Object.entries(combatLines)) {
      expect(lines.length, moment).toBeGreaterThan(0);
    }
  });

  it('the first wave, a middle wave and the last wave are each announced differently', () => {
    expect(momentFor({ type: 'waveStarted', wave: 1, count: 5 }, 0)).toBe('engaged');
    expect(momentFor({ type: 'waveStarted', wave: 2, count: 7 }, 0)).toBe('nextWave');
    expect(momentFor({ type: 'waveStarted', wave: 3, count: 9 }, 0)).toBe('finalWave');
  });

  it('the first kill gets its own line; the commander gets another', () => {
    const kill: CombatEvent = { type: 'raiderDestroyed', at, commander: false };
    expect(momentFor(kill, 1)).toBe('firstKill');
    expect(momentFor(kill, 4)).toBe('kill');
    expect(momentFor({ ...kill, commander: true }, 9)).toBe('commanderDown');
  });

  it('small hits pass in silence; shields failing and a thin hull are called out', () => {
    const hit = { type: 'playerDamaged', at, amount: 10 } as const;
    expect(momentFor({ ...hit, shieldsDown: false, hullCritical: false }, 0)).toBeNull();
    expect(momentFor({ ...hit, shieldsDown: true, hullCritical: false }, 0)).toBe('shieldsDown');
    expect(momentFor({ ...hit, shieldsDown: false, hullCritical: true }, 0)).toBe('hullCritical');
  });

  it('a raider missile is called out by the side it comes from, so the pilot knows which way to drift', () => {
    const launch = (from: 'ahead' | 'left' | 'right' | 'behind') =>
      momentFor({ type: 'enemyMissileLaunched', at, from }, 0);
    expect(launch('ahead')).toBe('missileAhead');
    expect(launch('left')).toBe('missileLeft');
    expect(launch('right')).toBe('missileRight');
    expect(launch('behind')).toBe('missileBehind');
    expect(new CombatVoice().say('missileBehind')).toMatch(/tail|aft/i);
  });

  it('shooting a missile down gets a word of thanks', () => {
    expect(momentFor({ type: 'enemyMissileDown', at }, 0)).toBe('missileDown');
  });

  it('lines rotate and fill in the wave and score', () => {
    const voice = new CombatVoice();
    const first = voice.say('nextWave', { wave: 2 });
    const second = voice.say('nextWave', { wave: 3 });
    expect(first).toContain('2');
    expect(second).not.toBe(first);
    expect(voice.say('won', { score: 4200 })).toContain('4200');
  });
});

describe('combat sounds', () => {
  afterEach(() => vi.restoreAllMocks());

  it('every shot, lock, missile and explosion makes a sound', () => {
    const loud: CombatEvent[] = [
      { type: 'laserFired', at },
      { type: 'enemyFired', at },
      { type: 'lockAcquired', targetId: 1 },
      { type: 'missileFired', at },
      { type: 'enemyMissileLaunched', at, from: 'behind' },
      { type: 'enemyMissileDown', at },
      { type: 'raiderDestroyed', at, commander: false },
      { type: 'won', score: 1 },
    ];
    for (const event of loud) expect(recipeFor(event).length, event.type).toBeGreaterThan(0);
  });

  it('an explosion is filtered noise with a low thump under it', () => {
    const kinds = recipeFor({ type: 'raiderDestroyed', at, commander: true }).map((r) => r.kind);
    expect(kinds).toEqual(['noise', 'tone']);
  });

  it('every volume stays within the effects level (0..1)', () => {
    const events: CombatEvent[] = [
      { type: 'laserFired', at },
      { type: 'playerDamaged', at, amount: 5, shieldsDown: false, hullCritical: false },
      { type: 'lost', score: 0 },
    ];
    for (const r of events.flatMap(recipeFor)) {
      expect(r.volume).toBeGreaterThan(0);
      expect(r.volume).toBeLessThanOrEqual(1);
    }
  });

  it('without Web Audio it stays silent and warns once, instead of failing', () => {
    vi.stubGlobal('AudioContext', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sounds = new CombatSounds({ enabled: true, level: 0.3 });
    sounds.resume();
    sounds.play([{ type: 'laserFired', at }]);
    sounds.play([{ type: 'laserFired', at }]);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
