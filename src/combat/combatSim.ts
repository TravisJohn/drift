/**
 * CombatSim - the tactical fight's rules, one fixed step at a time.
 *
 * Owns the player's ship, the raiders, every shot and the drifting rocks.
 * The ship flies forward and never turns (flight.ts); space is endless,
 * so rocks that fall far behind are recycled ahead of it.
 * `step(dt, input)` advances the fight and returns what happened as
 * CombatEvents; the renderer, the sounds and the ship AI's lines all react
 * to those, so this file never draws, plays or speaks anything.
 *
 * Randomness comes from the injected `random` source, so a fight with a
 * fixed seed plays out the same every time (the tests rely on that).
 */
import { gameConfig } from '../config/gameConfig';
import { angleBetween, clamp, intercept, segmentDistance } from './combatMath';
import {
  type CombatEvent,
  type CombatInput,
  type CombatPhase,
  type CombatSettings,
  type CombatSnapshot,
  type DifficultyId,
  FORWARD,
  type LockState,
  type PlayerShip,
  type Raider,
  type Rock,
  type Shot,
} from './combatTypes';
import {
  raiderMissile,
  raiderShot,
  stationBearing,
  steerEnemyMissile,
  steerRaider,
  updateAttackRun,
} from './enemyAi';
import {
  approachVelocity,
  engineAccel,
  setVelocity,
  sideOf,
  stepStrafe,
  stepThrottle,
} from './flight';
import { type Vec2, add, angleOf, distance, fromAngle, normalize, scale, sub, vec2 } from './vec2';
import {
  coolLasers,
  fireLasers,
  launchMissile,
  lockCandidate,
  steerMissile,
  updateLock,
} from './weapons';

/** Rocks never start this close to the ship's starting point. */
const ROCK_CLEARANCE = 320;
/** Seconds a rock scrape protects the hull from the next one. */
const ROCK_SCRAPE_COOLDOWN = 0.6;
/** Outline points per rock. */
const ROCK_POINTS = 9;
/** Recycled rocks reappear within this angle either side of the nose. */
const ROCK_RESPAWN_ARC = 1.2;

export class CombatSim {
  private phase: CombatPhase = 'fighting';
  private time = 0;
  private wave = 0;
  private score = 0;
  private kills = 0;
  private pauseLeft = 0;
  private nextId = 1;
  private readonly player: PlayerShip;
  private raiders: Raider[] = [];
  private shots: Shot[] = [];
  private readonly rocks: Rock[];
  private readonly lock: LockState = { targetId: null, progress: 0 };
  /** Events gathered during the current step. */
  private events: CombatEvent[] = [];

  constructor(
    readonly difficulty: DifficultyId,
    private readonly random: () => number,
    private readonly s: CombatSettings = gameConfig.combat,
  ) {
    if (s.waves.length === 0) throw new Error('CombatSim: no waves configured');
    this.player = {
      pos: vec2(),
      // Already under way at the starting notch: the ship is never parked.
      vel: setVelocity(s.ship.startThrottle, 0, false, s.ship),
      aim: FORWARD,
      throttle: s.ship.startThrottle,
      strafe: 0,
      shield: s.defence.shieldMax,
      hull: s.defence.hullMax,
      heat: 0,
      overheated: false,
      energy: s.defence.energyMax,
      boosting: false,
      missiles: s.missiles.count,
      shotCooldown: 0,
      missileCooldown: 0,
      lastDamageAt: -Infinity,
      rockCooldown: 0,
    };
    this.rocks = this.makeRocks();
  }

  /**
   * Start the first wave. Separate from the constructor so its
   * `waveStarted` event reaches whoever is listening.
   */
  begin(): CombatEvent[] {
    if (this.wave !== 0) throw new Error('CombatSim: already begun');
    this.events = [];
    this.startWave(1);
    return this.events;
  }

