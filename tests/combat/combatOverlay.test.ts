import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CombatEvent } from '../../src/combat/combatTypes';
import { mulberry32 } from '../../src/core/random';
import { gameConfig } from '../../src/config/gameConfig';
import { type CombatCallbacks, CombatOverlay } from '../../src/ui/combatOverlay';

const DT = 1 / 60;

/**
 * jsdom has no 2D canvas. A context where every method is a no-op (and
 * gradients accept colour stops) lets the real renderer run, so these
 * tests cover the overlay, the rules and the drawing calls together.
 */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key) =>
      key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : () => {},
    set: () => true,
  });
}

describe('CombatOverlay', () => {
  let overlay: CombatOverlay;
  let played: CombatEvent[];
  let onEnd: Mock<CombatCallbacks['onEnd']>;
  const key = (type: 'keydown' | 'keyup', code: string): void => {
    document.dispatchEvent(new KeyboardEvent(type, { code }));
  };
  const press = (code: string): void => {
    key('keydown', code);
    key('keyup', code);
  };
  const steps = (seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / DT); i++) overlay.update(DT);
  };
  const text = (): string => document.getElementById('combat')?.textContent ?? '';

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => fakeContext(),
    );
    played = [];
    onEnd = vi.fn<CombatCallbacks['onEnd']>();
    overlay = new CombatOverlay({
      audio: { play: (events) => played.push(...events) },
      random: mulberry32(3),
      resultsDelay: 0.2,
    });
    overlay.open('rookie', { onEnd });
  });

  afterEach(() => {
    overlay.close();
    vi.restoreAllMocks();
  });

  it('opens on the first wave, announces it and shows the readouts', () => {
    expect(overlay.isOpen).toBe(true);
    expect(played).toContainEqual({ type: 'waveStarted', wave: 1, count: 5 });
    expect(text()).toContain('Wave 1/3');
    expect(text()).toContain('Raiders on the scope');
  });

  it('runs the fight and draws frames without error', () => {
    key('keydown', 'KeyW');
    steps(2);
    overlay.render(1000);
    overlay.render(1016);
    key('keyup', 'KeyW');
    expect(overlay.snapshot?.time).toBeGreaterThan(1.9);
  });

  it('held Space fires the cannons', () => {
    key('keydown', 'Space');
    steps(0.2);
    key('keyup', 'Space');
    expect(played.some((e) => e.type === 'laserFired')).toBe(true);
  });

  it('R without a lock is refused, and the AI says how to lock', () => {
    // Move every raider far out of lock range, so nothing can be locked.
    for (const r of overlay.snapshot?.raiders ?? []) (r as { pos: unknown }).pos = { x: 1e4, y: 0 };
    press('KeyR');
    steps(DT);
    expect(played).toContainEqual({ type: 'missileDenied', reason: 'noLock' });
    expect(text()).toContain('Hold one on the nose');
  });

  it('Esc pauses the fight (time stands still) and Esc resumes it', () => {
    press('Escape');
    expect(overlay.isPaused).toBe(true);
    expect(text()).toContain('Paused');
    const t = overlay.snapshot?.time ?? 0;
    steps(1);
    expect(overlay.snapshot?.time).toBe(t);
    press('Escape');
    expect(overlay.isPaused).toBe(false);
    steps(0.5);
    expect(overlay.snapshot?.time).toBeGreaterThan(t);
  });

  it('Q while paused retreats to the deck, reporting the outcome and score', () => {
    press('Escape');
    press('KeyQ');
    expect(overlay.isOpen).toBe(false);
    expect(onEnd).toHaveBeenCalledWith('retreated', expect.any(Number));
  });

  it('leaving the window pauses the fight', () => {
    window.dispatchEvent(new Event('blur'));
    expect(overlay.isPaused).toBe(true);
  });

  it('a lost fight shows the results; Enter starts a fresh fight, Esc goes back to the deck', () => {
    const player = overlay.snapshot?.player as { shield: number; hull: number };
    player.shield = 0;
    player.hull = 0.1;
    // Fly into the raiders until something hits.
    for (let i = 0; i < 60 * 40 && overlay.snapshot?.phase !== 'lost'; i++) overlay.update(DT);
    expect(overlay.snapshot?.phase).toBe('lost');
    steps(0.3);
    expect(text()).toContain('Ship lost');
    press('Enter');
    expect(overlay.snapshot?.phase).toBe('fighting');
    expect(overlay.snapshot?.player.hull).toBe(gameConfig.combat.defence.hullMax);

    const again = overlay.snapshot?.player as { shield: number; hull: number };
    again.shield = 0;
    again.hull = 0.1;
    for (let i = 0; i < 60 * 40 && overlay.snapshot?.phase !== 'lost'; i++) overlay.update(DT);
    steps(0.3);
    press('Escape');
    expect(onEnd).toHaveBeenCalledWith('lost', expect.any(Number));
    expect(overlay.isOpen).toBe(false);
  });

  it('stops listening once closed', () => {
    overlay.close();
    press('Escape');
    expect(onEnd).not.toHaveBeenCalled();
    expect(document.getElementById('combat')).toBeNull();
  });

  it('a browser without a 2D canvas gets a clear error, not a silent blank screen', () => {
    overlay.close();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    expect(() => overlay.open('ace', { onEnd })).toThrow(/2D canvas/);
    expect(overlay.isOpen).toBe(false);
  });
});
