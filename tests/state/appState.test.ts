import { describe, expect, it } from 'vitest';
import { AppState } from '../../src/state/appState';

describe('AppState', () => {
  it('boots on the title screen, not playing', () => {
    const app = new AppState();
    expect(app.state).toBe('title');
    expect(app.isPlaying).toBe(false);
  });

  it('start leaves the title for playing', () => {
    const app = new AppState();
    expect(app.start()).toEqual({ from: 'title', to: 'playing' });
    expect(app.isPlaying).toBe(true);
  });

  it('pause and resume toggle around playing', () => {
    const app = new AppState();
    app.start();
    expect(app.pause()).toEqual({ from: 'playing', to: 'paused' });
    expect(app.isPlaying).toBe(false);
    expect(app.resume()).toEqual({ from: 'paused', to: 'playing' });
    expect(app.isPlaying).toBe(true);
  });

  it('invalid transitions are programming errors (fail loud)', () => {
    const app = new AppState();
    expect(() => app.pause()).toThrow(/cannot go to paused from title/);
    expect(() => app.resume()).toThrow(/cannot go to playing from title/);
    app.start();
    expect(() => app.start()).toThrow(/cannot go to playing from playing/);
    app.pause();
    expect(() => app.pause()).toThrow(/cannot go to paused from paused/);
  });
});
