import { describe, expect, it } from 'vitest';
import { PlayerMode } from '../../src/state/playerMode';

describe('PlayerMode', () => {
  it('starts roaming', () => {
    expect(new PlayerMode().mode).toBe('roaming');
    expect(new PlayerMode().isRoaming).toBe(true);
  });

  it('enters and exits the helm', () => {
    const mode = new PlayerMode();
    expect(mode.enterHelm()).toEqual({ from: 'roaming', to: 'atHelm' });
    expect(mode.isRoaming).toBe(false);
    expect(mode.exitToRoaming()).toEqual({ from: 'atHelm', to: 'roaming' });
  });

  it('enters terminal and cinematic from roaming', () => {
    const a = new PlayerMode();
    expect(a.enterTerminal().to).toBe('atTerminal');
    const b = new PlayerMode();
    expect(b.enterCinematic().to).toBe('cinematic');
  });

  it('cannot enter a mode from another non-roaming mode (fail loud)', () => {
    const mode = new PlayerMode();
    mode.enterHelm();
    expect(() => mode.enterTerminal()).toThrow(/cannot enter atTerminal from atHelm/);
    expect(() => mode.enterHelm()).toThrow(/cannot enter/);
  });

  it('enters the Vesper away mission only from roaming, and returns to roaming after', () => {
    const mode = new PlayerMode();
    expect(mode.enterSalvage()).toEqual({ from: 'roaming', to: 'onSalvage' });
    expect(() => mode.enterCombat()).toThrow(/cannot enter inCombat from onSalvage/);
    expect(mode.exitToRoaming()).toEqual({ from: 'onSalvage', to: 'roaming' });
  });

  it('exitToRoaming while already roaming is a programming error', () => {
    expect(() => new PlayerMode().exitToRoaming()).toThrow(/already roaming/);
  });
});
