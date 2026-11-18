/**
 * ShipExterior - the ship seen from outside, in the cinematic travel shot.
 *
 * A plated, well-used working ship: a faceted spine from prow to engine
 * face with the side rooms as bolted-on modules, a raised bridge canopy,
 * surface detail scattered over the hull tops, windows and portholes lit
 * in each room's own light, blinking navigation lights, and a bank of
 * engines whose glow follows the TravelDirector's engineIntensity.
 *
 * The shape comes from the room layout (exterior/hullPlan.ts), so the
 * outside always fits around the inside. Only visible during the
 * cinematic shot, while the interior is not drawn: it costs nothing the
 * rest of the time.
 */
import * as THREE from 'three';
import { gameConfig } from '../../config/gameConfig';
import type { ShipLayout } from '../../content/shipLayout';
import type { Vec3 } from '../../physics/vec3';
import { mulberry32 } from '../../core/random';
import { disposeObject3D } from '../../rendering/dispose';
import { flashLevel } from '../../rendering/pulse';
import { roomLightColor } from '../ship/shipBuilder';
import {
  blockGeometry,
  greebleGeometry,
  mergeParts,
  prepare,
  spineGeometry,
} from './exterior/hullGeometry';
import {
  type EngineMount,
  type HullPlan,
  type WindowLight,
  hullContains,
  planHull,
} from './exterior/hullPlan';
import { createHullTexture } from './exterior/hullTexture';

const PLUME_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec3 n = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    // How squarely this part of the plume faces the camera: soft edges.
    vFacing = abs(dot(n, normalize(-viewPosition.xyz)));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    // uv.y runs 0 at the nozzle to 1 at the plume's far end.
    float along = pow(1.0 - vUv.y, 1.8);
    float alpha = uIntensity * along * pow(vFacing, 1.4);
    gl_FragColor = vec4(uColor * alpha * 1.6, alpha);
  }
