/**
 * Interactable - anything the drone can approach and activate with E.
 */
import type { Vec3 } from '../physics/vec3';

export interface Interactable {
  readonly id: string;
  /** World position the proximity check measures against. */
  readonly position: Vec3;
  /** Activation radius in meters. */
  readonly radius: number;
  /** Shown in the HUD prompt while focused, e.g. "Helm — set course". */
  readonly promptText: string;
  /** Called when the player presses E while this is focused. */
  onInteract(): void;
}
