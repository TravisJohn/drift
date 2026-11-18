/**
 * The shapes the tactical combat simulation works with.
 *
 * The simulation (combatSim.ts) owns mutable instances of these; everyone
 * else (renderer, sounds, overlay) reads them through CombatSnapshot and
 * reacts to the CombatEvents each step returns. Nothing here touches the
 * DOM, the canvas or audio, so the rules can be tested on their own.
 */
import type { gameConfig } from '../config/gameConfig';
import type { Vec2 } from './vec2';

/**
 * A config shape with its literal values loosened (3 → number, a fixed
 * tuple → an array), so tests can pass their own tuning.
 */
type Widen<T> = T extends number
  ? number
  : T extends boolean
    ? boolean
    : T extends string
      ? string
      : T extends readonly (infer U)[]
        ? readonly Widen<U>[]
        : { readonly [K in keyof T]: Widen<T[K]> };

export type CombatSettings = Widen<typeof gameConfig.combat>;
export type DifficultyId = keyof CombatSettings['difficulty'];
export type DifficultySettings = CombatSettings['difficulty'][DifficultyId];

/**
 * The way the ship always faces: up the map (headings grow clockwise from
 * +x, with +y down the screen). The hull never rotates.
 */
export const FORWARD = -Math.PI / 2;

/** Which side of the ship something is on, relative to FORWARD. */
export type Side = 'ahead' | 'left' | 'right' | 'behind';

/** What the player is asking for this step. */
export interface CombatInput {
  /** Throttle notches to step this step: +1 per W tap, −1 per S tap. */
  readonly throttle: number;
  /** Drift notches to step this step: +1 per D tap (right), −1 per A tap. */
  readonly strafe: number;
  /** Where the guns should point (map radians), or null to leave them be. */
  readonly aimAngle: number | null;
  readonly fire: boolean;
  readonly boost: boolean;
  /** True on the step a missile is asked for (a press, not a hold). */
  readonly missile: boolean;
}

export const IDLE_COMBAT_INPUT: CombatInput = {
  throttle: 0,
  strafe: 0,
  aimAngle: null,
  fire: false,
  boost: false,
  missile: false,
};

export interface PlayerShip {
  pos: Vec2;
  vel: Vec2;
  /** Where the swivelling guns point (map radians). The hull faces FORWARD. */
  aim: number;
  /** Throttle notch: an index into ship.forwardSpeeds. */
  throttle: number;
  /** Drift notch: −strafeNotches (left) .. strafeNotches (right). */
  strafe: number;
  shield: number;
  hull: number;
  heat: number;
  overheated: boolean;
  energy: number;
  boosting: boolean;
  missiles: number;
  shotCooldown: number;
  missileCooldown: number;
  /** Simulation time of the last hit (shields wait before recharging). */
  lastDamageAt: number;
  /** Seconds until a rock can scrape the hull again. */
  rockCooldown: number;
}

export interface Raider {
  readonly id: number;
  readonly commander: boolean;
  readonly radius: number;
  readonly maxHp: number;
  pos: Vec2;
  vel: Vec2;
  heading: number;
  hp: number;
  /** Seconds until it may fire again. */
  fireIn: number;
  /** Seconds until it may launch a missile. */
  missileIn: number;
  /** Seconds until its next attack run (while holding station). */
  attackIn: number;
  /** Seconds left of the attack run it is on; 0 while holding station. */
  attacking: number;
  /** Its station: a bearing from the ship's nose (radians, + right). */
  readonly station: number;
  /** Its own offset in the weaving, so raiders don't move in step. */
  readonly phase: number;
  dead: boolean;
}

export interface Shot {
  pos: Vec2;
  /** Where it was last step: hits are tested along prev → pos. */
  prev: Vec2;
  vel: Vec2;
  life: number;
  readonly owner: 'player' | 'enemy';
  readonly damage: number;
  /** A homing missile: the player's (at a raider) or a raider's (at the ship). */
  readonly missile: boolean;
  /** A player missile's quarry (raider id); null otherwise. */
  readonly targetId: number | null;
}

export interface Rock {
  pos: Vec2;
  vel: Vec2;
  readonly radius: number;
  angle: number;
  readonly spin: number;
  /** Outline: radius multipliers at evenly spaced angles. */
  readonly outline: readonly number[];
}

export interface LockState {
  /** The raider being locked (or held), or null. */
  targetId: number | null;
  /** 0..1; a missile can fly at 1. */
  progress: number;
}

export type CombatPhase = 'fighting' | 'wavePause' | 'won' | 'lost';

export type CombatEvent =
  | { readonly type: 'waveStarted'; readonly wave: number; readonly count: number }
  | { readonly type: 'waveCleared'; readonly wave: number; readonly last: boolean }
  | { readonly type: 'laserFired'; readonly at: Vec2 }
  | { readonly type: 'enemyFired'; readonly at: Vec2 }
  | { readonly type: 'enemyMissileLaunched'; readonly at: Vec2; readonly from: Side }
  | { readonly type: 'enemyMissileDown'; readonly at: Vec2 }
  | { readonly type: 'missileFired'; readonly at: Vec2 }
  | { readonly type: 'missileDenied'; readonly reason: 'noLock' | 'empty' }
  | { readonly type: 'lockAcquired'; readonly targetId: number }
  | { readonly type: 'overheated' }
  | { readonly type: 'cooled' }
  | { readonly type: 'hit'; readonly at: Vec2; readonly on: 'raider' | 'rock' }
  | { readonly type: 'raiderDestroyed'; readonly at: Vec2; readonly commander: boolean }
  | {
      readonly type: 'playerDamaged';
      readonly at: Vec2;
      readonly amount: number;
      readonly shieldsDown: boolean;
      readonly hullCritical: boolean;
    }
  | { readonly type: 'won'; readonly score: number }
  | { readonly type: 'lost'; readonly score: number };

export type CombatEventType = CombatEvent['type'];

/** Read-only view of the fight, for drawing and the readouts. */
export interface CombatSnapshot {
  readonly phase: CombatPhase;
  readonly difficulty: DifficultyId;
  readonly time: number;
  readonly wave: number;
  readonly waveCount: number;
  readonly score: number;
  readonly kills: number;
  readonly player: Readonly<PlayerShip>;
  readonly raiders: readonly Readonly<Raider>[];
  readonly shots: readonly Readonly<Shot>[];
  readonly rocks: readonly Readonly<Rock>[];
  readonly lock: Readonly<LockState>;
}
