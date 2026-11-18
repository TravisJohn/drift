/**
 * Raider behaviour: hold a station around the ship, weaving, and fire
 * leading shots when roughly facing it.
 *
 * The ship always flies forward, so each raider is given a station: a
 * bearing from the nose, at a distance, that sways a little. Most
 * stations are spread across the view ahead; a share sit behind, so the
 * tail still needs watching. A raider keeps station by matching the
 * ship's velocity plus a little toward its station (steering by its
 * motion relative to the ship, or it would always arrive late and trail
 * behind). Holding station ahead, its nose points the way the ship flies,
 * away from it; so every few seconds it makes an attack run: it turns in
 * on the ship (head-on from ahead), fires, and breaks off back to its
 * station. Turning is rate-limited, so a raider has to come about before
 * it can shoot, and its motion lags its nose (momentum), so it swings
 * wide through a turn.
 *
 * Raiders also launch slow homing missiles now and then, from a band of
 * range; those turn gently, so a sideways drift can dodge them.
 */
import { angleBetween, approach, intercept, turnToward } from './combatMath';
import {
  type CombatSettings,
  type DifficultySettings,
  FORWARD,
  type PlayerShip,
  type Raider,
  type Shot,
} from './combatTypes';
import { type Vec2, add, angleOf, distance, fromAngle, length, scale, sub } from './vec2';

type EnemySettings = CombatSettings['enemy'];

/** What a raider needs to know of the ship to keep station on it. */
type Leader = Pick<PlayerShip, 'pos' | 'vel'>;

/**
 * Raider `index`'s station in a wave of `count`: its bearing from the
 * ship's nose (radians, positive to the right). The last `rearShare` of
 * the wave sit behind, spread across the tail; the rest (the commander
 * first) are spread evenly across the arc ahead.
 */
export function stationBearing(index: number, count: number, s: EnemySettings): number {
  const rear = Math.round(count * s.rearShare);
  const ahead = count - rear;
  const spread = (k: number, n: number, arc: number) => -arc + (2 * arc * (k + 0.5)) / n;
  if (index < ahead) return spread(index, ahead, s.aheadArc);
  return Math.PI + spread(index - ahead, rear, s.rearArc);
}

/** The point a raider is heading for at time `time` (around `shipPos`). */
export function stationPoint(raider: Raider, shipPos: Vec2, time: number, s: EnemySettings): Vec2 {
  const sway = Math.sin(time * s.stationSwayRate + raider.phase) * s.stationSway;
  const angle = FORWARD + raider.station + sway;
  const range = s.stationRange + Math.sin(time * 0.9 + raider.phase * 3) * s.stationWeave;
  return add(shipPos, scale(fromAngle(angle), range));
}

/** Turn and move one raider for one step. */
export function steerRaider(
  raider: Raider,
  ship: Leader,
  time: number,
  dt: number,
  s: EnemySettings,
): void {
  // The commander is a little slower and heavier.
  const top = raider.commander ? s.speed * 0.8 : s.speed;
  const want =
    raider.attacking > 0
      ? attackVelocity(raider, ship, top)
      : stationVelocity(raider, ship, time, top, s);
  raider.heading = turnToward(raider.heading, angleOf(want), s.turnRate * dt);
  const speed = length(want);
  const grip = raider.commander ? s.grip * 0.7 : s.grip;
  // Momentum: the motion eases toward the nose's direction instead of
  // snapping to it, so a raider slides wide through its turns.
  const wanted = scale(fromAngle(raider.heading), speed);
  raider.vel = add(raider.vel, scale(sub(wanted, raider.vel), approach(grip, dt)));
  raider.pos = add(raider.pos, scale(raider.vel, dt));
}

/**
 * The velocity that keeps a raider on station: the ship's own, plus a pull
 * toward the station that grows with the distance to it; never more than
 * its top speed.
 */
export function stationVelocity(
  raider: Raider,
  ship: Leader,
  time: number,
  top: number,
  s: EnemySettings,
): Vec2 {
  const toGoal = sub(stationPoint(raider, ship.pos, time, s), raider.pos);
  const gap = length(toGoal);
  const pull = gap > 0 ? scale(toGoal, Math.min(top, gap * s.paceGain) / gap) : toGoal;
  const want = add(ship.vel, pull);
  const speed = length(want);
  return speed > top ? scale(want, top / speed) : want;
}

/** The velocity of an attack run: flat out at where the ship will be. */
function attackVelocity(raider: Raider, ship: Leader, top: number): Vec2 {
  const dir = sub(intercept(raider.pos, ship.pos, ship.vel, top), raider.pos);
  const gap = length(dir);
  return scale(gap > 0 ? scale(dir, 1 / gap) : fromAngle(raider.heading), top);
}

/**
 * Start and end attack runs. Holding station, a raider counts down to its
 * next run; on a run it counts down the run's time, and breaks off early
 * once it is close (so it turns away instead of ramming).
 */
export function updateAttackRun(
  raider: Raider,
  ship: Leader,
  dt: number,
  s: EnemySettings,
  random: () => number,
): void {
  if (raider.attacking > 0) {
    raider.attacking -= dt;
    if (raider.attacking <= 0 || distance(raider.pos, ship.pos) < s.attack.breakRange) {
      raider.attacking = 0;
      raider.attackIn = s.attack.everyMin + random() * (s.attack.everyMax - s.attack.everyMin);
    }
    return;
  }
  raider.attackIn -= dt;
  if (raider.attackIn <= 0) raider.attacking = s.attack.runTime;
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

/**
 * Whether this raider launches a missile this step; the launch direction
 * as an angle, or null. Counts down its missile timer; launches only from
 * the missile range band and while fewer than `maxMissiles` are already
 * in flight (it waits, ready, until both hold).
 */
export function raiderMissile(
  raider: Raider,
  player: Readonly<PlayerShip>,
  inFlight: number,
  dt: number,
  s: EnemySettings,
  d: DifficultySettings,
  random: () => number,
): number | null {
  raider.missileIn -= dt;
  if (raider.missileIn > 0) return null;
  const range = distance(raider.pos, player.pos);
  if (range < s.missile.minRange || range > s.missile.maxRange) return null;
  if (inFlight >= d.maxMissiles) return null;
  raider.missileIn = d.missileMin + random() * (d.missileMax - d.missileMin);
  return angleOf(sub(player.pos, raider.pos));
}

/**
 * Steer a raider's missile at the ship for one step: constant speed, and
 * it can only turn so fast (pure pursuit), so drifting across its path
 * makes it swing wide and miss.
 */
export function steerEnemyMissile(shot: Shot, target: Vec2, dt: number, s: EnemySettings): void {
  const heading = turnToward(
    angleOf(shot.vel),
    angleOf(sub(target, shot.pos)),
    s.missile.turnRate * dt,
  );
  shot.vel = scale(fromAngle(heading), s.missile.speed);
}
