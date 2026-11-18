import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { CombatSim } from '../../src/combat/combatSim';
import type { Shot } from '../../src/combat/combatTypes';
import { mapPoint, missileWarning } from '../../src/combat/holoMap';
import { mulberry32 } from '../../src/core/random';
import { vec2 } from '../../src/combat/vec2';

const frame = { cx: 100, cy: 100, radius: 50, range: 1000 };

describe('holographic map: placing things on the disc', () => {
  it('the ship sits at the centre', () => {
    expect(mapPoint(vec2(30, 40), vec2(30, 40), frame)).toEqual({ x: 100, y: 100, pinned: false });
  });

  it('ahead is up the disc and behind is down (the ship never turns)', () => {
    expect(mapPoint(vec2(0, -500), vec2(0, 0), frame).y).toBeCloseTo(75);
    expect(mapPoint(vec2(0, 500), vec2(0, 0), frame).y).toBeCloseTo(125);
  });

  it('something beyond range is pinned to the rim, so a raider far behind still shows', () => {
    const p = mapPoint(vec2(0, 5000), vec2(0, 0), frame);
    expect(p.pinned).toBe(true);
    expect(p.y).toBeCloseTo(150);
  });
});

describe('holographic map: the missile call-out', () => {
  const sim = () => {
    const s = new CombatSim('rookie', mulberry32(1));
    s.begin();
    return s;
  };
  const missileAt = (x: number, y: number): Shot => ({
    pos: vec2(x, y),
    prev: vec2(x, y),
    vel: vec2(0, 0),
    life: 5,
    owner: 'enemy',
    damage: gameConfig.combat.difficulty.rookie.missileDamage,
    missile: true,
    targetId: null,
  });

  it('with no raider missile in flight there is nothing to call out', () => {
    expect(missileWarning(sim().snapshot)).toBeNull();
  });

  it('calls out the side of the nearest raider missile', () => {
    const s = sim();
    const shots = s.snapshot.shots as Shot[];
    shots.push(missileAt(0, 900)); // far behind
    shots.push(missileAt(-200, 0)); // close, to the left
    expect(missileWarning(s.snapshot)).toBe('left');
  });
});
