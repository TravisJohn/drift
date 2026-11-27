import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { createBloomPass } from '../../src/rendering/renderPipeline';

describe('createBloomPass (glow fades in, so a barely-bright surface cannot flood the frame)', () => {
  it('uses the configured threshold and a soft band above it, not a hard cut-off', () => {
    const pass = createBloomPass();
    const uniforms = pass.highPassUniforms as Record<string, { value: number }>;
    expect(uniforms['luminosityThreshold']?.value).toBe(gameConfig.rendering.bloomThreshold);
    expect(uniforms['smoothWidth']?.value).toBe(gameConfig.rendering.bloomSoftness);
    expect(gameConfig.rendering.bloomSoftness).toBeGreaterThanOrEqual(0.2);
    pass.dispose();
  });
});
