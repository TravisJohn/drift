import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { CombatSim } from '../../src/combat/combatSim';
import {
  type CombatEvent,
  type CombatInput,
  type CombatSettings,
  FORWARD,
  IDLE_COMBAT_INPUT,
  type PlayerShip,
  type Raider,
  type Rock,
  type Shot,
} from '../../src/combat/combatTypes';
import {
  stationBearing,
  stationPoint,
  stationVelocity,
  steerRaider,
  updateAttackRun,
} from '../../src/combat/enemyAi';
import { angleBetween } from '../../src/combat/combatMath';
import { setVelocity } from '../../src/combat/flight';
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

/**
 * Test rig for the weapons: the ship holds still, so ranges set up in a
 * test stay as set. (In play the ship is always moving forward.)
 */
const holdStill = (s: Mutable<CombatSettings>) => {
  s.ship.forwardSpeeds = [0, 0, 0];
};

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
  first.missileIn = 999;
  return first;
}

/** No raider shoots or launches for the rest of the test. */
function quiet(sim: CombatSim): void {
  for (const r of raiders(sim)) {
    r.fireIn = 999;
    r.missileIn = 999;
  }
}

/** A raider's missile at `pos`, flying toward the ship at the origin. */
function enemyMissile(sim: CombatSim, pos: ReturnType<typeof vec2>): Shot {
  const m = gameConfig.combat.enemy.missile;
  const away = length(pos) || 1;
  const missile: Shot = {
    pos,
    prev: pos,
    vel: vec2((-pos.x / away) * m.speed, (-pos.y / away) * m.speed),
    life: m.life,
    owner: 'enemy',
    damage: gameConfig.combat.difficulty.rookie.missileDamage,
    missile: true,
    targetId: null,
  };
  shots(sim).push(missile);
  return missile;
}

/** Hold a raider still (raiders steer every step; tests need a sitting target). */
function freeze(sim: CombatSim, raider: Raider, input: Partial<CombatInput> = {}, seconds = 1) {
  const events: CombatEvent[] = [];
  const where = raider.pos;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    raider.pos = where;
    raider.vel = vec2();
    raider.fireIn = 999;
    raider.missileIn = 999;
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
    const input = { strafe: 1, fire: true, aimAngle: 0.3 };
    run(a, 6, input);
    run(b, 6, input);
    expect(a.snapshot.player.pos).toEqual(b.snapshot.player.pos);
    expect(a.snapshot.score).toBe(b.snapshot.score);
  });
});

