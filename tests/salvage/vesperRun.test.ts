import { describe, expect, it, vi } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { type CellSocket, getVesperDeck } from '../../src/salvage/vesperDeck';
import { type RunEvent, VesperRun } from '../../src/salvage/vesperRun';

const deck = getVesperDeck();
const DT = 1 / 60;
const STILL = { dx: 0, dy: 0 };
const cfg = gameConfig.salvage;

/**
 * Scan a socket's patrol schedule: the first time a guard sees it, and the
 * first moment a full extraction (plus a margin) can run unseen.
 */
const plans = new Map<string, { safe: number; seen: number }>();
function inspectSocket(cell: CellSocket): { safe: number; seen: number } {
  const cached = plans.get(cell.id);
  if (cached) return cached;
  const quantum = 0.125;
  const window = Math.ceil((cfg.extractionSeconds + 1) / quantum);
  const scans = Array.from({ length: 800 }, (_, i) =>
    deck.guardsAt(i * quantum).some((g) => deck.touches(g.cone, cell.x, cell.y)),
  );
  const start = scans.findIndex(
    (v, i) => !v && i + window < scans.length && scans.slice(i, i + window).every((b) => !b),
  );
  expect(start, `${cell.id} has no sustained extraction window`).toBeGreaterThanOrEqual(0);
  expect(scans.some(Boolean), `${cell.id} is never inspected`).toBe(true);
  const plan = { safe: start * quantum, seen: scans.indexOf(true) * quantum };
  plans.set(cell.id, plan);
  return plan;
}

function deployed(): VesperRun {
  const run = new VesperRun(deck);
  run.deploy();
  return run;
}

/** Put the drone on a socket at a chosen moment of the patrol schedule. */
function atSocket(run: VesperRun, cell: CellSocket, t: number): void {
  run.player.x = cell.x;
  run.player.y = cell.y;
  run.clock = t;
  run.guards = deck.guardsAt(t);
}

function advance(run: VesperRun, steps: number, input = STILL): RunEvent[] {
  const events: RunEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...run.step(DT, input));
  return events;
}