  get snapshot(): CombatSnapshot {
    return {
      phase: this.phase,
      difficulty: this.difficulty,
      time: this.time,
      wave: this.wave,
      waveCount: this.s.waves.length,
      score: this.score,
      kills: this.kills,
      player: this.player,
      raiders: this.raiders,
      shots: this.shots,
      rocks: this.rocks,
      lock: this.lock,
    };
  }

  get isOver(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** Advance the fight by `dt` seconds. Returns what happened. */
  step(dt: number, input: CombatInput): CombatEvent[] {
    this.events = [];
    if (this.wave === 0) throw new Error('CombatSim: call begin() before step()');
    if (this.isOver) return this.events;
    this.time += dt;

    this.movePlayer(dt, input);
    this.updateDefences(dt);
    this.updateWeapons(dt, input);
    this.updateRaiders(dt);
    this.updateRocks(dt);
    this.updateShots(dt);
    this.collideBodies();
    this.updateWaves(dt);
    if (this.player.hull <= 0 && !this.isOver) this.finish('lost');
    return this.events;
  }

  // --- The player's ship ---

  private movePlayer(dt: number, input: CombatInput): void {
    const p = this.player;
    const ship = this.s.ship;
    p.throttle = stepThrottle(p.throttle, input.throttle, ship);
    p.strafe = stepStrafe(p.strafe, input.strafe, ship);
    if (input.aimAngle !== null) p.aim = input.aimAngle;

    const d = this.s.defence;
    // A boost runs until the energy is gone; a new one needs a minimum
    // charge, so holding Shift on an empty bar doesn't trickle-boost.
    p.boosting = input.boost && p.energy > (p.boosting ? 0 : d.boostMinStart);
    p.energy = clamp(p.energy + (p.boosting ? -d.boostDrain : d.energyRefill) * dt, 0, d.energyMax);

    // The engines bring the motion round to the set notches at a limited
    // rate, so a change (or a knock from a rock) takes a moment.
    const target = setVelocity(p.throttle, p.strafe, p.boosting, ship);
    p.vel = approachVelocity(p.vel, target, engineAccel(p.boosting, ship), dt);
    p.pos = add(p.pos, scale(p.vel, dt));
  }

  private updateDefences(dt: number): void {
    const p = this.player;
    const d = this.s.defence;
    p.rockCooldown = Math.max(0, p.rockCooldown - dt);
    if (this.time - p.lastDamageAt > d.shieldRegenDelay) {
      p.shield = Math.min(d.shieldMax, p.shield + d.shieldRegenRate * dt);
    }
  }

  private updateWeapons(dt: number, input: CombatInput): void {
    const p = this.player;
    p.missileCooldown = Math.max(0, p.missileCooldown - dt);
    if (coolLasers(p, dt, this.s.lasers)) this.events.push({ type: 'cooled' });

    const candidate =
      this.phase === 'fighting' ? lockCandidate(p, this.raiders, this.s.missiles) : null;
    if (updateLock(this.lock, candidate, dt, this.s.missiles) && this.lock.targetId !== null) {
      this.events.push({ type: 'lockAcquired', targetId: this.lock.targetId });
    }

    if (input.fire) {
      const volley = fireLasers(p, this.laserAim(candidate), this.s.lasers);
      if (volley.shots.length > 0) {
        this.shots.push(...volley.shots);
        this.events.push({ type: 'laserFired', at: p.pos });
      }
      if (volley.overheatedNow) this.events.push({ type: 'overheated' });
    }

    if (input.missile) {
      const launch = launchMissile(p, this.lock, this.raiders, this.s.missiles);
      if (launch.ok) {
        this.shots.push(launch.shot);
        this.events.push({ type: 'missileFired', at: p.pos });
      } else if (launch.reason !== 'cooling') {
        this.events.push({ type: 'missileDenied', reason: launch.reason });
      }
    }
  }

  /**
   * Where the cannons point: along the aim, or - when a raider sits almost
   * on the aim - where that raider will be (aim help).
   */
  private laserAim(candidate: Raider | null): Vec2 {
    const p = this.player;
    const ahead = add(p.pos, scale(fromAngle(p.aim), 1000));
    if (!candidate) return ahead;
    const off = Math.abs(angleBetween(p.aim, angleOf(sub(candidate.pos, p.pos))));
    if (off > this.s.lasers.assistAngle) return ahead;
    const relative = sub(candidate.vel, p.vel);
    return intercept(p.pos, candidate.pos, relative, this.s.lasers.speed);
  }

  // --- Raiders ---

  private updateRaiders(dt: number): void {
    const diff = this.s.difficulty[this.difficulty];
    for (const r of this.raiders) {
      if (r.dead) continue;
      updateAttackRun(r, this.player, dt, this.s.enemy, this.random);
      steerRaider(r, this.player, this.time, dt, this.s.enemy);
      this.launchRaiderMissile(r, dt);
      const angle = raiderShot(r, this.player, dt, this.s.enemy, diff, this.random);
      if (angle !== null) {
        const dir = fromAngle(angle);
        const origin = add(r.pos, scale(dir, r.radius));
        this.shots.push({
          pos: origin,
          prev: origin,
          vel: scale(dir, this.s.enemy.shotSpeed),
          life: this.s.enemy.shotLife,
          owner: 'enemy',
          damage: diff.shotDamage,
          missile: false,
          targetId: null,
        });
        this.events.push({ type: 'enemyFired', at: origin });
      }
    }
  }

  /** A raider's homing missile, if it decides to launch one this step. */
  private launchRaiderMissile(r: Raider, dt: number): void {
    const diff = this.s.difficulty[this.difficulty];
    const inFlight = this.shots.filter((s) => s.owner === 'enemy' && s.missile).length;
    const angle = raiderMissile(r, this.player, inFlight, dt, this.s.enemy, diff, this.random);
    if (angle === null) return;
    const m = this.s.enemy.missile;
    const dir = fromAngle(angle);
    const origin = add(r.pos, scale(dir, r.radius + m.radius));
    this.shots.push({
      pos: origin,
      prev: origin,
      vel: scale(dir, m.speed),
      life: m.life,
      owner: 'enemy',
      damage: diff.missileDamage,
      missile: true,
      targetId: null,
    });
    this.events.push({
      type: 'enemyMissileLaunched',
      at: origin,
      from: sideOf(origin, this.player.pos),
    });
  }

  // --- Rocks ---

  private makeRocks(): Rock[] {
    const cfg = this.s.rocks;
    const rocks: Rock[] = [];
    for (let i = 0; i < cfg.count; i++) {
      const radius = cfg.minRadius + this.random() * (cfg.maxRadius - cfg.minRadius);
      const range =
        ROCK_CLEARANCE + radius + this.random() * (this.s.fieldRadius * 0.9 - ROCK_CLEARANCE);
      rocks.push({
        pos: scale(fromAngle(this.random() * Math.PI * 2), range),
        vel: scale(fromAngle(this.random() * Math.PI * 2), cfg.drift * (0.4 + this.random())),
        radius,
        angle: this.random() * Math.PI * 2,
        spin: (this.random() * 2 - 1) * 0.25,
        outline: Array.from({ length: ROCK_POINTS }, () => 0.72 + this.random() * 0.4),
      });
    }
    return rocks;
  }

  private updateRocks(dt: number): void {
    for (const rock of this.rocks) {
      rock.pos = add(rock.pos, scale(rock.vel, dt));
      rock.angle += rock.spin * dt;
      // Space is endless: a rock left far behind is recycled ahead.
      if (distance(rock.pos, this.player.pos) > this.s.fieldRadius) {
        const angle = FORWARD + (this.random() * 2 - 1) * ROCK_RESPAWN_ARC;
        const range = this.s.fieldRadius * (0.75 + this.random() * 0.2);
        rock.pos = add(this.player.pos, scale(fromAngle(angle), range));
      }
    }
  }

  // --- Shots ---

  private updateShots(dt: number): void {
    for (const shot of this.shots) {
      if (shot.life <= 0) continue; // shot down earlier this step
      if (shot.missile && shot.owner === 'enemy') {
        steerEnemyMissile(shot, this.player.pos, dt, this.s.enemy);
      } else if (shot.missile) {
        const target = this.raiders.find((r) => r.id === shot.targetId && !r.dead);
        steerMissile(shot, target ? target.pos : null, dt, this.s.missiles);
      }
      shot.prev = shot.pos;
      shot.pos = add(shot.pos, scale(shot.vel, dt));
      shot.life -= dt;
      this.resolveShot(shot);
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  /** Test one shot's path this step against whatever it can hit. */
  private resolveShot(shot: Shot): void {
    const span = (target: Vec2) => segmentDistance(target, shot.prev, shot.pos);
    for (const rock of this.rocks) {
      if (span(rock.pos) < rock.radius * 0.85) {
        shot.life = 0;
        this.events.push({ type: 'hit', at: shot.pos, on: 'rock' });
        return;
      }
    }
    if (shot.owner === 'enemy') {
      const reach = this.s.ship.radius + (shot.missile ? this.s.enemy.missile.radius : 0);
      if (span(this.player.pos) < reach) {
        shot.life = 0;
        this.damagePlayer(shot.damage, shot.pos);
      }
      return;
    }
    if (!shot.missile && this.shootDownMissile(shot, span)) return;
    for (const r of this.raiders) {
      if (r.dead) continue;
      const reach = r.radius + (shot.missile ? this.s.missiles.hitRadius : 4);
      if (span(r.pos) < reach) {
        shot.life = 0;
        this.damageRaider(r, shot.damage, shot.pos);
        return;
      }
    }
  }

  /** A laser bolt meeting a raider's missile destroys both. */
  private shootDownMissile(bolt: Shot, span: (target: Vec2) => number): boolean {
    const reach = this.s.enemy.missile.radius + 4;
    for (const m of this.shots) {
      if (m.owner !== 'enemy' || !m.missile || m.life <= 0) continue;
      if (span(m.pos) < reach) {
        bolt.life = 0;
        m.life = 0;
        this.events.push({ type: 'enemyMissileDown', at: m.pos });
        return true;
      }
    }
    return false;
  }

  // --- Bodies bumping into each other ---

  private collideBodies(): void {
    const p = this.player;
    for (const r of this.raiders) {
      if (r.dead) continue;
      if (distance(r.pos, p.pos) < r.radius + this.s.ship.radius) {
        // A ram costs both sides: the raider is wrecked, the ship hurt.
        this.damagePlayer(this.s.defence.ramDamage, r.pos);
        this.damageRaider(r, r.hp, r.pos);
      }
      for (const rock of this.rocks) this.pushOut(r, rock);
    }
    for (const rock of this.rocks) {
      if (this.pushOut(p, rock) && p.rockCooldown === 0) {
        p.rockCooldown = ROCK_SCRAPE_COOLDOWN;
        this.damagePlayer(this.s.defence.rockDamage, p.pos);
      }
    }
  }

  /** Move a ship out of a rock it overlaps; true if it did overlap. */
  private pushOut(body: { pos: Vec2; vel: Vec2; radius?: number }, rock: Rock): boolean {
    const radius = body.radius ?? this.s.ship.radius;
    const gap = distance(body.pos, rock.pos);
    const minGap = radius + rock.radius * 0.85;
    if (gap >= minGap) return false;
    const away = gap > 0 ? normalize(sub(body.pos, rock.pos)) : vec2(1, 0);
    body.pos = add(rock.pos, scale(away, minGap));
    // Lose the speed heading into the rock.
    const into = Math.min(0, body.vel.x * away.x + body.vel.y * away.y);
    body.vel = sub(body.vel, scale(away, into * 1.4));
    return true;
  }

  // --- Damage ---

  private damagePlayer(amount: number, at: Vec2): void {
    if (this.isOver) return;
    const p = this.player;
    const hadShield = p.shield > 0;
    const absorbed = Math.min(p.shield, amount);
    p.shield -= absorbed;
    p.hull = Math.max(0, p.hull - (amount - absorbed));
    p.lastDamageAt = this.time;
    this.events.push({
      type: 'playerDamaged',
      at,
      amount,
      shieldsDown: hadShield && p.shield === 0,
      hullCritical: p.hull > 0 && p.hull < 30,
    });
  }

  private damageRaider(r: Raider, amount: number, at: Vec2): void {
    r.hp -= amount;
    if (r.hp > 0) {
      this.score += this.s.score.hit;
      this.events.push({ type: 'hit', at, on: 'raider' });
      return;
    }
    r.dead = true;
    this.kills += 1;
    this.score += r.commander ? this.s.score.commander : this.s.score.raider;
    if (this.lock.targetId === r.id) {
      this.lock.targetId = null;
      this.lock.progress = 0;
    }
    this.events.push({ type: 'raiderDestroyed', at: r.pos, commander: r.commander });
  }

  // --- Waves and the end of the fight ---

  private startWave(wave: number): void {
    const count = this.s.waves[wave - 1];
    if (count === undefined) throw new Error(`CombatSim: no wave ${wave}`);
    const diff = this.s.difficulty[this.difficulty];
    const e = this.s.enemy;
    const last = wave === this.s.waves.length;
    this.wave = wave;
    this.phase = 'fighting';
    this.raiders = Array.from({ length: count }, (_, i) => {
      const commander = last && i === 0;
      // Each flies in from the direction of its station, so most of a wave
      // comes from ahead and a few from behind.
      const station = stationBearing(i, count, e);
      const angle = FORWARD + station + (this.random() * 2 - 1) * e.spawnScatter;
      const range = e.spawnMin + this.random() * (e.spawnMax - e.spawnMin);
      const pos = add(this.player.pos, scale(fromAngle(angle), range));
      const hp = commander ? diff.commanderHp : diff.enemyHp;
      return {
        id: this.nextId++,
        commander,
        radius: commander ? e.commanderRadius : e.radius,
        maxHp: hp,
        pos,
        // Already flying with the ship, so it doesn't start parked and
        // get left behind.
        vel: this.player.vel,
        heading: FORWARD,
        hp,
        // Stagger the first shots so a wave doesn't fire all at once.
        fireIn: diff.fireMin * 0.5 + this.random() * diff.fireMax,
        missileIn: diff.missileMin * 0.5 + this.random() * diff.missileMax,
        attackIn: e.attack.everyMin * 0.5 + this.random() * e.attack.everyMax,
        attacking: 0,
        station,
        phase: (i / count) * Math.PI * 2,
        dead: false,
      };
    });
    this.events.push({ type: 'waveStarted', wave, count });
  }

  private updateWaves(dt: number): void {
    if (this.phase === 'fighting') {
      if (this.raiders.length > 0 && this.raiders.every((r) => r.dead)) {
        const last = this.wave === this.s.waves.length;
        this.phase = 'wavePause';
        this.pauseLeft = this.s.wavePause;
        this.events.push({ type: 'waveCleared', wave: this.wave, last });
      }
      return;
    }
    if (this.phase !== 'wavePause') return;
    this.pauseLeft -= dt;
    if (this.pauseLeft > 0) return;
    if (this.wave >= this.s.waves.length) {
      this.finish('won');
      return;
    }
    const p = this.player;
    const d = this.s.defence;
    p.shield = Math.min(d.shieldMax, p.shield + this.s.rearm.shield);
    p.hull = Math.min(d.hullMax, p.hull + this.s.rearm.hull);
    p.missiles = this.s.missiles.count;
    this.startWave(this.wave + 1);
  }

  private finish(outcome: 'won' | 'lost'): void {
    this.phase = outcome;
    if (outcome === 'won') {
      const bonus = this.s.score;
      this.score += Math.round(
        this.player.hull * bonus.hullBonus + this.player.shield * bonus.shieldBonus,
      );
    }
    this.events.push({ type: outcome, score: this.score });
  }
}