describe('CombatSim: forward flight', () => {
  const ship = gameConfig.combat.ship;
  const cruise = ship.forwardSpeeds[ship.startThrottle] ?? 0;

  it('the fight opens already cruising forward, guns pointing ahead: the ship is never parked', () => {
    const sim = newSim();
    expect(player(sim).vel.y).toBeCloseTo(-cruise);
    expect(player(sim).vel.x).toBeCloseTo(0);
    expect(player(sim).aim).toBe(FORWARD);
  });

  it('one W tap steps the speed up a notch and it stays set without holding the key', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, throttle: 1 });
    run(sim, 2);
    expect(player(sim).vel.y).toBeCloseTo(-(ship.forwardSpeeds[2] ?? 0));
  });

  it('a notch change takes a moment: the engines ease the motion round', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, throttle: 1 });
    run(sim, 0.1);
    const speed = -player(sim).vel.y;
    expect(speed).toBeGreaterThan(cruise);
    expect(speed).toBeLessThan(ship.forwardSpeeds[2] ?? 0);
  });

  it('S slows the ship to the slow notch but never stops it', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, throttle: -5 });
    run(sim, 2);
    expect(player(sim).vel.y).toBeCloseTo(-(ship.forwardSpeeds[0] ?? 0));
    expect(-player(sim).vel.y).toBeGreaterThan(0);
  });

  it('an A tap sets a drift left that stays, while the ship keeps moving forward', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, strafe: -1 });
    run(sim, 2);
    expect(player(sim).vel.x).toBeCloseTo(-ship.strafeStep);
    expect(player(sim).vel.y).toBeCloseTo(-cruise);
  });

  it('a D tap takes the drift back a notch: the pilot keeps correcting', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, strafe: -1 });
    run(sim, 1);
    sim.step(DT, { ...IDLE_COMBAT_INPUT, strafe: 1 });
    run(sim, 1);
    expect(player(sim).vel.x).toBeCloseTo(0);
  });

  it('the hull never rotates: aiming swings the guns, not the ship', () => {
    const sim = newSim();
    run(sim, 1, { aimAngle: 1 });
    expect(player(sim).aim).toBe(1);
    expect(player(sim).vel.x).toBeCloseTo(0);
    expect(player(sim).vel.y).toBeCloseTo(-cruise);
  });

  it('a knock (a rock, a ram) is flown out of: the engines restore the set motion', () => {
    const sim = newSim();
    player(sim).vel = vec2(120, 80);
    run(sim, 2);
    expect(player(sim).vel).toEqual(setVelocity(ship.startThrottle, 0, false, ship));
  });

  it('boost adds forward speed while it drains energy', () => {
    const sim = newSim();
    run(sim, 1.5, { boost: true });
    expect(-player(sim).vel.y).toBeGreaterThan(cruise + ship.boostExtra * 0.9);
    expect(player(sim).energy).toBeLessThan(80);
  });

  it('boost while drifting is a hard sideways dodge: quick, and it ends when the energy runs out', () => {
    const sim = newSim();
    sim.step(DT, { ...IDLE_COMBAT_INPUT, strafe: -1 }); // one tap of A
    run(sim, 1); // settle into the drift
    const before = player(sim).pos.x;
    run(sim, 0.5, { boost: true });
    // Half a second of boost carries the ship well left of a plain drift.
    const plainDrift = ship.strafeStep * 0.5;
    expect(before - player(sim).pos.x).toBeGreaterThan(plainDrift * 2.5);
    expect(-player(sim).vel.x).toBeGreaterThan(ship.strafeStep + ship.boostSide * 0.9);
    // Held on, the energy runs dry and the ship eases back to its set drift.
    run(sim, 4, { boost: true });
    expect(player(sim).boosting).toBe(false);
    run(sim, 0.8, { boost: true });
    expect(player(sim).boosting).toBe(false);
    expect(player(sim).vel.x).toBeCloseTo(-ship.strafeStep);
  });

  it('an empty boost bar stays off while Shift is held, until it has recharged a little', () => {
    const sim = newSim();
    player(sim).energy = 0;
    const d = gameConfig.combat.defence;
    let boosted = false;
    const wait = d.boostMinStart / d.energyRefill;
    for (let t = 0; t < (wait - 0.1) / DT; t++) {
      sim.step(DT, { ...IDLE_COMBAT_INPUT, boost: true });
      if (player(sim).boosting) boosted = true;
    }
    expect(boosted).toBe(false);
    run(sim, 0.3, { boost: true });
    expect(player(sim).boosting).toBe(true);
  });

  it('boost energy refills after boosting stops', () => {
    const sim = newSim();
    run(sim, 1, { boost: true });
    const drained = player(sim).energy;
    run(sim, 1);
    expect(player(sim).energy).toBeGreaterThan(drained);
  });

  it('space is endless: a rock left far behind is recycled ahead of the ship', () => {
    const sim = newSim((s) => (s.rocks.count = 1));
    const rock = rocks(sim)[0] as Rock;
    rock.pos = vec2(0, gameConfig.combat.fieldRadius + 200); // far behind
    sim.step(DT, IDLE_COMBAT_INPUT);
    const p = player(sim);
    expect(rock.pos.y).toBeLessThan(p.pos.y); // now ahead
    expect(distance(rock.pos, p.pos)).toBeLessThanOrEqual(gameConfig.combat.fieldRadius);
  });
});

describe('raider flight', () => {
  const enemy = gameConfig.combat.enemy;
  const raider = (): Raider => ({
    id: 1,
    commander: false,
    radius: enemy.radius,
    maxHp: 1,
    pos: vec2(0, 0),
    vel: vec2(enemy.speed, 0), // flying right at full speed
    heading: 0,
    hp: 1,
    fireIn: 99,
    missileIn: 99,
    attackIn: 99,
    attacking: 0,
    station: 0,
    phase: 0,
    dead: false,
  });
  const shipAt = (x: number, y: number) => ({ pos: vec2(x, y), vel: vec2(0, 0) });

  it('a raider turning hard keeps sliding the old way for a moment (momentum)', () => {
    const r = raider();
    // Its goal is behind it, so it wants to come about.
    steerRaider(r, shipAt(-2000, 0), 0, 0.25, enemy);
    expect(Math.abs(r.heading)).toBeGreaterThan(0.2); // the nose has swung
    expect(r.vel.x).toBeGreaterThan(enemy.speed * 0.5); // still carried to the right
  });

  it("given time, a raider's motion lines up with where its nose points", () => {
    const r = raider();
    for (let i = 0; i < 6 * 60; i++) steerRaider(r, shipAt(-2000, 0), 0, DT, enemy);
    expect(angleOf(r.vel)).toBeCloseTo(r.heading, 1);
    expect(length(r.vel)).toBeCloseTo(enemy.speed, -1);
  });
});

