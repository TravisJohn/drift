import { describe, expect, it, vi } from 'vitest';
import type { Interactable } from '../../src/interaction/interactable';
import { InteractionSystem } from '../../src/interaction/interactionSystem';
import { vec3 } from '../../src/physics/vec3';

const make = (id: string, x: number, z: number, radius = 2): Interactable => ({
  id,
  position: vec3(x, 1, z),
  radius,
  promptText: `[E] ${id}`,
  onInteract: vi.fn(),
});

describe('InteractionSystem', () => {
  it('focuses an interactable when the drone enters its radius', () => {
    const system = new InteractionSystem();
    const helm = make('helm', 0, 0);
    expect(system.update(vec3(5, 1, 0), [helm])).toBeNull(); // out of range
    const change = system.update(vec3(1, 1, 0), [helm]);
    expect(change?.focused?.id).toBe('helm');
    expect(change?.blurred).toBeNull();
    expect(system.focused?.id).toBe('helm');
  });

  it('blurs when the drone leaves the radius', () => {
    const system = new InteractionSystem();
    const helm = make('helm', 0, 0);
    system.update(vec3(1, 1, 0), [helm]);
    const change = system.update(vec3(5, 1, 0), [helm]);
    expect(change?.focused).toBeNull();
    expect(change?.blurred?.id).toBe('helm');
  });

  it('returns null when focus is unchanged (no event spam)', () => {
    const system = new InteractionSystem();
    const helm = make('helm', 0, 0);
    system.update(vec3(1, 1, 0), [helm]);
    expect(system.update(vec3(1.1, 1, 0), [helm])).toBeNull();
  });

  it('the nearest of several in-range interactables wins', () => {
    const system = new InteractionSystem();
    const near = make('near', 1, 0, 3);
    const far = make('far', 2.5, 0, 3);
    const change = system.update(vec3(0, 1, 0), [far, near]);
    expect(change?.focused?.id).toBe('near');
  });

  it('switches focus directly from one interactable to another', () => {
    const system = new InteractionSystem();
    const a = make('a', 0, 0, 2);
    const b = make('b', 3, 0, 2);
    system.update(vec3(0.5, 1, 0), [a, b]);
    const change = system.update(vec3(2.6, 1, 0), [a, b]);
    expect(change?.blurred?.id).toBe('a');
    expect(change?.focused?.id).toBe('b');
  });

  it('clear() blurs the current focus', () => {
    const system = new InteractionSystem();
    const helm = make('helm', 0, 0);
    system.update(vec3(1, 1, 0), [helm]);
    const change = system.clear();
    expect(change?.blurred?.id).toBe('helm');
    expect(system.focused).toBeNull();
    expect(system.clear()).toBeNull(); // idempotent
  });

  it('vertical distance counts too (no focusing through the ceiling)', () => {
    const system = new InteractionSystem();
    const helm = make('helm', 0, 0, 1.5);
    expect(system.update(vec3(0, 3, 0), [helm])).toBeNull(); // 2m above (pos y=1)
  });
});
