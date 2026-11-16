import { beforeEach, describe, expect, it } from 'vitest';
import { Hud } from '../../src/ui/hud';

describe('Hud performance readout (F2)', () => {
  let hud: Hud;
  const perf = (): HTMLElement => document.querySelector('#hud .perf') as HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    hud = new Hud();
  });

  it('is hidden until asked for, so the screen stays quiet', () => {
    expect(perf()).not.toBeNull();
    expect(perf().classList.contains('visible')).toBe(false);
  });

  it('shows the text it is given', () => {
    hud.setPerf('60 fps\n1920x1080 (1.00x)\nNVIDIA Quadro P2000');
    expect(perf().classList.contains('visible')).toBe(true);
    expect(perf().textContent).toContain('60 fps');
    expect(perf().textContent).toContain('NVIDIA Quadro P2000');
  });

  it('hides again on null', () => {
    hud.setPerf('60 fps');
    hud.setPerf(null);
    expect(perf().classList.contains('visible')).toBe(false);
  });
});
