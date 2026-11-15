/**
 * InteractionSystem - proximity-based focus for interactables.
 *
 * Each update, the nearest interactable whose radius contains the drone is
 * focused. Focus changes are returned (not emitted) so the system stays
 * pure; game.ts emits the `interact:*` events and updates the HUD prompt.
 */
import { distance, type Vec3 } from '../physics/vec3';
import type { Interactable } from './interactable';

export interface FocusChange {
  readonly focused: Interactable | null;
  readonly blurred: Interactable | null;
}

export class InteractionSystem {
  private current: Interactable | null = null;

  get focused(): Interactable | null {
    return this.current;
  }

  /** Recompute focus; returns the change if any, else null. */
  update(dronePosition: Vec3, interactables: readonly Interactable[]): FocusChange | null {
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const candidate of interactables) {
      const d = distance(dronePosition, candidate.position);
      if (d <= candidate.radius && d < bestDist) {
        best = candidate;
        bestDist = d;
      }
    }

    if (best === this.current) return null;
    const change: FocusChange = { focused: best, blurred: this.current };
    this.current = best;
    return change;
  }

  /** Drop focus entirely (used when leaving roaming mode). */
  clear(): FocusChange | null {
    if (!this.current) return null;
    const change: FocusChange = { focused: null, blurred: this.current };
    this.current = null;
    return change;
  }
}
