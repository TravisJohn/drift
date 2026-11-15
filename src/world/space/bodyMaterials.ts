/**
 * bodyMaterials - procedural shaders for the things out the window: a
 * banded giant, a boiling sun, planetary rings and the glow of an
 * atmosphere or corona. No textures; everything is computed per pixel.
 *
 * All of them share one light direction and one clock (SpaceUniforms), so
 * the whole sky is lit from the same side and animates together.
 */
import * as THREE from 'three';
import { GLSL_NOISE } from '../../rendering/glslNoise';

/** Uniform objects shared by reference across every body material. */
export interface SpaceUniforms {
  /** Unit vector pointing from the scene toward the key light. */
  readonly uLightDir: { value: THREE.Vector3 };
  /** Seconds since start. */
  readonly uTime: { value: number };
}

export function createSpaceUniforms(lightDirection: THREE.Vector3): SpaceUniforms {
  return {
    uLightDir: { value: lightDirection.clone().normalize() },
    uTime: { value: 0 },
  };
}

/** World-space normal, object-space normal and view direction for a sphere. */
const SPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNormalO = normalize(position);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GIANT_FRAGMENT = /* glsl */ `
  uniform vec3 uLightDir;
  uniform float uTime;
  uniform vec3 uBandLight;
  uniform vec3 uBandDark;
  uniform vec3 uStorm;
  uniform vec3 uAtmosphere;
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vViewDir;

  ${GLSL_NOISE}

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 o = normalize(vNormalO);
    // Slow rotation: slide the surface pattern around the polar axis.
    float spin = uTime * 0.004;
    vec3 p = vec3(o.x * cos(spin) - o.z * sin(spin), o.y, o.x * sin(spin) + o.z * cos(spin));

    // Latitude bands, bent by turbulence so they are not ruler-straight.
    float turbulence = fbm(vec3(p.x * 2.4, p.y * 7.0, p.z * 2.4));
    float bands = sin((p.y * 7.5 + turbulence * 1.5) * 3.14159);
    vec3 surface = mix(uBandDark, uBandLight, bands * 0.5 + 0.5);
    float fine = fbm(vec3(p.x * 6.0, p.y * 30.0, p.z * 6.0));
    surface *= 0.86 + 0.28 * fine;
    surface = mix(surface, uStorm, smoothstep(0.62, 0.9, fbm(p * 4.5 + 20.0)) * 0.4);

    // Soft day/night terminator rather than a hard line.
    float daylight = smoothstep(-0.2, 0.65, dot(n, uLightDir));
    float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 3.2);

    vec3 color = surface * (0.012 + daylight);
    color += uAtmosphere * rim * (0.08 + 0.92 * daylight) * 0.9;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const SUN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uHot;
  uniform float uPower;
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vViewDir;

  ${GLSL_NOISE}

  void main() {
    vec3 o = normalize(vNormalO);
    // Two drifting noise layers read as slow convection cells.
    float swell = fbm(o * 3.0 + vec3(0.0, uTime * 0.02, 0.0));
    float cells = fbm(o * 9.0 - vec3(uTime * 0.035, 0.0, uTime * 0.02));
    float heat = smoothstep(0.28, 0.78, swell * 0.6 + cells * 0.5);
    vec3 color = mix(uDeep, uHot, heat);
    // Limb darkening: a star is dimmer toward its edge.
    float limb = pow(max(dot(normalize(vNormalW), vViewDir), 0.0), 0.5);
    gl_FragColor = vec4(color * (0.3 + 0.7 * limb) * uPower, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uColor;
  uniform float uInnerEdge;
  uniform float uFalloff;
  uniform float uNightSide;
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vViewDir;

  void main() {
    // Drawn on the inside of a larger shell: 0 at its outer silhouette,
    // 1 where the shell meets the body's own edge.
    float depth = clamp(-dot(normalize(vNormalW), vViewDir) / uInnerEdge, 0.0, 1.0);
    float glow = pow(depth, uFalloff);
    // Atmospheres glow on the lit side; a corona glows all the way round.
    float lit = mix(smoothstep(-0.35, 0.45, dot(normalize(vNormalO), uLightDir)), 1.0, uNightSide);
    gl_FragColor = vec4(uColor * glow * lit, 1.0);
  }
`;

