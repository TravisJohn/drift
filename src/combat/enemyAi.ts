/**
 * Raider behaviour: circle the ship at a distance, weaving, and fire
 * leading shots when roughly facing it.
 *
 * An arcade approximation, as in STARFALL: each raider steers toward a
 * point on a slowly turning ring around the player, so a wave spreads out
 * around the ship instead of queueing in a line. Turning is rate-limited,
 * so a raider has to come about before it can shoot.
 */
import { angleBetween, intercept, turnToward } from './combatMath';
import type { CombatSettings, DifficultySettings, PlayerShip, Raider } from './combatTypes';
import { type Vec2, add, angleOf, distance, fromAngle, scale, sub } from './vec2';

type EnemySettings = CombatSettings['enemy'];

/** The point a raider is heading for at time `time`. */
export function orbitPoint(raider: Raider, playerPos: Vec2, time: number, s: EnemySettings): Vec2 {
  const angle = raider.phase + time * 0.35;
  const range = s.orbitRange + Math.sin(time * 0.9 + raider.phase * 3) * s.orbitWeave;
  return add(playerPos, scale(fromAngle(angle), range));
}

/** Turn and move one raider for one step. */
export function steerRaider(
  raider: Raider,
  playerPos: Vec2,
  time: number,
  dt: number,
  s: EnemySettings,
): void {
  const goal = orbitPoint(raider, playerPos, time, s);
  raider.heading = turnToward(raider.heading, angleOf(sub(goal, raider.pos)), s.turnRate * dt);
  // The commander is a little slower and heavier.
  const speed = raider.commander ? s.speed * 0.8 : s.speed;
  raider.vel = scale(fromAngle(raider.heading), speed);
  raider.pos = add(raider.pos, scale(raider.vel, dt));
}

/**
 * Whether this raider fires this step, and in which direction.
 * Counts down its fire timer; fires a leading shot (with some aim error)
 * when in range and roughly facing the ship. Returns the shot direction
 * as an angle, or null.
 */
export function raiderShot(
  raider: Raider,
  player: Readonly<PlayerShip>,
  dt: number,
  s: EnemySettings,
  d: DifficultySettings,
  random: () => number,
): number | null {
  raider.fireIn -= dt;
  if (raider.fireIn > 0) return null;
  if (distance(raider.pos, player.pos) > s.fireRange) return null;
  const aim = intercept(raider.pos, player.pos, player.vel, s.shotSpeed);
  const aimAngle = angleOf(sub(aim, raider.pos));
  if (Math.abs(angleBetween(raider.heading, aimAngle)) > s.fireAngle) return null;
  raider.fireIn = d.fireMin + random() * (d.fireMax - d.fireMin);
  return aimAngle + (random() * 2 - 1) * d.spread;
}
