import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { CombatSim } from '../../src/combat/combatSim';
import {
  type CombatEvent,
  type CombatInput,
  type CombatSettings,
  IDLE_COMBAT_INPUT,
  type PlayerShip,
  type Raider,
  type Rock,
  type Shot,
} from '../../src/combat/combatTypes';
import { mulberry32 } from '../../src/core/random';
import { angleOf, distance, length, sub, vec2 } from '../../src/combat/vec2';

const DT = 1 / 60;

/** Live config, with no rocks unless a test asks for them (they get in the way). */
function settings(over: (s: Mutable<CombatSettings>) => void = () => {}): CombatSettings {
  const s = structuredClone(gameConfig.combat) as unknown as Mutable<CombatSettings>;
  s.rocks.count = 0;
  over(s);
  return s;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

function newSim(
  over?: (s: Mutable<CombatSettings>) => void,
  difficulty: 'rookie' | 'ace' = 'rookie',
) {
  const sim = new CombatSim(difficulty, mulberry32(7), settings(over));
  sim.begin();
  return sim;
}

/** Writable handles on the simulation's own objects, for arranging scenes. */
const player = (sim: CombatSim) => sim.snapshot.player as PlayerShip;
const raiders = (sim: CombatSim) => sim.snapshot.raiders as Raider[];
const shots = (sim: CombatSim) => sim.snapshot.shots as Shot[];
const rocks = (sim: CombatSim) => sim.snapshot.rocks as Rock[];

/** Step for `seconds`, collecting every event. */
function run(sim: CombatSim, seconds: number, input: Partial<CombatInput> = {}): CombatEvent[] {
  const events: CombatEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) events.push(...sim.step(DT, { ...IDLE_COMBAT_INPUT, ...input }));
  return events;
}
const types = (events: CombatEvent[]) => events.map((e) => e.type);

/** Keep every raider but the first out of the way, and pin the first ahead of the ship. */
function oneRaiderAhead(sim: CombatSim, range = 260): Raider {
  const [first, ...rest] = raiders(sim);
  for (const r of rest) r.dead = true;
  if (!first) throw new Error('no raider');
  first.pos = vec2(0, -range); // the ship's nose points up (−y)
  first.fireIn = 999;
  return first;
}

/** Hold a raider still (raiders steer every step; tests need a sitting target). */
function freeze(sim: CombatSim, raider: Raider, input: Partial<CombatInput> = {}, seconds = 1) {
  const events: CombatEvent[] = [];
  const where = raider.pos;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    raider.pos = where;
    raider.vel = vec2();
    raider.fireIn = 999;
    events.push(...sim.step(DT, { ...IDLE_COMBAT_INPUT, ...input }));
  }
  return events;
}

describe('CombatSim: starting a fight', () => {
  it('the first wave has five raiders, spawned at a distance from the ship', () => {
    const sim = new CombatSim('rookie', mulberry32(1), settings());
    const events = sim.begin();
    expect(events).toEqual([{ type: 'waveStarted', wave: 1, count: 5 }]);
    for (const r of raiders(sim)) {
      expect(distance(r.pos, vec2())).toBeGreaterThanOrEqual(gameConfig.combat.enemy.spawnMin - 1);
    }
  });

  it('stepping before begin is a programming error', () => {
    const sim = new CombatSim('rookie', mulberry32(1), settings());
    expect(() => sim.step(DT, IDLE_COMBAT_INPUT)).toThrow(/begin/);
  });

  it('the same seed and input play out identically (fights are reproducible)', () => {
    const a = newSim();
    const b = newSim();
    const input = { thrust: 1, fire: true, aimAngle: 0.3 };
    run(a, 6, input);
    run(b, 6, input);
    expect(a.snapshot.player.pos).toEqual(b.snapshot.player.pos);
    expect(a.snapshot.score).toBe(b.snapshot.score);
  });
});

describe('CombatSim: flying', () => {
  it('the ship turns toward the mouse aim, no faster than its turn rate', () => {
    const sim = newSim();
    run(sim, 0.1, { aimAngle: 0 });
    const turned = Math.abs(player(sim).heading - -Math.PI / 2);
    expect(turned).toBeCloseTo(gameConfig.combat.ship.turnRate * 0.1, 1);
  });

  it('thrust is capped at top speed, and boost raises the cap while it drains energy', () => {
    const sim = newSim();
    run(sim, 3, { thrust: 1 });
    expect(length(player(sim).vel)).toBeCloseTo(gameConfig.combat.ship.maxSpeed, 0);
    run(sim, 1, { thrust: 1, boost: true });
    expect(length(player(sim).vel)).toBeGreaterThan(gameConfig.combat.ship.maxSpeed + 50);
    expect(player(sim).energy).toBeLessThan(80);
  });

  it('boost energy refills after boosting stops', () => {
    const sim = newSim();
    run(sim, 1, { boost: true });
    const drained = player(sim).energy;
    run(sim, 1);
    expect(player(sim).energy).toBeGreaterThan(drained);
  });

  it('flying past the arena edge pulls the ship back in', () => {
    const sim = newSim();
    const p = player(sim);
    p.pos = vec2(0, -(gameConfig.combat.arenaRadius + 100));
    p.vel = vec2(0, -100);
    run(sim, 2);
    expect(length(p.pos)).toBeLessThan(gameConfig.combat.arenaRadius + 100);
  });
});

