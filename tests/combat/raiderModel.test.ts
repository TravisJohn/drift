import { describe, expect, it, vi } from 'vitest';
import { drawRaiderModel } from '../../src/combat/raiderModel';

function render(heading: number, distance = 420, commander = false) {
  const point = vi.fn<(x: number, y: number) => void>();
  const bloom = vi.fn(() => ({ addColorStop: vi.fn() }));
  const ctx = {
    fillStyle: '',
    beginPath: vi.fn(),
    moveTo: point,
    lineTo: point,
    closePath: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: bloom,
    fillRect: vi.fn(),
  };
  drawRaiderModel(
    ctx as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, z: distance },
    { cx: 640, cy: 330, focal: 370 },
    1.4,
    heading,
    0,
    commander,
  );
  return { points: point.mock.calls, blooms: bloom.mock.calls.length };
}

describe('cockpit raider model', () => {
  it('shows both exhausts when departing and hides the blooms on a head-on run', () => {
    expect(render(0).blooms).toBe(2);
    const incoming = render(Math.PI);
    expect(incoming.blooms).toBe(0);
    expect(incoming.points.length).toBeGreaterThan(0);
  });

  it('draws finite geometry as the commander crosses the near plane on a fly-by', () => {
    const { points } = render(1.7, 13, true);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(render(1.7, -100, true).points).toHaveLength(0);
  });
});
