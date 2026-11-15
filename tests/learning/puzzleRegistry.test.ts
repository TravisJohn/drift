import { describe, expect, it } from 'vitest';
import { PuzzleRegistry } from '../../src/learning/puzzleRegistry';
import type { PuzzleModule } from '../../src/learning/puzzleModule';

const fake = (id: string): PuzzleModule => ({
  id,
  title: `Fake ${id}`,
  mount: () => undefined,
  unmount: () => undefined,
});

describe('PuzzleRegistry', () => {
  it('registers and returns modules by id', () => {
    const registry = new PuzzleRegistry();
    const module = fake('aws-drill');
    registry.register(module);
    expect(registry.get('aws-drill')).toBe(module);
    expect(registry.has('aws-drill')).toBe(true);
    expect(registry.ids()).toEqual(['aws-drill']);
  });

  it('rejects duplicate registration (fail loud)', () => {
    const registry = new PuzzleRegistry();
    registry.register(fake('one'));
    expect(() => registry.register(fake('one'))).toThrow(/duplicate/);
  });

  it('unknown lookups throw instead of returning undefined', () => {
    const registry = new PuzzleRegistry();
    expect(() => registry.get('missing')).toThrow(/no module registered/);
    expect(registry.has('missing')).toBe(false);
  });
});