describe('raider stations: enemies in front, not only trailing behind', () => {
  const enemy = gameConfig.combat.enemy;
  /** Bearing of `pos` from the ship's nose, ignoring side: 0 ahead, pi behind. */
  const offNose = (sim: CombatSim, r: Raider) =>
    Math.abs(angleBetween(FORWARD, angleOf(sub(r.pos, player(sim).pos))));

  it('most of a wave is stationed ahead, inside the cockpit view; a share watch the tail', () => {
    const stations = Array.from({ length: 5 }, (_, i) => stationBearing(i, 5, enemy));
    const ahead = stations.filter((b) => Math.abs(b) <= enemy.aheadArc);
    const behind = stations.filter((b) => Math.abs(angleBetween(0, b)) > Math.PI / 2);
    expect(ahead).toHaveLength(4);
    expect(behind).toHaveLength(1);
    expect(enemy.aheadArc).toBeLessThan(Math.PI / 3); // the cockpit shows +-60 degrees
  });

  it('the commander (first of the last wave) is stationed ahead', () => {
    expect(Math.abs(stationBearing(0, 9, enemy))).toBeLessThanOrEqual(enemy.aheadArc);
  });

  it('a wave flies in mostly from ahead, already moving with the ship', () => {
    const sim = newSim();
    const wave = raiders(sim);
    const fromAhead = wave.filter((r) => offNose(sim, r) < Math.PI / 2);
    expect(fromAhead.length).toBeGreaterThan(wave.length / 2);
    for (const r of wave) expect(r.vel).toEqual(player(sim).vel);
  });

  it('a raider sitting on its station just flies along with the ship', () => {
    const sim = newSim();
    const [r] = raiders(sim);
    if (!r) throw new Error('no raider');
    const ship = { pos: vec2(0, 0), vel: vec2(0, -160) };
    r.pos = stationPoint(r, ship.pos, 3, enemy);
    const want = stationVelocity(r, ship, 3, enemy.speed, enemy);
    expect(want.x).toBeCloseTo(0);
    expect(want.y).toBeCloseTo(-160);
  });

  it('over a minute of cruising, raiders spend most of their time in front of the ship', () => {
    // The bug the author saw: every raider ended up trailing behind.
    const sim = newSim();
    let ahead = 0;
    let all = 0;
    for (let t = 0; t < 60 * 60; t++) {
      player(sim).hull = 1e9; // only where they fly matters here
      sim.step(DT, IDLE_COMBAT_INPUT);
      if (t % 30 !== 0 || t < 300) continue;
      for (const r of raiders(sim)) {
        if (r.dead) continue;
        all++;
        if (offNose(sim, r) < Math.PI / 2) ahead++;
      }
    }
    expect(ahead / all).toBeGreaterThan(0.55);
  });
});

