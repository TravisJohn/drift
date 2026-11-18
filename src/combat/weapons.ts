/**
 * The ship's weapons: twin lasers with heat, missile lock and homing.
 *
 * Rules from STARFALL: every laser shot adds heat; at full heat the
 * cannons lock out until they cool below a threshold. Holding one raider
 * near the nose builds a lock over about a second; a missile needs a full
 * lock and steers itself onto its target.
 *
 * These functions mutate the objects they are given (the simulation owns
 * them) and report what happened, so the simulation can turn that into
 * events.
 */
import { angleBetween, approach } from './combatMath';
import type { CombatSettings, LockState, PlayerShip, Raider, Shot } from './combatTypes';
import { type Vec2, add, angleOf, distance, scale, sub, vec2, normalize } from './vec2';

type LaserSettings = CombatSettings['lasers'];
type MissileSettings = CombatSettings['missiles'];

/** Cool the cannons for one step. True when an overheat has just cleared. */
export function coolLasers(player: PlayerShip, dt: number, s: LaserSettings): boolean {
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
  player.heat = Math.max(
    0,
    player.heat - dt * (player.overheated ? s.overheatedCoolRate : s.coolRate),
  );
  if (player.overheated && player.heat < s.resumeHeat) {
    player.overheated = false;
    return true;
  }
  return false;
}

export interface LaserVolley {
  /** The shots fired (empty when the cannons could not fire). */
  readonly shots: Shot[];
  /** True when this volley pushed the cannons into overheat. */
  readonly overheatedNow: boolean;
}

/**
 * Fire both cannons toward `aim` (a world point), if they are ready.
 * Each cannon sits `spread` units either side of the nose.
 */
export function fireLasers(player: PlayerShip, aim: Vec2, s: LaserSettings): LaserVolley {
  if (player.overheated || player.shotCooldown > 0) return { shots: [], overheatedNow: false };
  player.shotCooldown = s.cooldown;
  player.heat = Math.min(100, player.heat + s.heatPerShot);
  const overheatedNow = player.heat >= 100;
  if (overheatedNow) player.overheated = true;

  const side = vec2(-Math.sin(player.heading), Math.cos(player.heading));
  const shots: Shot[] = [-1, 1].map((k) => {
    const origin = add(player.pos, scale(side, k * s.spread));
    const dir = normalize(sub(aim, origin));
    return {
      pos: origin,
      prev: origin,
      // Shots inherit the ship's own motion, so they leave the nose cleanly.
      vel: add(scale(dir, s.speed), player.vel),
      life: s.life,
      owner: 'player',
      damage: s.damage,
      missile: false,
      targetId: null,
    };
  });
  return { shots, overheatedNow };
}

/**
 * The raider a missile would lock: the one nearest the nose, within the
 * lock angle and range. Null when none qualifies.
 */
export function lockCandidate(
  player: PlayerShip,
  raiders: readonly Raider[],
  s: MissileSettings,
): Raider | null {
  let best: Raider | null = null;
  let bestOff = Infinity;
  for (const r of raiders) {
    if (r.dead) continue;
    const range = distance(r.pos, player.pos);
    if (range > s.lockRange) continue;
    const off = Math.abs(angleBetween(player.heading, angleOf(sub(r.pos, player.pos))));
    if (off <= s.lockAngle && off < bestOff) {
      best = r;
      bestOff = off;
    }
  }
  return best;
}

/**
 * Advance the lock for one step. Staying on the same raider builds the
 * lock; switching starts over; nothing in the sights lets it decay.
 * Returns true on the step the lock completes.
 */
export function updateLock(
  lock: LockState,
  candidate: Raider | null,
  dt: number,
  s: MissileSettings,
): boolean {
  if (!candidate) {
    lock.progress = Math.max(0, lock.progress - dt * 2);
    if (lock.progress === 0) lock.targetId = null;
    return false;
  }
  if (lock.targetId !== candidate.id) {
    lock.targetId = candidate.id;
    lock.progress = 0;
    return false;
  }
  const before = lock.progress;
  lock.progress = Math.min(1, lock.progress + dt / s.lockSeconds);
  return before < 1 && lock.progress >= 1;
}

export type MissileLaunch =
  | { readonly ok: true; readonly shot: Shot }
  | { readonly ok: false; readonly reason: 'noLock' | 'empty' | 'cooling' };

/** Launch a missile at the locked raider, if there is a full lock. */
export function launchMissile(
  player: PlayerShip,
  lock: LockState,
  raiders: readonly Raider[],
  s: MissileSettings,
): MissileLaunch {
  if (player.missiles <= 0) return { ok: false, reason: 'empty' };
  if (player.missileCooldown > 0) return { ok: false, reason: 'cooling' };
  const target = raiders.find((r) => r.id === lock.targetId && !r.dead);
  if (lock.progress < 1 || !target) return { ok: false, reason: 'noLock' };
  player.missiles -= 1;
  player.missileCooldown = s.cooldown;
  lock.progress = 0;
  const forward = vec2(Math.cos(player.heading), Math.sin(player.heading));
  return {
    ok: true,
    shot: {
      pos: player.pos,
      prev: player.pos,
      vel: add(player.vel, scale(forward, s.launchSpeed)),
      life: s.life,
      owner: 'player',
      damage: s.damage,
      missile: true,
      targetId: target.id,
    },
  };
}

/** Bend a missile's course toward its target (if the target still exists). */
export function steerMissile(
  shot: Shot,
  target: Vec2 | null,
  dt: number,
  s: MissileSettings,
): void {
  if (!target) return;
  const desired = scale(normalize(sub(target, shot.pos)), s.speed);
  const k = approach(s.homing, dt);
  shot.vel = add(scale(shot.vel, 1 - k), scale(desired, k));
}