describe('VesperRun', () => {
  it('waits in standby until deployed, then starts run 1 at the airlock', () => {
    const run = new VesperRun(deck);
    expect(run.mode).toBe('ready');
    expect(run.step(DT, { dx: 1, dy: 0 })).toEqual([]);
    expect(run.deploy()).toEqual([{ type: 'deployed', attempt: 1 }]);
    expect(run.mode).toBe('play');
    expect(run.atDock).toBe(true);
  });

  it('follows a slanted corridor in either direction while one key is held', () => {
    const run = deployed();
    vi.spyOn(run, 'detect').mockReturnValue(-1);
    const start = { x: 361.6, y: 432.5 };
    Object.assign(run.player, start);
    expect(deck.roomAt(start.x, start.y)).toBeUndefined();
    advance(run, 68, { dx: 1, dy: 0 });
    expect(run.player.x).toBeGreaterThan(start.x + 30);
    expect(run.player.y).toBeGreaterThan(start.y + 20);
    expect(deck.fits(run.player.x, run.player.y)).toBe(true);
    advance(run, 68, { dx: -1, dy: 0 });
    expect(Math.hypot(run.player.x - start.x, run.player.y - start.y)).toBeLessThan(1);
  });

  it('keeps five seeds active at most and frees a slot when one burns out after 15 s', () => {
    const idle = new VesperRun(deck);
    expect(idle.plantSeed()).toEqual([]); // not deployed
    const run = deployed();
    expect(run.plantSeed()).toEqual([{ type: 'seedPlanted' }]);
    advance(run, 60);
    for (let i = 0; i < 4; i++) expect(run.plantSeed()).toHaveLength(1);
    expect(run.plantSeed()).toEqual([]); // at the limit
    advance(run, 839);
    expect(run.seeds).toHaveLength(5);
    advance(run, 1); // the first seed reaches 15 s
    expect(run.seeds).toHaveLength(4);
    expect(run.plantSeed()).toHaveLength(1);
    advance(run, 60);
    expect(run.seeds).toHaveLength(1);
  });

  it('lets a passing guard put out a seed without capturing the drone', () => {
    const run = deployed();
    const dock = { ...run.player };
    run.plantSeed();
    const guard = deck.guardsAt(0.5)[0]!;
    Object.assign(run.player, { x: guard.x, y: guard.y });
    run.plantSeed();
    Object.assign(run.player, dock);
    advance(run, 1);
    expect(run.seeds).toHaveLength(2);
    advance(run, 30);
    expect(run.seeds).toHaveLength(1);
    expect(run.seeds[0]!.x).toBe(dock.x);
    expect(run.mode).toBe('play');
    expect(run.plantSeed()).toHaveLength(1);
  });

  it('gives every socket a guard visit and a gap long enough for a full extraction', () => {
    for (const cell of deck.cells) {
      const run = deployed();
      atSocket(run, cell, inspectSocket(cell).safe);
      expect(run.interact()).toEqual([{ type: 'extractionStarted', cellId: cell.id }]);
      advance(run, 599);
      expect(run.taken.size).toBe(0);
      expect(advance(run, 1)).toContainEqual({
        type: 'cellSecured',
        cellId: cell.id,
        name: cell.name,
      });
      expect(run.taken.has(cell.id)).toBe(true);
      expect(run.mode).toBe('play');
      run.interact(); // the socket is empty now
      expect(run.tap).toBeNull();
    }
  });

  it('cancels partial progress when the drone leaves the socket', () => {
    const cell = deck.cells[0]!;
    const run = deployed();
    atSocket(run, cell, inspectSocket(cell).safe);
    run.interact();
    advance(run, 120);
    expect(run.progress).toBeGreaterThan(1.9);
    run.player.x -= 12;
    expect(run.step(DT, STILL)).toEqual([{ type: 'extractionCancelled', cellId: cell.id }]);
    expect(run.progress).toBe(0);
    expect(run.tap).toBeNull();
  });

  it('lets capture outrank the last extraction tick, speeds patrols, then resets the run', () => {
    const cell = deck.cells[0]!;
    const run = deployed();
    run.taken.add('bank');
    run.plantSeed();
    atSocket(run, cell, inspectSocket(cell).seen);
    run.interact();
    run.progress = 9.999;
    const caught = run.step(DT, STILL);
    expect(caught[0]?.type).toBe('spotted');
    expect(run.mode).toBe('alarm');
    expect(run.tap).toBeNull();
    expect(run.taken.has(cell.id)).toBe(false);

    const before = run.clock;
    run.step(0.1, STILL);
    expect(run.clock - before).toBeCloseTo(0.1 * cfg.alarmSpeed, 8);
    expect(run.seeds).toHaveLength(1);

    expect(advance(run, 140)).toContainEqual({ type: 'reset', attempt: 2 });
    expect(run.mode).toBe('play');
    expect(run.attempt).toBe(2);
    expect(run.taken.size).toBe(0);
    expect(run.seeds).toHaveLength(0);
    expect(run.atDock).toBe(true);
  });

  it('wins only when two different cells are unloaded at the airlock', () => {
    const run = deployed();
    expect(run.interact()).toEqual([]); // nothing to unload yet
    for (const cell of deck.cells.slice(0, 2)) {
      atSocket(run, cell, inspectSocket(cell).safe);
      run.interact();
      advance(run, 600);
      if (run.taken.size === 1) {
        Object.assign(run.player, cfg.start);
        expect(run.interact()).toEqual([]); // one cell is not enough
        expect(run.mode).toBe('play');
      }
    }
    expect(run.taken.size).toBe(2);
    expect(run.interact()).toEqual([]); // still at the second socket
    Object.assign(run.player, cfg.start);
    expect(run.canUnload).toBe(true);
    expect(run.interact()).toEqual([{ type: 'won' }]);
    expect(run.mode).toBe('won');
    expect(run.step(DT, { dx: 1, dy: 0 })).toEqual([]); // the clock stops
  });

  it('can be redeployed after a win with a fresh run', () => {
    const run = deployed();
    run.taken.add('hydro').add('bank');
    run.interact();
    expect(run.mode).toBe('won');
    expect(run.deploy()).toEqual([{ type: 'deployed', attempt: 2 }]);
    expect(run.taken.size).toBe(0);
    expect(run.atDock).toBe(true);
  });
});
