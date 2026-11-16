import { describe, expect, it } from 'vitest';
import { fitRenderScale, isIntegratedGpu, shortGpuName } from '../../src/rendering/renderScale';

const MIN = 0.5;
const MAX = 2;
const BUDGET = 11;

/** A machine whose frame costs `fixed` ms plus `perPixel` ms per unit of scale squared. */
const machine =
  (fixed: number, perPixel: number) =>
  (scale: number): { scale: number; frameMs: number } => ({
    scale,
    frameMs: fixed + perPixel * scale ** 2,
  });

describe('fitRenderScale (the right resolution before play starts)', () => {
  it('keeps full sharpness on a machine that is already fast enough', () => {
    const m = machine(2, 1);
    expect(fitRenderScale(m(MIN), m(MAX), BUDGET, MIN, MAX)).toBe(MAX);
  });

  it('picks the setting whose frame lands exactly on the budget', () => {
    const m = machine(3, 8); // 35 ms at 2x, 5 ms at 0.5x
    const chosen = fitRenderScale(m(MIN), m(MAX), BUDGET, MIN, MAX);
    expect(chosen).toBeCloseTo(1, 5);
    expect(m(chosen).frameMs).toBeCloseTo(BUDGET, 5);
  });

  it('accounts for the fixed cost, which a pixels-only guess would miss', () => {
    const m = machine(8, 6); // 32 ms at 2x
    const chosen = fitRenderScale(m(MIN), m(MAX), BUDGET, MIN, MAX);
    // "Cost is proportional to pixels" would say 2 * sqrt(11 / 32) = 1.17,
    // which on this machine takes 16.2 ms - over budget.
    const naive = MAX * Math.sqrt(BUDGET / m(MAX).frameMs);
    expect(chosen).toBeLessThan(naive);
    expect(m(chosen).frameMs).toBeLessThanOrEqual(BUDGET + 1e-9);
  });

  it('falls back to the softest setting when even that cannot make the budget', () => {
    const m = machine(14, 10);
    expect(fitRenderScale(m(MIN), m(MAX), BUDGET, MIN, MAX)).toBe(MIN);
  });

  it('never returns less than the minimum', () => {
    const m = machine(10.9, 40); // budget is met only far below the minimum
    expect(fitRenderScale(m(MIN), m(MAX), BUDGET, MIN, MAX)).toBe(MIN);
  });

  it('treats noisy timings (softer measured slower) as a slow machine, not a crash', () => {
    const low = { scale: MIN, frameMs: 30 };
    const high = { scale: MAX, frameMs: 25 };
    expect(fitRenderScale(low, high, BUDGET, MIN, MAX)).toBe(MIN);
  });

  it('rejects impossible input (fail loud)', () => {
    const m = machine(3, 8);
    expect(() => fitRenderScale(m(MAX), m(MIN), BUDGET, MIN, MAX)).toThrow();
    expect(() => fitRenderScale(m(1), m(1), BUDGET, MIN, MAX)).toThrow();
    expect(() => fitRenderScale(m(MIN), m(MAX), 0, MIN, MAX)).toThrow();
    expect(() => fitRenderScale(m(MIN), m(MAX), BUDGET, MAX, MIN)).toThrow();
  });
});

describe('shortGpuName (a name a person can read)', () => {
  it('unwraps the browser description of a dedicated chip', () => {
    expect(
      shortGpuName(
        'ANGLE (NVIDIA, NVIDIA Quadro P2000 (0x00001CBA) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('NVIDIA Quadro P2000');
  });

  it('drops trademark marks from an integrated chip', () => {
    expect(
      shortGpuName(
        'ANGLE (Intel, Intel(R) UHD Graphics P630 (0x00003E94) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('Intel UHD Graphics P630');
  });

  it('copes with a description that has no device id', () => {
    expect(shortGpuName('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
      'AMD Radeon RX 6600',
    );
  });

  it('passes a plain name through', () => {
    expect(shortGpuName('Apple M2')).toBe('Apple M2');
  });

  it('says so when the browser gives nothing', () => {
    expect(shortGpuName('')).toBe('Unknown graphics');
    expect(shortGpuName('   ')).toBe('Unknown graphics');
  });
});

describe('isIntegratedGpu (when to suggest the faster chip)', () => {
  it('recognises processor-built-in graphics', () => {
    expect(isIntegratedGpu('Intel UHD Graphics P630')).toBe(true);
    expect(isIntegratedGpu('Intel Iris Xe Graphics')).toBe(true);
  });

  it('does not flag dedicated chips, including Intel Arc', () => {
    expect(isIntegratedGpu('NVIDIA Quadro P2000')).toBe(false);
    expect(isIntegratedGpu('AMD Radeon RX 6600')).toBe(false);
    expect(isIntegratedGpu('Intel Arc A770 Graphics')).toBe(false);
    expect(isIntegratedGpu('Unknown graphics')).toBe(false);
  });
});