`;

/** How far each nozzle sits into the hull, so it reads as mounted. */
const NOZZLE_INSET = 0.3;
/** Plume length as a multiple of the nozzle radius. */
const PLUME_LENGTH = 6;

export class ShipExterior {
  readonly group = new THREE.Group();

  private readonly plan: HullPlan;

  private readonly hullTexture: THREE.DataTexture;
  private readonly engineCore: THREE.MeshBasicMaterial;
  private readonly plumeMaterial: THREE.ShaderMaterial;
  private readonly glowLight: THREE.PointLight;
  private readonly portLight: THREE.MeshBasicMaterial;
  private readonly starboardLight: THREE.MeshBasicMaterial;
  private readonly strobeLight: THREE.MeshBasicMaterial;

  constructor(layout: ShipLayout) {
    const cfg = gameConfig.exterior;
    const plan = planHull(layout, cfg.hullSeed);
    this.plan = plan;
    const tile = cfg.hullTileSize;

    this.hullTexture = createHullTexture(cfg.textureSize, cfg.textureSeed);
    const hullMaterial = new THREE.MeshStandardMaterial({
      map: this.hullTexture,
      roughness: 0.72,
      metalness: 0.28,
    });
    // Surface detail: the same plating, darker and more metallic.
    const detailMaterial = new THREE.MeshStandardMaterial({
      map: this.hullTexture,
      color: 0x8c9096,
      roughness: 0.58,
      metalness: 0.45,
      // The dish is an open bowl: its inside must draw too.
      side: THREE.DoubleSide,
    });

    const hull = mergeParts(
      [spineGeometry(plan.spine, tile), ...plan.blocks.map((b) => blockGeometry(b, tile))],
      'hull',
    );
    const detail = mergeParts(
      [
        greebleGeometry(
          plan.detailAreas,
          cfg.detailPerSquareMetre,
          mulberry32(cfg.hullSeed + 1),
          tile,
        ),
        ...dishParts(plan.dishBase, tile),
      ],
      'hull detail',
    );
    this.group.add(new THREE.Mesh(hull, hullMaterial), new THREE.Mesh(detail, detailMaterial));
    this.group.add(buildWindows(plan.windows, cfg.windowGlow));

    // Engines.
    this.engineCore = new THREE.MeshBasicMaterial({ color: cfg.engineColor });
    this.plumeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(cfg.engineColor) },
        uIntensity: { value: 0 },
      },
      vertexShader: PLUME_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.group.add(...buildEngines(plan.engines, tile, this.engineCore, this.plumeMaterial));

    // A faint cool fill from the far side, so the shadowed flank still shows
    // its plating (the space scene's key light is strong and one-sided).
    // Part of this group: it lights only the hull, only while it is shown.
    const fill = new THREE.DirectionalLight(0x8a9cc0, 0.7);
    fill.position.set(-0.7, -0.25, 0.6);
    this.group.add(fill);

    const sternZ = plan.spine[plan.spine.length - 1]!.z;
    this.glowLight = new THREE.PointLight(cfg.engineColor, 0, 34, 1.6);
    this.glowLight.position.set(0, (plan.spineBottom + plan.spineTop) / 2, sternZ + 4);
    this.group.add(this.glowLight);

    // Navigation lights.
    this.portLight = new THREE.MeshBasicMaterial({ color: cfg.portColor });
    this.starboardLight = new THREE.MeshBasicMaterial({ color: cfg.starboardColor });
    this.strobeLight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.group.add(buildRunningLights(plan, this.portLight, this.starboardLight, this.strobeLight));

    this.setEngineIntensity(0);
    this.update(0);
  }

  /** True when `point` (ship coordinates) lies inside the hull. */
  contains(point: Vec3): boolean {
    return hullContains(this.plan, point);
  }

  /** `intensity` is 0..1 from the TravelDirector. */
  setEngineIntensity(intensity: number): void {
    const cfg = gameConfig.exterior;
    const level = Math.min(1, Math.max(0, intensity));
    this.engineCore.color
      .set(cfg.engineColor)
      .multiplyScalar(cfg.engineIdle + (cfg.enginePeak - cfg.engineIdle) * level);
    this.plumeMaterial.uniforms.uIntensity!.value = level;
    this.glowLight.intensity = level * 70;
  }

  /** Blink the navigation lights; `elapsed` is seconds of scene time. */
  update(elapsed: number): void {
    const cfg = gameConfig.exterior;
    const swell = 0.5 + 0.5 * flashLevel(elapsed, cfg.navPeriod, cfg.navSwell);
    this.portLight.color.set(cfg.portColor).multiplyScalar(0.8 + 2.4 * swell);
    this.starboardLight.color.set(cfg.starboardColor).multiplyScalar(0.8 + 2.4 * swell);
    const strobe = Math.max(
      flashLevel(elapsed, cfg.strobePeriod, cfg.strobeFlash),
      flashLevel(elapsed, cfg.strobePeriod, cfg.strobeFlash, cfg.strobeFlash * 2.5),
    );
    this.strobeLight.color.setScalar(0.05 + 6 * strobe);
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.hullTexture.dispose();
  }
}

/** Width of one pane of glass in a long window, and the frame between panes. */
const PANE_WIDTH = 0.9;
const MULLION = 0.16;

/**
 * Every lit window and porthole as one mesh, coloured by its room. Long
 * windows are split into panes with dark frames between them: a row of
 * panes reads as a window, one glowing slab reads as a light panel.
 */
function buildWindows(windows: readonly WindowLight[], glow: number): THREE.Mesh {
  const parts = windows.flatMap((w) => {
    const alongZ = w.size.z >= w.size.x;
    const length = alongZ ? w.size.z : w.size.x;
    const panes = Math.max(1, Math.round(length / PANE_WIDTH));
    const pitch = length / panes;
    const paneLength = panes > 1 ? pitch - MULLION : length;
    const color = new THREE.Color(roomLightColor(w.roomId));
    return Array.from({ length: panes }, (_, i) => {
      const offset = (i - (panes - 1) / 2) * pitch;
      const box = new THREE.BoxGeometry(
        alongZ ? w.size.x : paneLength,
        w.size.y,
        alongZ ? paneLength : w.size.z,
      ).toNonIndexed();
      box.translate(
        w.center.x + (alongZ ? 0 : offset),
        w.center.y,
        w.center.z + (alongZ ? offset : 0),
      );
      const colors = new Float32Array(box.attributes.position!.count * 3);
      for (let k = 0; k < colors.length; k += 3) colors.set([color.r, color.g, color.b], k);
      box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return box;
    });
  });
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  material.color.setScalar(glow);
  return new THREE.Mesh(mergeParts(parts, 'window'), material);
}

/** Nozzles (one mesh), glowing cores (one mesh) and plumes (one mesh). */
function buildEngines(
  engines: readonly EngineMount[],
  tile: number,
  coreMaterial: THREE.Material,
  plumeMaterial: THREE.Material,
): THREE.Mesh[] {
  const nozzles: THREE.BufferGeometry[] = [];
  const cores: THREE.BufferGeometry[] = [];
  const plumes: THREE.BufferGeometry[] = [];
  for (const e of engines) {
    const { x, y, z } = e.position;
    const mouthZ = z + e.length - NOZZLE_INSET;
    // Cylinders run along Y; turned a quarter about X, +Y becomes +Z (aft),
    // so the wider "top" radius is the mouth.
    const bell = new THREE.CylinderGeometry(e.radius, e.radius * 0.78, e.length, 24, 1, true)
      .rotateX(Math.PI / 2)
      .translate(x, y, z + e.length / 2 - NOZZLE_INSET);
    const rim = new THREE.TorusGeometry(e.radius, e.radius * 0.08, 6, 24).translate(x, y, mouthZ);
    nozzles.push(prepare(bell, tile), prepare(rim, tile));

    cores.push(
      new THREE.CircleGeometry(e.radius * 0.92, 24).translate(x, y, mouthZ - e.length * 0.45),
    );

    const plumeLength = e.radius * PLUME_LENGTH;
    plumes.push(
      new THREE.CylinderGeometry(e.radius * 0.25, e.radius * 0.95, plumeLength, 20, 1, true)
        .rotateX(Math.PI / 2)
        .translate(x, y, mouthZ + plumeLength / 2),
    );
  }
  const nozzleMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3e45,
    roughness: 0.45,
    metalness: 0.7,
    side: THREE.DoubleSide,
  });
  return [
    new THREE.Mesh(mergeParts(nozzles, 'engine nozzle'), nozzleMaterial),
    new THREE.Mesh(mergeParts(cores, 'engine core'), coreMaterial),
    new THREE.Mesh(mergeParts(plumes, 'engine plume'), plumeMaterial),
  ];
}

/** Mast, bowl and feed horn of the comms dish, tilted up and forward. */
function dishParts(
  base: { x: number; y: number; z: number },
  tile: number,
): THREE.BufferGeometry[] {
  const mastHeight = 1.4;
  const top = new THREE.Vector3(base.x, base.y + mastHeight, base.z);
  const tilt = new THREE.Matrix4().makeRotationX(-0.6); // bowl faces up and toward the bow
  const at = new THREE.Matrix4().makeTranslation(top.x, top.y, top.z);
  const place = (g: THREE.BufferGeometry) => g.applyMatrix4(tilt).applyMatrix4(at);
  return [
    new THREE.CylinderGeometry(0.12, 0.2, mastHeight, 10).translate(
      base.x,
      base.y + mastHeight / 2,
      base.z,
    ),
    // A shallow spherical cap, opening upward (+Y) before the tilt.
    place(
      new THREE.SphereGeometry(
        1.5,
        24,
        6,
        0,
        Math.PI * 2,
        Math.PI * 0.62,
        Math.PI * 0.38,
      ).translate(0, 1.5, 0),
    ),
    place(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).translate(0, 0.75, 0)),
    place(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.3, 0)),
  ].map((g) => prepare(g, tile));
}

function buildRunningLights(
  plan: HullPlan,
  port: THREE.Material,
  starboard: THREE.Material,
  strobe: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const bulb = new THREE.SphereGeometry(0.14, 10, 8);
  for (const light of plan.lights) {
    const material = light.kind === 'port' ? port : light.kind === 'starboard' ? starboard : strobe;
    const mesh = new THREE.Mesh(bulb, material);
    mesh.position.set(light.position.x, light.position.y, light.position.z);
    group.add(mesh);
  }
  return group;
}