const RING_VERTEX = /* glsl */ `
  uniform vec3 uBodyCenter;
  varying vec3 vFromCenter;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vFromCenter = world.xyz - uBodyCenter;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uColor;
  uniform float uBodyRadius;
  uniform float uInner;
  uniform float uOuter;
  varying vec3 vFromCenter;

  ${GLSL_NOISE}

  void main() {
    // Radius in units of the planet's radius, then 0..1 across the ring.
    float r = length(vFromCenter) / uBodyRadius;
    float t = (r - uInner) / (uOuter - uInner);

    // Many thin ringlets, plus one clear division.
    float ringlets = 0.5 + 0.5 * noise(vec3(r * 46.0, 0.0, 0.0));
    ringlets *= 0.55 + 0.45 * noise(vec3(r * 11.0, 4.0, 0.0));
    float division = smoothstep(0.035, 0.0, abs(t - 0.6));
    float alpha = ringlets * (1.0 - 0.9 * division);
    alpha *= smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.88, t);

    // The planet casts a shadow across the far side of the rings.
    float along = dot(vFromCenter, uLightDir);
    float offAxis = length(vFromCenter - along * uLightDir);
    float lit = along < 0.0 ? smoothstep(uBodyRadius * 0.96, uBodyRadius * 1.04, offAxis) : 1.0;

    gl_FragColor = vec4(uColor * (0.75 + 0.5 * ringlets) * mix(0.04, 1.0, lit), alpha * 0.85);
  }
`;

/** A banded gas or ice giant, tinted from one accent colour. */
export function createGiantMaterial(
  shared: SpaceUniforms,
  accent: THREE.Color,
): THREE.ShaderMaterial {
  const white = new THREE.Color(1, 1, 1);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uBandLight: { value: accent.clone().lerp(white, 0.35) },
      uBandDark: { value: accent.clone().multiplyScalar(0.42).offsetHSL(0.04, 0.05, 0) },
      uStorm: { value: accent.clone().lerp(white, 0.75) },
      uAtmosphere: { value: accent.clone().lerp(white, 0.3) },
    },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: GIANT_FRAGMENT,
  });
}

/** A star's surface: self-lit and brighter than white, so it blooms. */
export function createSunMaterial(
  shared: SpaceUniforms,
  accent: THREE.Color,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uDeep: { value: accent.clone().multiplyScalar(0.22).offsetHSL(-0.035, 0.2, 0) },
      uHot: { value: accent.clone().lerp(new THREE.Color(1.0, 0.62, 0.3), 0.45) },
      uPower: { value: 1.25 },
    },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: SUN_FRAGMENT,
  });
}

export interface HaloOptions {
  /** Shell radius divided by body radius (> 1). */
  readonly shellRatio: number;
  /** Higher = glow hugs the body's edge more tightly. */
  readonly falloff: number;
  readonly strength: number;
  /** True for a corona that glows on all sides, not just the lit one. */
  readonly allAround: boolean;
}

/**
 * The glow around a body, for the inside faces of a shell `shellRatio`
 * times its size. Additive, so it only ever adds light.
 */
export function createHaloMaterial(
  shared: SpaceUniforms,
  color: THREE.Color,
  options: HaloOptions,
): THREE.ShaderMaterial {
  if (options.shellRatio <= 1) {
    throw new Error('createHaloMaterial: shellRatio must be greater than 1');
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color.clone().multiplyScalar(options.strength) },
      // |normal . view| on the shell exactly where it meets the body's edge.
      uInnerEdge: { value: Math.sqrt(1 - 1 / (options.shellRatio * options.shellRatio)) },
      uFalloff: { value: options.falloff },
      uNightSide: { value: options.allAround ? 1 : 0 },
    },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Uniforms a ring needs updated as its planet moves and scales. */
export interface RingMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uBodyCenter: { value: THREE.Vector3 };
    uBodyRadius: { value: number };
  } & Record<string, THREE.IUniform>;
}

/** Banded, semi-transparent rings between `inner` and `outer` body radii. */
export function createRingMaterial(
  shared: SpaceUniforms,
  color: THREE.Color,
  inner: number,
  outer: number,
): RingMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color.clone() },
      uBodyCenter: { value: new THREE.Vector3() },
      uBodyRadius: { value: 1 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  }) as RingMaterial;
}
