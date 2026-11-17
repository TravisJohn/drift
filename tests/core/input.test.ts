import { describe, expect, it, vi } from 'vitest';
import { InputManager, type InputOptions } from '../../src/core/input';

function key(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return new KeyboardEvent(type, { code });
}

const LEFT = 0;
const RIGHT = 2;
/** MouseEvent.buttons while only the right button is held. */
const RIGHT_HELD = 2;

/** Mouse movement; `buttons` says which buttons are held during it. */
function mouse(movementX: number, movementY: number, buttons = RIGHT_HELD): MouseEvent {
  const e = new MouseEvent('mousemove', { buttons });
  // jsdom doesn't populate movementX/Y from the init dict; define directly.
  Object.defineProperty(e, 'movementX', { value: movementX });
  Object.defineProperty(e, 'movementY', { value: movementY });
  return e;
}

function button(type: 'mousedown' | 'mouseup', which: number): MouseEvent {
  return new MouseEvent(type, { button: which, bubbles: true, cancelable: true });
}

function makeAttached(options?: InputOptions) {
  const input = new InputManager(options);
  input.attach(window);
  return input;
}

describe('InputManager movement axes', () => {
  it('maps WASD to the movement axes', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyW'));
    window.dispatchEvent(key('keydown', 'KeyD'));
    expect(input.sample()).toEqual({ moveX: 1, moveZ: 1, moveY: 0 });
    input.detach();
  });

  it('opposing keys cancel to zero', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyA'));
    window.dispatchEvent(key('keydown', 'KeyD'));
    expect(input.sample().moveX).toBe(0);
    input.detach();
  });

  it('keyup releases the axis', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyW'));
    window.dispatchEvent(key('keyup', 'KeyW'));
    expect(input.sample().moveZ).toBe(0);
    input.detach();
  });

  it('space ascends, shift descends', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'Space'));
    expect(input.sample().moveY).toBe(1);
    window.dispatchEvent(key('keyup', 'Space'));
    window.dispatchEvent(key('keydown', 'ShiftLeft'));
    expect(input.sample().moveY).toBe(-1);
    input.detach();
  });

  it('arrow keys mirror WASD', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'ArrowUp'));
    window.dispatchEvent(key('keydown', 'ArrowLeft'));
    expect(input.sample()).toEqual({ moveX: -1, moveZ: 1, moveY: 0 });
    input.detach();
  });

  it('window blur releases held keys (no stuck movement)', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyW'));
    window.dispatchEvent(new Event('blur'));
    expect(input.sample().moveZ).toBe(0);
    input.detach();
  });

  it('detach stops listening entirely', () => {
    const input = makeAttached();
    input.detach();
    window.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.sample().moveZ).toBe(0);
  });
});

describe('InputManager consumePress (edge detection)', () => {
  it('reports a press exactly once', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyE'));
    expect(input.consumePress('KeyE')).toBe(true);
    expect(input.consumePress('KeyE')).toBe(false); // consumed
    input.detach();
  });

  it('a held key (auto-repeat) does not count as new presses', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyE'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }));
    expect(input.consumePress('KeyE')).toBe(true);
    expect(input.consumePress('KeyE')).toBe(false);
    input.detach();
  });

  it('a new physical press after release registers again', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyE'));
    input.consumePress('KeyE');
    window.dispatchEvent(key('keyup', 'KeyE'));
    window.dispatchEvent(key('keydown', 'KeyE'));
    expect(input.consumePress('KeyE')).toBe(true);
    input.detach();
  });

  it('blur clears pending presses', () => {
    const input = makeAttached();
    window.dispatchEvent(key('keydown', 'KeyE'));
    window.dispatchEvent(new Event('blur'));
    expect(input.consumePress('KeyE')).toBe(false);
    input.detach();
  });
});

