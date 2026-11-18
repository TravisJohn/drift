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

/** What the player is asking for this step. */
export interface CombatInput {
  /** 1 thrust forward, −1 brake, 0 coast. */
  readonly thrust: number;
  /** Keyboard turn: −1 left .. 1 right. Overrides the mouse aim while held. */
  readonly turn: number;
  /** Heading the mouse points at (radians), or null when it isn't steering. */
  readonly aimAngle: number | null;
  readonly fire: boolean;
  readonly boost: boolean;
  /** True on the step a missile is asked for (a press, not a hold). */
  readonly missile: boolean;
}

export const IDLE_COMBAT_INPUT: CombatInput = {
  thrust: 0,
  turn: 0,
  aimAngle: null,
  fire: false,
  boost: false,
  missile: false,
};

export interface PlayerShip {
  pos: Vec2;
  vel: Vec2;
  heading: number;
  /** Turning speed now, radians a second (clockwise positive). */
  spin: number;
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
  /** Its own offset in the circling pattern, so raiders spread out. */
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
  readonly missile: boolean;
  /** A missile's quarry (raider id); null for lasers. */
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