describe('raider attack runs: turning in on the ship, then breaking off', () => {
  const enemy = gameConfig.combat.enemy;
  const ship = { pos: vec2(0, 0), vel: vec2(0, -160) };
  const raiderAt = (x: number, y: number): Raider => ({
    id: 1,
    commander: false,
    radius: enemy.radius,
    maxHp: 1,
    pos: vec2(x, y),
    vel: vec2(0, -160),
    heading: FORWARD,
    hp: 1,
    fireIn: 99,
    missileIn: 99,
    attackIn: 0.01,
    attacking: 0,
    station: 0,
    phase: 0,
    dead: false,
  });

  it('when its countdown runs out a raider starts a run', () => {
    const r = raiderAt(0, -900);
    updateAttackRun(r, ship, DT, enemy, () => 0.5);
    expect(r.attacking).toBe(enemy.attack.runTime);
  });

  it('on a run, a raider ahead comes round until its guns bear on the ship (head-on)', () => {
    const r = raiderAt(0, -900);
    r.attacking = enemy.attack.runTime;
    let flying = ship;
    let bears = false;
    for (let i = 0; i < enemy.attack.runTime * 60; i++) {
      flying = { ...flying, pos: vec2(flying.pos.x, flying.pos.y + flying.vel.y * DT) };
      steerRaider(r, flying, 0, DT, enemy);
      const toShip = angleOf(sub(flying.pos, r.pos));
      if (Math.abs(angleBetween(r.heading, toShip)) < enemy.fireAngle) bears = true;
    }
    expect(bears).toBe(true);
  });

  it('a raider breaks off once close, rather than flying into the ship', () => {
    const r = raiderAt(0, -(enemy.attack.breakRange - 10));
    r.attacking = 1;
    updateAttackRun(r, ship, DT, enemy, () => 0.5);
    expect(r.attacking).toBe(0);
    const { everyMin, everyMax } = enemy.attack;
    expect(r.attackIn).toBeCloseTo((everyMin + everyMax) / 2);
  });

  it('raiders stationed ahead do get to shoot at the ship', () => {
    const sim = newSim();
    const frontIds = new Set(
      raiders(sim)
        .filter((r) => Math.abs(r.station) <= enemy.aheadArc)
        .map((r) => r.id),
    );
    const near = (at: { x: number; y: number }) =>
      raiders(sim).find((r) => frontIds.has(r.id) && distance(r.pos, at) < r.radius + 40);
    let frontShots = 0;
    for (let t = 0; t < 30 * 60; t++) {
      player(sim).hull = 1e9;
      const before = shots(sim).length;
      sim.step(DT, IDLE_COMBAT_INPUT);
      for (const shot of shots(sim).slice(before)) {
        if (shot.owner === 'enemy' && !shot.missile && near(shot.pos)) frontShots++;
      }
    }
    expect(frontShots).toBeGreaterThan(0);
  });
});

