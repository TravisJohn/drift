/**
 * starLook - what a star looks like: its size, colour and twinkle, and the
 * shader that draws it as a soft round point of light.
 *
 * The generators are pure (seeded random in, typed arrays out) so the look
 * of the sky is testable; the material is the thin Three.js part. Both the
 * drifting near field and the distant sky dome use this one look.
 */
import * as THREE from 'three';

/** Per-star render attributes, index-aligned with the positions array. */
export interface StarAttributes {
  /** World-space diameter of each star's glow. */
  readonly sizes: Float32Array;
  /** Linear RGB triplets; bright stars exceed 1 so bloom picks them up. */
  readonly colors: Float32Array;
  /** 0..1 per star: desynchronises the twinkle. */
  readonly phases: Float32Array;
}

/**
 * Star tints from hot to cool, with how common each is. Most stars read as
 * white; a few lean blue or warm, which is what makes a sky look real.
 */
const STAR_TINTS: readonly { readonly rgb: readonly [number, number, number]; weight: number }[] = [
  { rgb: [0.72, 0.82, 1.0], weight: 0.18 }, // blue-white
  { rgb: [0.9, 0.94, 1.0], weight: 0.3 }, // cool white
  { rgb: [1.0, 0.98, 0.94], weight: 0.26 }, // white
  { rgb: [1.0, 0.9, 0.74], weight: 0.16 }, // pale yellow
  { rgb: [1.0, 0.74, 0.54], weight: 0.08 }, // orange
  { rgb: [1.0, 0.58, 0.46], weight: 0.02 }, // red
];

function pickTint(roll: number): readonly [number, number, number] {
  let cumulative = 0;
  for (const tint of STAR_TINTS) {
    cumulative += tint.weight;
    if (roll < cumulative) return tint.rgb;
  }
  return [1, 1, 1];
}

/**
 * Generate the look of `count` stars. Sizes follow a steep power law - a
 * sky is mostly faint stars with a handful of bright ones - between
 * `minSize` and `maxSize` (world units).
 */
export function createStarAttributes(
  count: number,
  minSize: number,
  maxSize: number,
  random: () => number,
): StarAttributes {
  if (count <= 0 || minSize <= 0 || maxSize < minSize) {
    throw new Error('createStarAttributes: need count > 0 and 0 < minSize <= maxSize');
  }
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // random^6 keeps most values near 0: few big stars, many small.
    const magnitude = Math.pow(random(), 6);
    sizes[i] = minSize + (maxSize - minSize) * magnitude;
    const [r, g, b] = pickTint(random());
    // The biggest stars are also the brightest (up to ~2.2x, into bloom).
    const brightness = 0.35 + 1.9 * magnitude + 0.3 * random();
    colors[i * 3] = r * brightness;
    colors[i * 3 + 1] = g * brightness;
    colors[i * 3 + 2] = b * brightness;
    phases[i] = random();
  }
  return { sizes, colors, phases };
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uProjectionScale;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // True perspective size in pixels for a glow of world diameter aSize.
    float pixels = aSize * uProjectionScale / max(-mvPosition.z, 1.0);
    // A star too small to draw fades out instead of shrinking below a few
    // pixels, where it would shimmer as the camera turns.
    const float MIN_PIXELS = 3.0;
    float fade = clamp(pixels / MIN_PIXELS, 0.0, 1.0);
    gl_PointSize = max(pixels, MIN_PIXELS);

    float twinkle = 0.84 + 0.16 * sin(uTime * (0.5 + aPhase * 1.6) + aPhase * 60.0);
    vAlpha = twinkle * fade * fade;
    vColor = aColor;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // 0 at the centre of the point, 1 at its edge.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.32, 0.0, d);
    float halo = pow(max(0.0, 1.0 - d), 2.6);
    float alpha = (core + halo * 0.55) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/** A Points material that draws each star as a soft, round, tinted glow. */
export function createStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // Pixels per world unit at distance 1; set from the viewport.
      uProjectionScale: { value: 500 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Build the geometry for a set of stars. */
export function createStarGeometry(
  positions: Float32Array,
  attributes: StarAttributes,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(attributes.sizes, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(attributes.colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(attributes.phases, 1));
  return geometry;
}

/**
 * Pixels per world unit at distance 1 for a perspective camera - what the
 * star shader needs to size points like real geometry.
 */
export function projectionScale(viewportHeightPx: number, fovDegrees: number): number {
  return viewportHeightPx / (2 * Math.tan((fovDegrees * Math.PI) / 360));
}
