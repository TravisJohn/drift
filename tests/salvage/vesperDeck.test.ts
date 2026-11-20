import { describe, expect, it } from 'vitest';
import { getVesperDeck } from '../../src/salvage/vesperDeck';

const deck = getVesperDeck();

describe('VesperDeck geometry (the approved deck plan)', () => {
  it('has the approved 16 rooms and 26 corridors, all reachable from the airlock', () => {
    expect(Object.keys(deck.rooms)).toHaveLength(16);
    expect(deck.halls).toHaveLength(26);
    // Flood the corridor graph from the airlock.
    const reached = new Set([deck.airlockId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const h of deck.halls) {
        if (reached.has(h.a) !== reached.has(h.b)) {
          reached.add(h.a);
          reached.add(h.b);
          grew = true;
        }
      }
    }
    expect(reached.size).toBe(16);
  });

  it('lets the drone hull fly the full length of every corridor', () => {
    for (const h of deck.halls) {
      for (let i = 1; i < h.points.length; i++) {
        const [x, y] = h.points[i - 1]!;
        const [ex, ey] = h.points[i]!;
        const n = Math.ceil(Math.hypot(ex - x, ey - y));
        for (let j = 0; j <= n; j++) {
          const px = x + ((ex - x) * j) / n;
          const py = y + ((ey - y) * j) / n;
          expect(deck.fits(px, py), `${h.a} / ${h.b} at ${px.toFixed(1)},${py.toFixed(1)}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('keeps every patrol route on open floor so guards never clip through walls', () => {
    for (const p of deck.paths) {
      for (const s of p.segments) {
        for (let j = 0; j <= s.dist; j += 1) {
          expect(deck.fits(s.x + (s.dx * j) / s.dist, s.y + (s.dy * j) / s.dist)).toBe(true);
        }
      }
    }
  });

  it('leaves the breach in the north ring as open space, not floor', () => {
    expect(deck.floor(753, 250)).toBe(false);
  });

  it('places three cell sockets, one each in Hydroponics, Capacitor bank and Reserve stores', () => {
    expect(deck.cells.map((c) => c.name)).toEqual([
      'Hydroponics',
      'Capacitor bank',
      'Reserve stores',
    ]);
    for (const c of deck.cells) expect(deck.fits(c.x, c.y)).toBe(true);
  });

  it('catches hull contact with the visible sight wedge, and a bulkhead blocks it', () => {
    const open = deck.sight(92, 548, 0);
    expect(deck.touches(open, 133, 548)).toBe(true);
    expect(deck.touches(open, 81, 548)).toBe(false); // behind the guard
    expect(deck.touches(open, 150, 548)).toBe(true); // hull grazes the far edge
    expect(deck.touches(open, 154, 548)).toBe(false); // just beyond it
    const clipped = deck.sight(95, 514, -Math.PI / 2);
    expect(deck.touches(clipped, 95, 496)).toBe(false); // through the airlock wall
  });

  it('builds the deck once and shares it', () => {
    expect(getVesperDeck()).toBe(deck);
  });
});
