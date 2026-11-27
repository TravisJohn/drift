/**
 * nearGlow - keeps a light fixture from flooding the frame when the camera
 * is right beside it.
 *
 * The glow pass picks up every pixel brighter than its threshold at full
 * brightness. A fixture seen from across a room covers a few pixels and
 * glows softly; the same fixture half a metre from the camera covers a
 * large part of the frame, and its glow washed the whole picture white
 * (seen with the follow camera under the bridge door head).
 *
 * Close to the camera, a patched material's emitted light is held just
 * under the glow threshold: the fixture still reads as lit, it just stops
 * glowing. Further away it is untouched. Cost: a few instructions per
 * pixel, on these fixtures only.
 */
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

const CACHE_KEY = 'drift-near-glow';

/** Shared by every patched material, so tuning one value tunes them all. */
const uniforms = {
  uNearGlowCap: { value: gameConfig.rendering.nearGlow.cap },
  uNearGlowFull: { value: gameConfig.rendering.nearGlow.fullWithin },
  uNearGlowClear: { value: gameConfig.rendering.nearGlow.clearBeyond },
};

/**
 * Patch a fixture material so its emitted light is capped near the camera.
 * Throws if the material already has its own shader hook (the two would
 * overwrite each other) or if Three.js no longer has the include it uses.
 */
export function limitGlowNearCamera(material: THREE.MeshStandardMaterial): void {
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    throw new Error('limitGlowNearCamera: material already has a shader hook');
  }
  material.onBeforeCompile = (shader) => {
    const anchor = '#include <emissivemap_fragment>';
    if (!shader.fragmentShader.includes(anchor)) {
      throw new Error(`limitGlowNearCamera: shader anchor "${anchor}" not found in this Three.js`);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uNearGlowCap;\nuniform float uNearGlowFull;\nuniform float uNearGlowClear;',
      )
      .replace(
        anchor,
        `${anchor}
        {
          // 1 right beside the camera, 0 from uNearGlowClear metres out.
          float nearness = 1.0 - smoothstep(uNearGlowFull, uNearGlowClear, length(vViewPosition));
          float glowLuma = dot(totalEmissiveRadiance, vec3(0.2126, 0.7152, 0.0722));
          float capScale = min(1.0, uNearGlowCap / max(glowLuma, 1e-4));
          totalEmissiveRadiance *= mix(1.0, capScale, nearness);
        }`,
      );
  };
  // Keeps Three from reusing an unpatched program for this material.
  material.customProgramCacheKey = () => CACHE_KEY;
  material.needsUpdate = true;
}

/** True if `limitGlowNearCamera` has patched this material. */
export function isGlowLimitedNearCamera(material: THREE.Material): boolean {
  return material.customProgramCacheKey() === CACHE_KEY;
}