describe('InputManager look drag (hold the right mouse button)', () => {
  it('ignores mouse movement until the right button is held', () => {
    const input = makeAttached();
    window.dispatchEvent(mouse(10, 10, 0));
    expect(input.isLooking).toBe(false);
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    input.detach();
  });

  it('accumulates the drag across events and resets on consume', () => {
    const input = makeAttached();
    window.dispatchEvent(button('mousedown', RIGHT));
    expect(input.isLooking).toBe(true);
    window.dispatchEvent(mouse(4, -2));
    window.dispatchEvent(mouse(3, 1));
    expect(input.consumeLookDelta()).toEqual({ dx: 7, dy: -1 });
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    input.detach();
  });

  it('stops looking when the button is released', () => {
    const input = makeAttached();
    window.dispatchEvent(button('mousedown', RIGHT));
    window.dispatchEvent(button('mouseup', RIGHT));
    window.dispatchEvent(mouse(9, 9, 0));
    expect(input.isLooking).toBe(false);
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    input.detach();
  });

  it('the left button does not look: it stays free for clicking', () => {
    const input = makeAttached();
    window.dispatchEvent(button('mousedown', LEFT));
    window.dispatchEvent(mouse(9, 9, 1));
    expect(input.isLooking).toBe(false);
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    // Nor does letting the left button go end a look in progress.
    window.dispatchEvent(button('mousedown', RIGHT));
    window.dispatchEvent(button('mouseup', LEFT));
    expect(input.isLooking).toBe(true);
    input.detach();
  });

  it('a drag only starts on the game view, but carries on outside it', () => {
    const view = document.createElement('canvas');
    const menu = document.createElement('div');
    document.body.append(view, menu);
    const input = new InputManager();
    input.attach(window, view);

    menu.dispatchEvent(button('mousedown', RIGHT)); // a right click on a menu
    expect(input.isLooking).toBe(false);

    view.dispatchEvent(button('mousedown', RIGHT));
    expect(input.isLooking).toBe(true);
    window.dispatchEvent(mouse(5, 5)); // the pointer has left the view
    expect(input.consumeLookDelta()).toEqual({ dx: 5, dy: 5 });
    window.dispatchEvent(button('mouseup', RIGHT)); // released anywhere
    expect(input.isLooking).toBe(false);

    input.detach();
    view.remove();
    menu.remove();
  });

  it('ends the look if the button was let go where no release reached us', () => {
    const input = makeAttached();
    window.dispatchEvent(button('mousedown', RIGHT));
    // Released outside the browser window: the next movement arrives with
    // no button held.
    window.dispatchEvent(mouse(50, 50, 0));
    expect(input.isLooking).toBe(false);
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    input.detach();
  });

  it('window blur ends the look (no view stuck turning)', () => {
    const input = makeAttached();
    window.dispatchEvent(button('mousedown', RIGHT));
    window.dispatchEvent(new Event('blur'));
    expect(input.isLooking).toBe(false);
    input.detach();
  });

  it('keeps the right click from opening the browser menu over the view', () => {
    const view = document.createElement('canvas');
    document.body.append(view);
    const input = new InputManager();
    input.attach(window, view);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    view.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    input.detach();
    // Once detached the game no longer interferes.
    const later = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    view.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
    view.remove();
  });

  it('reports when looking starts and ends, once each', () => {
    const onLookChange = vi.fn();
    const input = makeAttached({ onLookChange });
    window.dispatchEvent(button('mousedown', RIGHT));
    window.dispatchEvent(button('mousedown', RIGHT)); // already looking
    window.dispatchEvent(button('mouseup', RIGHT));
    expect(onLookChange.mock.calls).toEqual([[true], [false]]);
    input.detach();
  });

  it('detaching mid-drag ends the look', () => {
    const onLookChange = vi.fn();
    const input = makeAttached({ onLookChange });
    window.dispatchEvent(button('mousedown', RIGHT));
    input.detach();
    expect(input.isLooking).toBe(false);
    expect(onLookChange).toHaveBeenLastCalledWith(false);
  });
});
