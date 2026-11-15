/**
 * SkyDome - the distant sky: thousands of stars too far away to ever move,
 * gathered into a galactic band, with faint nebula clouds behind them.
 *
 * The near Starfield slides past during travel; this layer stays put, which
 * is what sells the distance. Star placement is a pure function (testable);
 * the nebula is a shader on the inside of a large sphere.
 */
import * as THREE from 'three';
import { gameConfig } from '../../config/gameConfig';
import { GLSL_NOISE } from '../../rendering/glslNoise';
import { mulberry32 } from './starfield';
import { createStarAttributes, createStarGeometry, createStarMaterial } from './starLook';

/** The galactic plane's pole: tilted so the band crosses the windows. */
export const GALACTIC_POLE: readonly [number, number, number] = (() => {
  const v = new THREE.Vector3(0.35, 0.82, 0.45).normalize();
  return [v.x, v.y, v.z] as const;
})();

/** Standard normal sample (Box-Muller). */
function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/**
 * Place `count` stars on a sphere of `radius`. A `bandShare` fraction is
 * concentrated around the galactic plane (latitude spread `bandSpread`
 * radians); the rest is uniform over the whole sky. Returns xyz triplets.
 */
export function createSkyStarPositions(
  count: number,
  radius: number,
  bandShare: number,
  bandSpread: number,
  random: () => number,
): Float32Array {
  if (count <= 0 || radius <= 0 || bandShare < 0 || bandShare > 1 || bandSpread <= 0) {
    throw new Error('createSkyStarPositions: need count, radius, spread > 0 and share in 0..1');
  }
  const pole = new THREE.Vector3(...GALACTIC_POLE);
  // Two axes spanning the galactic plane.
  const planeA = new THREE.Vector3(1, 0, 0).cross(pole).normalize();
  const planeB = pole.clone().cross(planeA).normalize();
  const dir = new THREE.Vector3();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    if (random() < bandShare) {
      const longitude = random() * Math.PI * 2;
      const latitude = Math.max(-1.4, Math.min(1.4, gaussian(random) * bandSpread));
      dir
        .copy(planeA)
        .multiplyScalar(Math.cos(longitude) * Math.cos(latitude))
        .addScaledVector(planeB, Math.sin(longitude) * Math.cos(latitude))
        .addScaledVector(pole, Math.sin(latitude));
    } else {
      // Uniform on the sphere: uniform z, uniform angle.
      const z = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      dir.set(r * Math.cos(angle), r * Math.sin(angle), z);
    }
    positions[i * 3] = dir.x * radius;
    positions[i * 3 + 1] = dir.y * radius;
    positions[i * 3 + 2] = dir.z * radius;
  }
  return positions;
}

const NEBULA_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT = /* glsl */ `
  uniform vec3 uPole;
  uniform float uIntensity;
  varying vec3 vDirection;

  ${GLSL_NOISE}

  void main() {
    vec3 dir = normalize(vDirection);
    // 1 on the galactic plane, falling off toward the poles.
    float latitude = dot(dir, uPole);
    float band = exp(-pow(latitude / 0.3, 2.0));

    float shape = fbm(dir * 2.3 + 11.0);
    float detail = fbm(dir * 5.2 - 3.0);
    float clouds = smoothstep(0.42, 0.8, shape * 0.75 + detail * 0.35);

    vec3 teal = vec3(0.07, 0.2, 0.34);
    vec3 violet = vec3(0.19, 0.1, 0.3);
    vec3 amber = vec3(0.36, 0.19, 0.1);
    vec3 tint = mix(teal, violet, smoothstep(0.35, 0.7, detail));
    tint = mix(tint, amber, smoothstep(0.55, 0.85, fbm(dir * 3.1 + 40.0)) * 0.55);

    // Clouds live mostly in the band, with a little everywhere else.
    vec3 color = tint * clouds * (0.18 + 0.82 * band) * uIntensity;
    // The unresolved glow of the band itself, cut by dark dust lanes.
    float lanes = smoothstep(0.48, 0.74, fbm(dir * 6.5 + 7.0));
    color += vec3(0.5, 0.56, 0.72) * band * (0.035 + 0.06 * detail) * (1.0 - 0.75 * lanes);
    color *= 1.0 - 0.45 * lanes * band;

    // A whisper of noise hides banding in the dark gradients.
    color += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
    gl_FragColor = vec4(max(color, 0.0), 1.0);
  }
`;

export class SkyDome {
  readonly group = new THREE.Group();

  private readonly starGeometry: THREE.BufferGeometry;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly nebulaGeometry: THREE.SphereGeometry;
  private readonly nebulaMaterial: THREE.ShaderMaterial;

  constructor() {
    const cfg = gameConfig.space.sky;
    const random = mulberry32(cfg.seed);

    this.nebulaGeometry = new THREE.SphereGeometry(cfg.radius * 1.05, 48, 32);
    this.nebulaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPole: { value: new THREE.Vector3(...GALACTIC_POLE) },
        uIntensity: { value: cfg.nebulaIntensity },
      },
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const nebula = new THREE.Mesh(this.nebulaGeometry, this.nebulaMaterial);
    nebula.renderOrder = -2; // behind everything else in space

    const positions = createSkyStarPositions(
      cfg.starCount,
      cfg.radius,
      cfg.bandShare,
      cfg.bandSpread,
      random,
    );
    this.starGeometry = createStarGeometry(
      positions,
      createStarAttributes(cfg.starCount, cfg.starMinSize, cfg.starMaxSize, random),
    );
    this.starMaterial = createStarMaterial();
    const stars = new THREE.Points(this.starGeometry, this.starMaterial);
    stars.renderOrder = -1;

    // The sky surrounds the camera; never let Three cull it away.
    nebula.frustumCulled = false;
    stars.frustumCulled = false;
    this.group.add(nebula, stars);
  }

  setProjectionScale(scale: number): void {
    this.starMaterial.uniforms.uProjectionScale!.value = scale;
  }

  update(elapsed: number): void {
    this.starMaterial.uniforms.uTime!.value = elapsed;
  }

  dispose(): void {
    this.starGeometry.dispose();
    this.starMaterial.dispose();
    this.nebulaGeometry.dispose();
    this.nebulaMaterial.dispose();
  }
}
