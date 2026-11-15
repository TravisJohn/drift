/**
 * Input: keyboard + mouse, mapped to named actions.
 *
 * Gameplay code never reads raw key codes - it samples `InputActions` once
 * per logic step. Mouse look deltas accumulate between steps and are
 * consumed (read-and-reset) so none are lost and none are double-counted.
 *
 * Bindings (M1):
 *   W/S or arrows  - forward/back (relative to camera yaw)
 *   A/D or arrows  - strafe left/right
 *   Space / Shift  - ascend / descend
 *   Mouse (locked) - orbit the camera
 */

export interface InputActions {
  /** Strafe axis: -1 (left) .. 1 (right). */
  readonly moveX: number;
  /** Forward axis: -1 (back) .. 1 (forward). */
  readonly moveZ: number;
  /** Vertical axis: -1 (descend) .. 1 (ascend). */
  readonly moveY: number;
}

export interface LookDelta {
  readonly dx: number;
  readonly dy: number;
}

type Target = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export class InputManager {
  private readonly pressed = new Set<string>();
  /** Keys pressed since last consumed - edge detection for E, Esc etc. */
  private readonly justPressed = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  private target: Target | null = null;

  /** When set, mouse deltas only accumulate while this returns true. */
  private readonly isLookActive: () => boolean;

  constructor(isLookActive: () => boolean = () => true) {
    this.isLookActive = isLookActive;
  }

  attach(target: Target = window): void {
    if (this.target) this.detach();
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.pressed.clear();
    this.justPressed.clear();
  }

  /** Current movement axes; sampled once per fixed update. */
  sample(): InputActions {
    const axis = (neg: boolean, pos: boolean): number => (pos ? 1 : 0) - (neg ? 1 : 0);
    return {
      moveX: axis(
        this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'),
        this.pressed.has('KeyD') || this.pressed.has('ArrowRight'),
      ),
      moveZ: axis(
        this.pressed.has('KeyS') || this.pressed.has('ArrowDown'),
        this.pressed.has('KeyW') || this.pressed.has('ArrowUp'),
      ),
      moveY: axis(
        this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'),
        this.pressed.has('Space'),
      ),
    };
  }

  /**
   * True exactly once per physical key press (auto-repeat ignored).
   * Call once per fixed update for each key of interest.
   */
  consumePress(code: string): boolean {
    const was = this.justPressed.has(code);
    this.justPressed.delete(code);
    return was;
  }

  /** Accumulated mouse movement since the last call; resets on read. */
  consumeLookDelta(): LookDelta {
    const delta = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    return delta;
  }

  private readonly onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    // Keep the browser from scrolling/space-paging while playing.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) this.justPressed.add(e.code);
    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (event: Event): void => {
    this.pressed.delete((event as KeyboardEvent).code);
  };

  private readonly onMouseMove = (event: Event): void => {
    if (!this.isLookActive()) return;
    const e = event as MouseEvent;
    this.lookDx += e.movementX;
    this.lookDy += e.movementY;
  };

  /** Losing focus releases all keys, or they'd stay stuck "down". */
  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.justPressed.clear();
  };
}
