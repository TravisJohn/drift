/**
 * What every way of showing the fight provides. The simulation knows
 * nothing about views; the overlay picks one (the tactical hologram or
 * the cockpit) and feeds it the same snapshot and events.
 */
import type { CombatEvent, CombatSnapshot } from './combatTypes';
import type { Vec2 } from './vec2';

export type CombatViewId = 'tactical' | 'cockpit';

/** What the pilot's hands are doing, for views that show it. */
export interface PilotState {
  /** Current turn, −1..1 (the cockpit banks with it). */
  readonly turn: number;
  /** The flight stick's position, −1..1 each way, or null if the mouse isn't steering. */
  readonly stick: Vec2 | null;
}

export interface CombatView {
  /** The canvas's size in CSS pixels and the device pixel ratio. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** Turn this step's events into visual effects. */
  react(events: readonly CombatEvent[]): void;
  /** Draw one frame; `dt` moves visual-only effects. */
  draw(view: CombatSnapshot, dt: number, pilot: PilotState): void;
}
