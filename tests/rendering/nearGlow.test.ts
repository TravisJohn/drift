import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gameConfig } from '../../src/config/gameConfig';
import { isGlowLimitedNearCamera, limitGlowNearCamera } from '../../src/rendering/nearGlow';

type Compile = (shader: {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}) => void;

describe('limitGlowNearCamera (a fixture beside the camera must not wash out the frame)', () => {
  it('caps emitted light by distance to the camera, after the emissive map is applied', () => {
    const material = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 2 });
    limitGlowNearCamera(material);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: 'void main() {}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}',
    };
    (material.onBeforeCompile.bind(material) as unknown as Compile)(shader);
    const body = shader.fragmentShader;
    expect(body.indexOf('totalEmissiveRadiance *=')).toBeGreaterThan(
      body.indexOf('#include <emissivemap_fragment>'),
    );
    expect(body).toContain('length(vViewPosition)');
    expect(shader.uniforms).toHaveProperty('uNearGlowCap');
    expect(isGlowLimitedNearCamera(material)).toBe(true);
    material.dispose();
  });

  it('holds the near cap under the glow threshold, so close fixtures stop blooming', () => {
    const { nearGlow, bloomThreshold } = gameConfig.rendering;
    expect(nearGlow.cap).toBeLessThan(bloomThreshold);
    expect(nearGlow.fullWithin).toBeLessThan(nearGlow.clearBeyond);
  });

  it('fails loudly if a Three.js upgrade renames the include it hooks into', () => {
    const material = new THREE.MeshStandardMaterial();
    limitGlowNearCamera(material);
    const compile = material.onBeforeCompile.bind(material) as unknown as Compile;
    expect(() =>
      compile({ uniforms: {}, vertexShader: '', fragmentShader: 'void main() {}' }),
    ).toThrow(/shader anchor/);
    material.dispose();
  });

  it('refuses a material that already has a shader hook, rather than silently replacing it', () => {
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = () => {};
    expect(() => limitGlowNearCamera(material)).toThrow(/already has a shader hook/);
    material.dispose();
  });

  it('leaves ordinary materials alone', () => {
    expect(isGlowLimitedNearCamera(new THREE.MeshStandardMaterial())).toBe(false);
  });
});
