import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import type { VesperSoundState } from '../../src/salvage/vesperSounds';
import {
  type SalvageAudio,
  type SalvageCallbacks,
  VesperOverlay,
} from '../../src/ui/vesperOverlay';

const DT = 1 / 60;

/**
 * jsdom has no 2D canvas. A context where every method is a no-op (with
 * gradients that accept colour stops and real image data for the lamp)
 * lets the real renderer run, so these tests cover overlay, rules and
 * drawing calls together.
 */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key) => {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'createImageData') {
        return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      }
      return () => {};
    },
    set: () => true,
  });
}

class FakeAudio implements SalvageAudio {
  muted = false;
  resume = vi.fn();
  cellSecured = vi.fn();
  breach = vi.fn();
  freezeShot = vi.fn();
  states: VesperSoundState[] = [];
  update(state: VesperSoundState): void {
    this.states.push(state);
  }
}

describe('VesperOverlay', () => {
  let overlay: VesperOverlay;
  let audio: FakeAudio;
  let onEnd: Mock<SalvageCallbacks['onEnd']>;
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
  const text = (): string => document.getElementById('vesper')?.textContent ?? '';
  const run = () => {
    const state = overlay.state;
    if (!state) throw new Error('overlay is closed');
    return state;
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext());
    audio = new FakeAudio();
    onEnd = vi.fn<SalvageCallbacks['onEnd']>();
    overlay = new VesperOverlay({ audio });
    overlay.open({ onEnd });
  });

  afterEach(() => {
    overlay.close();
    vi.restoreAllMocks();
  });

  it('opens on standby at the airlock with the salvage order and a deploy button', () => {
    expect(overlay.isOpen).toBe(true);
    expect(run().mode).toBe('ready');
    expect(text()).toContain('Bring at least two cells home.');
    expect(text()).toContain('Docking airlock');
    expect(text()).toContain('Deploy drone');
    expect(text()).toContain('Hydroponics');
  });

  it('Enter deploys run 01 and starts the sound from that key press', () => {
    press('Enter');
    expect(run().mode).toBe('play');
    expect(audio.resume).toHaveBeenCalled();
    overlay.update(DT);
    expect(text()).toContain('Run 01');
    expect(text()).toContain('Live');
  });

  it('flies the drone east while D is held and stops when released', () => {
    press('Enter');
    const start = run().player.x;
    key('keydown', 'KeyD');
    steps(0.5);
    const moved = run().player.x - start;
    expect(moved).toBeCloseTo(gameConfig.salvage.flightSpeed * 0.5, 0);
    key('keyup', 'KeyD');
    const stopped = run().player.x;
    steps(0.2);
    expect(run().player.x).toBe(stopped);
  });

  it('Esc pauses the run in place; from the pause Q returns the drone to DRIFT', () => {
    press('Enter');
    press('Escape');
    expect(overlay.isPaused).toBe(true);
    expect(text()).toContain('Feed paused');
    const clock = run().clock;
    steps(1);
    expect(run().clock).toBe(clock);
    press('KeyQ');
    expect(overlay.isOpen).toBe(false);
    expect(onEnd).toHaveBeenCalledWith('abandoned', 1, 0);
  });

  it('Esc from standby goes straight back to the ship without a run', () => {
    press('Escape');
    expect(onEnd).toHaveBeenCalledWith('abandoned', 0, 0);
    expect(document.getElementById('vesper')).toBeNull();
  });

  it('a ten-second tap at a socket secures the cell and plays the chime', () => {
    press('Enter');
    const r = run();
    vi.spyOn(r, 'detect').mockReturnValue(-1); // no guards in this test
    const cell = r.deck.cells[0]!;
    Object.assign(r.player, { x: cell.x, y: cell.y });
    press('KeyE');
    expect(r.tap?.id).toBe(cell.id);
    steps(gameConfig.salvage.extractionSeconds + 0.1);
    expect(r.taken.has(cell.id)).toBe(true);
    expect(audio.cellSecured).toHaveBeenCalledTimes(1);
    expect(text()).toContain(`${cell.name} cell secured`);
  });

  it('unloading two cells at the airlock wins; Enter reports the recovery', () => {
    press('Enter');
    run().taken.add('hydro').add('bank');
    steps(0.1); // the rail refreshes every 50 ms
    expect(text()).toContain('Unload cells');
    press('KeyE');
    expect(run().mode).toBe('won');
    expect(text()).toContain('Cells recovered');
    press('Enter');
    expect(onEnd).toHaveBeenCalledWith('recovered', 1, 2);
    expect(overlay.isOpen).toBe(false);
  });

  it('sounds the third-cell alarm, fires the freeze laser and returns to DRIFT via the portal', () => {
    press('Enter');
    const r = run();
    vi.spyOn(r, 'detect').mockReturnValue(-1);
    r.taken.add('hydro').add('bank');
    const last = r.deck.cells.find((cell) => !r.taken.has(cell.id))!;
    Object.assign(r.player, { x: last.x, y: last.y });
    steps(0.1);
    const action = document.querySelector<HTMLButtonElement>('#vesper .action');
    expect(action?.hidden).toBe(false);
    expect(action?.textContent).toContain('Extract cell');
    action?.click();
    steps(gameConfig.salvage.extractionSeconds);
    expect(r.taken.has(last.id)).toBe(true);
    expect(text()).toContain('3 / 3');
    expect(text()).toContain('CONTAINMENT BREACH');
    expect(text()).toContain('Reach the portal.');
    expect(audio.breach).toHaveBeenCalledOnce();
    press('Space');
    expect(audio.freezeShot).toHaveBeenCalledOnce();
    for (const alien of r.escape!.aliens) alien.frozenUntil = Infinity;
    steps(gameConfig.salvage.mapScan.firstDelay[1] + 0.1);
    expect(document.querySelector('#vesper .minimap.scan')).not.toBeNull();
    expect(text()).toContain('Deck scan');
    press('Escape');
    expect(document.querySelector('#vesper .minimap.scan')).toBeNull();
    press('Escape');
    expect(document.querySelector('#vesper .minimap.scan')).not.toBeNull();
    steps(gameConfig.salvage.mapScan.visibleSeconds);
    expect(document.querySelector('#vesper .minimap.scan')).toBeNull();
    expect(text()).toContain('Seed map');
    Object.assign(r.player, r.escape!.portal);
    steps(DT);
    expect(text()).toContain('3 energy cells are aboard DRIFT.');
    steps(gameConfig.salvage.resultsDelay + DT);
    expect(onEnd).toHaveBeenCalledWith('recovered', 1, 3);
  });

  it('Q plants a light seed and the seed map counts it', () => {
    press('Enter');
    press('KeyQ');
    overlay.update(DT);
    expect(run().seeds).toHaveLength(1);
    expect(text()).toContain(`1 / ${gameConfig.salvage.seedLimit}`);
  });

  it('M mutes and unmutes the score and effects', () => {
    press('KeyM');
    expect(audio.muted).toBe(true);
    press('KeyM');
    expect(audio.muted).toBe(false);
  });

  it('feeds the sound the drone speed and a silent state while paused', () => {
    press('Enter');
    key('keydown', 'KeyD');
    steps(0.2);
    expect(audio.states.at(-1)?.active).toBe(true);
    expect(audio.states.at(-1)?.speed).toBeGreaterThan(0.9);
    press('Escape');
    expect(audio.states.at(-1)?.active).toBe(false);
  });

  it('stops listening for keys once closed', () => {
    overlay.close();
    press('Enter');
    expect(onEnd).not.toHaveBeenCalled();
    expect(overlay.state).toBeNull();
  });

  it('draws frames without errors before and after deploying', () => {
    expect(() => overlay.render()).not.toThrow();
    press('Enter');
    steps(0.1);
    expect(() => overlay.render()).not.toThrow();
  });
});
