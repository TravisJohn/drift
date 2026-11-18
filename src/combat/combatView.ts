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
  /** The mouse over the view (CSS px), or null before it moves. */
  readonly pointer: Vec2 | null;
}

export interface CombatView {
  /** The canvas's size in CSS pixels and the device pixel ratio. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** Turn this step's events into visual effects. */
  react(events: readonly CombatEvent[]): void;
  /**
   * The gun angle (map radians) the mouse at `pointer` asks for in this
   * view, or null when it asks for nothing (e.g. sitting on the ship).
   */
  aimAt(pointer: Vec2, view: CombatSnapshot): number | null;
  /** Draw one frame; `dt` moves visual-only effects. */
  draw(view: CombatSnapshot, dt: number, pilot: PilotState): void;
}