describe('CombatSim: lasers', () => {
  it('sustained fire overheats the cannons, which then go quiet until they cool', () => {
    const sim = newSim();
    oneRaiderAhead(sim).pos = vec2(5000, 5000); // nothing to hit
    // About 3.6 s of held fire: heat builds faster than it cools.
    const events = run(sim, 5, { fire: true });
    expect(types(events)).toContain('overheated');
    expect(player(sim).overheated).toBe(true);
    const shotsBefore = types(run(sim, 0.3, { fire: true })).filter((t) => t === 'laserFired');
    expect(shotsBefore).toHaveLength(0);
    const cooling = run(sim, 4);
    expect(types(cooling)).toContain('cooled');
    expect(types(run(sim, 0.2, { fire: true }))).toContain('laserFired');
  });

  it('each volley is two shots, one from each cannon', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, fire: true });
    expect(shots(sim).filter((s) => s.owner === 'player')).toHaveLength(2);
  });

  it('lasers on target wear a raider down and destroy it for points', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim);
    const events = freeze(sim, target, { fire: true }, 2);
    expect(types(events)).toContain('hit');
    expect(types(events)).toContain('raiderDestroyed');
    expect(sim.snapshot.kills).toBe(1);
    expect(sim.snapshot.score).toBeGreaterThanOrEqual(gameConfig.combat.score.raider);
  });

  it('rocks stop laser fire', () => {
    const sim = newSim((s) => (s.rocks.count = 1));
    const target = oneRaiderAhead(sim, 500);
    const rock = rocks(sim)[0] as Rock;
    rock.pos = vec2(0, -250);
    rock.vel = vec2();
    const events = freeze(sim, target, { fire: true }, 1);
    expect(events.some((e) => e.type === 'hit' && e.on === 'rock')).toBe(true);
    expect(target.hp).toBe(target.maxHp);
  });
});

describe('CombatSim: missile lock', () => {
  it('a missile without a lock is refused', () => {
    const sim = newSim();
    oneRaiderAhead(sim).pos = vec2(5000, 0);
    const events = sim.step(DT, { ...IDLE_COMBAT_INPUT, missile: true });
    expect(events).toContainEqual({ type: 'missileDenied', reason: 'noLock' });
    expect(player(sim).missiles).toBe(gameConfig.combat.missiles.count);
  });

  it('holding a raider on the nose locks it after about a second', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim, 500);
    expect(types(freeze(sim, target, {}, 0.8))).not.toContain('lockAcquired');
    expect(types(freeze(sim, target, {}, 0.4))).toContain('lockAcquired');
    expect(sim.snapshot.lock.targetId).toBe(target.id);
  });

  it('a locked missile flies to its raider and destroys it', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim, 600);
    freeze(sim, target, {}, 1.2);
    const launch = sim.step(DT, { ...IDLE_COMBAT_INPUT, missile: true });
    expect(types(launch)).toContain('missileFired');
    expect(player(sim).missiles).toBe(gameConfig.combat.missiles.count - 1);
    // Let the raider fly free now: the missile must chase it.
    const events = run(sim, 4);
    expect(types(events)).toContain('raiderDestroyed');
  });

  it('with no missiles left the launcher reports empty', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim, 500);
    player(sim).missiles = 0;
    freeze(sim, target, {}, 1.2);
    const events = sim.step(DT, { ...IDLE_COMBAT_INPUT, missile: true });
    expect(events).toContainEqual({ type: 'missileDenied', reason: 'empty' });
  });
});

