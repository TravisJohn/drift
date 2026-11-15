import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/core/input';

function key(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return new KeyboardEvent(type, { code });
}

function mouse(movementX: number, movementY: number): MouseEvent {
  const e = new MouseEvent('mousemove');
  // jsdom doesn't populate movementX/Y from the init dict; define directly.
  Object.defineProperty(e, 'movementX', { value: movementX });
  Object.defineProperty(e, 'movementY', { value: movementY });
  return e;
}

function makeAttached(isLookActive?: () => boolean) {
  const input = new InputManager(isLookActive);
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

describe('InputManager mouse look', () => {
  it('accumulates deltas across events and resets on consume', () => {
    const input = makeAttached();
    window.dispatchEvent(mouse(4, -2));
    window.dispatchEvent(mouse(3, 1));
    expect(input.consumeLookDelta()).toEqual({ dx: 7, dy: -1 });
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    input.detach();
  });

  it('ignores mouse movement while look is inactive (pointer not locked)', () => {
    let locked = false;
    const input = makeAttached(() => locked);
    window.dispatchEvent(mouse(10, 10));
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
    locked = true;
    window.dispatchEvent(mouse(5, 5));
    expect(input.consumeLookDelta()).toEqual({ dx: 5, dy: 5 });
    input.detach();
  });
});
