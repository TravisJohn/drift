/**
 * Input: keyboard + mouse, mapped to named actions.
 *
 * Gameplay code never reads raw key codes - it samples `InputActions` once
 * per logic step. Mouse look deltas accumulate between steps and are
 * consumed (read-and-reset) so none are lost and none are double-counted.
 *
 * Bindings:
 *   W/S or arrows       - forward/back (relative to camera yaw)
 *   A/D or arrows       - strafe left/right
 *   Space / Shift       - ascend / descend
 *   Right mouse + drag  - look around (the pointer stays free otherwise,
 *                         so menus and panels can be clicked at any time)
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

export interface InputOptions {
  /** Told when a look drag starts (true) and when it ends (false). */
  readonly onLookChange?: (looking: boolean) => void;
}

type Target = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** MouseEvent.button of the button that is held to look: the right one. */
const LOOK_BUTTON = 2;
/** The same button's bit in MouseEvent.buttons. */
const LOOK_BUTTON_MASK = 2;

export class InputManager {
  private readonly pressed = new Set<string>();
  /** Keys pressed since last consumed - edge detection for E, Esc etc. */
  private readonly justPressed = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  private looking = false;
  private target: Target | null = null;
  private lookSurface: Target | null = null;

  constructor(private readonly options: InputOptions = {}) {}

  /**
   * Start listening. Keys and mouse movement are read from `target`; a
   * look drag can only begin on `lookSurface` (the game view), so a right
   * click on a menu lying over it does nothing.
   */
  attach(target: Target = window, lookSurface: Target = target): void {
    if (this.target) this.detach();
    this.target = target;
    this.lookSurface = lookSurface;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Movement and release are read from the whole window, so a drag that
    // wanders off the game view keeps working and always ends.
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('blur', this.onBlur);
    lookSurface.addEventListener('mousedown', this.onMouseDown);
    lookSurface.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.target || !this.lookSurface) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.lookSurface.removeEventListener('mousedown', this.onMouseDown);
    this.lookSurface.removeEventListener('contextmenu', this.onContextMenu);
    this.target = null;
    this.lookSurface = null;
    this.pressed.clear();
    this.justPressed.clear();
    this.setLooking(false);
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

  /** True while the look button is held after being pressed on the view. */
  get isLooking(): boolean {
    return this.looking;
  }

  /** Accumulated look-drag movement since the last call; resets on read. */
  consumeLookDelta(): LookDelta {
    const delta = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    return delta;
  }

  private setLooking(looking: boolean): void {
    if (this.looking === looking) return;
    this.looking = looking;
    this.options.onLookChange?.(looking);
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

  private readonly onMouseDown = (event: Event): void => {
    if ((event as MouseEvent).button === LOOK_BUTTON) this.setLooking(true);
  };

  private readonly onMouseUp = (event: Event): void => {
    if ((event as MouseEvent).button === LOOK_BUTTON) this.setLooking(false);
  };

  private readonly onMouseMove = (event: Event): void => {
    if (!this.looking) return;
    const e = event as MouseEvent;
    // The button can be let go where no release reaches us (outside the
    // browser window): the next movement shows it is up, and looking ends.
    if ((e.buttons & LOOK_BUTTON_MASK) === 0) {
      this.setLooking(false);
      return;
    }
    this.lookDx += e.movementX;
    this.lookDy += e.movementY;
  };

  /** The right button looks around; it must not also open the browser's menu. */
  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  /** Losing focus releases all keys, or they'd stay stuck "down". */
  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.justPressed.clear();
    this.setLooking(false);
  };
}