describe('CombatSim: taking damage', () => {
  /** An enemy shot about to hit the ship. */
  function incoming(sim: CombatSim, damage: number): void {
    shots(sim).push({
      pos: vec2(0, -60),
      prev: vec2(0, -60),
      vel: vec2(0, 600),
      life: 1,
      owner: 'enemy',
      damage,
      missile: false,
      targetId: null,
    });
  }

  it('shields take the damage before the hull', () => {
    const sim = newSim();
    for (const r of raiders(sim)) r.fireIn = 999;
    incoming(sim, 30);
    const events = run(sim, 0.2);
    expect(player(sim).shield).toBe(70);
    expect(player(sim).hull).toBe(100);
    expect(types(events)).toContain('playerDamaged');
  });

  it('once the shields are gone, damage reaches the hull and the shields-down call is made', () => {
    const sim = newSim();
    for (const r of raiders(sim)) r.fireIn = 999;
    player(sim).shield = 10;
    player(sim).lastDamageAt = 0; // no recharge before the hit lands
    incoming(sim, 30);
    const events = run(sim, 0.2);
    expect(player(sim).hull).toBe(80);
    expect(events.some((e) => e.type === 'playerDamaged' && e.shieldsDown)).toBe(true);
  });

  it('shields only recharge after a quiet spell', () => {
    const sim = newSim();
    for (const r of raiders(sim)) r.fireIn = 999;
    incoming(sim, 40);
    run(sim, 3);
    expect(player(sim).shield).toBe(60);
    run(sim, 3);
    expect(player(sim).shield).toBeGreaterThan(60);
  });

  it('losing the hull ends the fight as lost, and the fight then stands still', () => {
    const sim = newSim();
    player(sim).shield = 0;
    player(sim).hull = 5;
    incoming(sim, 20);
    const events = run(sim, 0.2);
    expect(types(events)).toContain('lost');
    expect(sim.snapshot.phase).toBe('lost');
    expect(sim.step(DT, { ...IDLE_COMBAT_INPUT, thrust: 1 })).toEqual([]);
  });

  it('left alone, the raiders close in and shoot the ship (the enemy AI works)', () => {
    const sim = newSim();
    const events = run(sim, 25);
    expect(types(events)).toContain('enemyFired');
    expect(types(events)).toContain('playerDamaged');
  });

  it('Ace raiders are tougher and hit harder than Rookie ones', () => {
    const rookie = newSim(undefined, 'rookie');
    const ace = newSim(undefined, 'ace');
    expect(raiders(ace)[0]?.maxHp).toBeGreaterThan(raiders(rookie)[0]?.maxHp ?? Infinity);
    const c = gameConfig.combat.difficulty;
    expect(c.ace.shotDamage).toBeGreaterThan(c.rookie.shotDamage);
  });
});

describe('CombatSim: waves and winning', () => {
  const clearWave = (sim: CombatSim) => {
    for (const r of raiders(sim)) r.dead = true;
  };

  it('clearing a wave pauses, then the next, larger wave arrives with missiles reloaded', () => {
    const sim = newSim();
    player(sim).missiles = 1;
    player(sim).shield = 20;
    clearWave(sim);
    const cleared = run(sim, 0.1);
    expect(cleared).toContainEqual({ type: 'waveCleared', wave: 1, last: false });
    const next = run(sim, gameConfig.combat.wavePause + 0.1);
    expect(next).toContainEqual({ type: 'waveStarted', wave: 2, count: 7 });
    expect(player(sim).missiles).toBe(gameConfig.combat.missiles.count);
    expect(player(sim).shield).toBeGreaterThanOrEqual(20 + gameConfig.combat.rearm.shield);
  });

  it('the last wave is led by a commander, and clearing it wins with a survival bonus', () => {
    const sim = newSim();
    for (let wave = 1; wave < gameConfig.combat.waves.length; wave++) {
      clearWave(sim);
      run(sim, gameConfig.combat.wavePause + 0.2);
    }
    expect(sim.snapshot.wave).toBe(3);
    expect(raiders(sim)).toHaveLength(9);
    expect(raiders(sim).filter((r) => r.commander)).toHaveLength(1);
    const before = sim.snapshot.score;
    clearWave(sim);
    const events = run(sim, gameConfig.combat.wavePause + 0.2);
    expect(types(events)).toContain('won');
    expect(sim.snapshot.phase).toBe('won');
    expect(sim.snapshot.score).toBeGreaterThan(before);
  });

  it('ramming a raider wrecks it and hurts the ship', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim, 10);
    const events = sim.step(DT, IDLE_COMBAT_INPUT);
    expect(target.dead).toBe(true);
    expect(types(events)).toContain('playerDamaged');
  });

  it('raiders do not shoot when facing away from the ship', () => {
    const sim = newSim();
    const target = oneRaiderAhead(sim, 400);
    target.fireIn = 0;
    // Point it straight away from the ship and step once.
    target.heading = angleOf(sub(target.pos, vec2()));
    const events = sim.step(DT, IDLE_COMBAT_INPUT);
    expect(types(events)).not.toContain('enemyFired');
  });
});