describe('CombatSim: lasers', () => {
  it('sustained fire overheats the cannons, which then go quiet until they cool', () => {
    const sim = newSim(holdStill);
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
    const sim = newSim(holdStill);
    const target = oneRaiderAhead(sim);
    const events = freeze(sim, target, { fire: true }, 2);
    expect(types(events)).toContain('hit');
    expect(types(events)).toContain('raiderDestroyed');
    expect(sim.snapshot.kills).toBe(1);
    expect(sim.snapshot.score).toBeGreaterThanOrEqual(gameConfig.combat.score.raider);
  });

  it('the guns swivel: a raider behind the ship is shot by aiming back at it', () => {
    const sim = newSim(holdStill);
    const target = oneRaiderAhead(sim);
    target.pos = vec2(0, 260); // behind
    const events = freeze(sim, target, { fire: true, aimAngle: -FORWARD }, 2);
    expect(types(events)).toContain('raiderDestroyed');
  });

  it('rocks stop laser fire', () => {
    const sim = newSim((s) => {
      holdStill(s);
      s.rocks.count = 1;
    });
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
    const sim = newSim(holdStill);
    oneRaiderAhead(sim).pos = vec2(5000, 0);
    const events = sim.step(DT, { ...IDLE_COMBAT_INPUT, missile: true });
    expect(events).toContainEqual({ type: 'missileDenied', reason: 'noLock' });
    expect(player(sim).missiles).toBe(gameConfig.combat.missiles.count);
  });

  it('holding the aim on a raider locks it after about a second', () => {
    const sim = newSim(holdStill);
    const target = oneRaiderAhead(sim, 500);
    expect(types(freeze(sim, target, {}, 0.8))).not.toContain('lockAcquired');
    expect(types(freeze(sim, target, {}, 0.4))).toContain('lockAcquired');
    expect(sim.snapshot.lock.targetId).toBe(target.id);
  });

  it('the lock follows the aim, not the hull: a raider off to the side locks when aimed at', () => {
    const sim = newSim(holdStill);
    const target = oneRaiderAhead(sim);
    target.pos = vec2(500, 0); // off to the right
    freeze(sim, target, { aimAngle: 0 }, 1.2);
    expect(sim.snapshot.lock.progress).toBe(1);
    expect(sim.snapshot.lock.targetId).toBe(target.id);
  });

  it('a locked missile flies to its raider and destroys it', () => {
    const sim = newSim(holdStill);
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
    const sim = newSim(holdStill);
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
    quiet(sim);
    incoming(sim, 30);
    const events = run(sim, 0.2);
    expect(player(sim).shield).toBe(70);
    expect(player(sim).hull).toBe(100);
    expect(types(events)).toContain('playerDamaged');
  });

  it('once the shields are gone, damage reaches the hull and the shields-down call is made', () => {
    const sim = newSim();
    quiet(sim);
    player(sim).shield = 10;
    player(sim).lastDamageAt = 0; // no recharge before the hit lands
    incoming(sim, 30);
    const events = run(sim, 0.2);
    expect(player(sim).hull).toBe(80);
    expect(events.some((e) => e.type === 'playerDamaged' && e.shieldsDown)).toBe(true);
  });

  it('shields only recharge after a quiet spell', () => {
    const sim = newSim();
    quiet(sim);
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
    expect(sim.step(DT, { ...IDLE_COMBAT_INPUT, throttle: 1 })).toEqual([]);
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

describe('CombatSim: raider missiles', () => {
  const m = gameConfig.combat.enemy.missile;
  /** Hits from a missile (raiders still circle, and a ram also does damage). */
  const missileHits = (events: CombatEvent[]) =>
    events.filter(
      (e) =>
        e.type === 'playerDamaged' &&
        e.amount === gameConfig.combat.difficulty.rookie.missileDamage,
    );

  it('a raider in range launches a homing missile, and the event says which side it comes from', () => {
    const sim = newSim(holdStill);
    const r = oneRaiderAhead(sim);
    r.pos = vec2(0, 600); // behind the ship
    r.missileIn = 0;
    const events = freeze(sim, r, {}, DT);
    r.missileIn = 0;
    const launch = sim.step(DT, IDLE_COMBAT_INPUT);
    const all = [...events, ...launch];
    expect(all).toContainEqual(
      expect.objectContaining({ type: 'enemyMissileLaunched', from: 'behind' }),
    );
    expect(shots(sim).some((s) => s.owner === 'enemy' && s.missile)).toBe(true);
  });

  it('a raider holds its missile while the most allowed are already in flight', () => {
    const sim = newSim(holdStill);
    const r = oneRaiderAhead(sim, 600);
    enemyMissile(sim, vec2(1200, 0)); // rookie allows one at a time
    r.missileIn = 0;
    const events = sim.step(DT, IDLE_COMBAT_INPUT);
    expect(types(events)).not.toContain('enemyMissileLaunched');
  });

  it('a missile homes on the ship and hits for missile damage', () => {
    const sim = newSim(holdStill);
    quiet(sim);
    enemyMissile(sim, vec2(400, -400));
    const events = run(sim, 4);
    const hit = events.find((e) => e.type === 'playerDamaged');
    expect(hit).toMatchObject({ amount: gameConfig.combat.difficulty.rookie.missileDamage });
  });

  it('flying straight at a missile coming head on, it hits (the dodge below is the drift, not luck)', () => {
    const sim = newSim();
    quiet(sim);
    enemyMissile(sim, vec2(0, -500));
    expect(missileHits(run(sim, 3))).toHaveLength(1);
  });

  it('drifting hard sideways dodges a missile coming head on: it can only turn so fast', () => {
    const sim = newSim();
    quiet(sim);
    const ship = gameConfig.combat.ship;
    player(sim).strafe = ship.strafeNotches;
    player(sim).vel = setVelocity(ship.startThrottle, ship.strafeNotches, false, ship);
    enemyMissile(sim, vec2(0, -500));
    const events = run(sim, m.life);
    expect(missileHits(events)).toHaveLength(0);
  });

  it('at the fast notch the ship outruns a missile from behind', () => {
    const sim = newSim();
    quiet(sim);
    const ship = gameConfig.combat.ship;
    const top = ship.forwardSpeeds.length - 1;
    player(sim).throttle = top;
    player(sim).vel = setVelocity(top, 0, false, ship);
    enemyMissile(sim, vec2(0, 300));
    const events = run(sim, m.life);
    expect(missileHits(events)).toHaveLength(0);
  });

  it('lasers shoot a missile down before it lands', () => {
    const sim = newSim(holdStill);
    quiet(sim);
    enemyMissile(sim, vec2(0, -500));
    const events = run(sim, 2, { fire: true });
    expect(types(events)).toContain('enemyMissileDown');
    expect(types(events)).not.toContain('playerDamaged');
    expect(shots(sim).some((s) => s.owner === 'enemy' && s.missile)).toBe(false);
  });

  it('Ace raiders launch missiles more often, and more at once, than Rookie ones', () => {
    const c = gameConfig.combat.difficulty;
    const meanGap = (d: { missileMin: number; missileMax: number }) =>
      (d.missileMin + d.missileMax) / 2;
    expect(meanGap(c.ace)).toBeLessThan(meanGap(c.rookie));
    expect(c.ace.maxMissiles).toBeGreaterThan(c.rookie.maxMissiles);
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
