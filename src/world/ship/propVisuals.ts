/**
 * propVisuals - detailed procedural looks for the ship's props (M6, D7).
 *
 * Each prop kind gets a small assembly built from primitives, sized from
 * the same box spec that makes its collider - so visuals stay inside the
 * collision footprint. Emissive parts that should breathe (cryo pods,
 * screens, the reactor core) are returned as GlowPulse entries; the ship
 * world animates them each frame.
 */
import * as THREE from 'three';
import { bridgeScreenTexture, screenTexture } from '../../rendering/screenTextures';
import type { BridgeInstrument, PropKind } from '../../content/shipLayout';
import type { Vec3 } from '../../physics/vec3';

/** A material whose emissive intensity breathes over time. */
export interface GlowPulse {
  readonly material: THREE.MeshStandardMaterial;
  readonly base: number;
  readonly amplitude: number;
  /** Cycles per second. */
  readonly frequency: number;
  readonly phase: number;
}

export interface PropVisual {
  readonly group: THREE.Group;
  readonly pulses: readonly GlowPulse[];
}

const CRYO_GLOW = 0x7fd4e8;
const SCREEN_GLOW = 0x8fe0ff;
const REACTOR_GLOW = 0xffa050;
const HOLO_GLOW = 0x5fd8ff;
/**
 * Emissive level of displays. Above 1 on purpose: a screen is mostly dark
 * with a few lit elements, and those should be bright enough to bloom.
 */
const SCREEN_LEVEL = 2.2;

const metal = (color: number, roughness = 0.75, metalness = 0.35): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const addBox = (
  group: THREE.Group,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
};

function buildPod(size: Vec3, phase: number): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;

  // Frame base, lower 45%.
  addBox(group, metal(0x4a5a68, 0.6, 0.45), sx, sy * 0.45, sz, 0, -sy * 0.275, 0);

  // Glass canopy over the sleeper.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd4e8,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
  });
  addBox(group, glass, sx * 0.84, sy * 0.5, sz * 0.88, 0, sy * 0.18, 0);

  // The sleeper's light - slow breathing glow inside the pod.
  const glow = new THREE.MeshStandardMaterial({
    color: 0x0c2026,
    emissive: CRYO_GLOW,
    emissiveIntensity: 0.5,
    roughness: 0.5,
  });
  addBox(group, glow, sx * 0.5, sy * 0.08, sz * 0.55, 0, -sy * 0.02, 0);

  // Side rails.
  const rail = metal(0x39434d, 0.55, 0.5);
  addBox(group, rail, sx * 0.08, sy * 0.1, sz * 0.96, -sx * 0.46, -sy * 0.03, 0);
  addBox(group, rail, sx * 0.08, sy * 0.1, sz * 0.96, sx * 0.46, -sy * 0.03, 0);

  return {
    group,
    // ~10 breaths a minute: the pace of deep cryo sleep.
    pulses: [{ material: glow, base: 0.5, amplitude: 0.28, frequency: 0.16, phase }],
  };
}

function buildConsole(size: Vec3, phase: number, instrument?: BridgeInstrument): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;

  addBox(group, metal(0x3b4652, 0.7, 0.4), sx, sy * 0.55, sz, 0, -sy * 0.225, 0);

  const level = instrument ? 1.1 : SCREEN_LEVEL;
  const screen = new THREE.MeshStandardMaterial({
    color: 0x0a1218,
    emissive: instrument ? 0xffffff : SCREEN_GLOW,
    emissiveMap: instrument
      ? bridgeScreenTexture(instrument)
      : screenTexture('readout', Math.round(phase / 1.7)),
    emissiveIntensity: level,
    roughness: 0.3,
  });
  const face = addBox(group, screen, sx * 0.88, sy * 0.42, sz * 0.14, 0, sy * 0.22, sz * 0.12);
  face.rotation.x = instrument ? -0.22 : 0.35;
  if (instrument) {
    // Only the glass faces the operator. Sample the dark margin for the case.
    const normals = face.geometry.getAttribute('normal');
    const uv = face.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      if (normals.getZ(i) < 0.99) uv.setXY(i, 0, 0);
    }
  }

  // Thin keyboard shelf.
  addBox(group, metal(0x2e3741, 0.6, 0.45), sx * 0.8, sy * 0.06, sz * 0.4, 0, sy * 0.06, -sz * 0.2);

  return {
    group,
    pulses: [
      { material: screen, base: level, amplitude: instrument ? 0.05 : 0.25, frequency: 1.1, phase },
    ],
  };
}

function buildMachine(size: Vec3, phase: number): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;
  const radius = Math.min(sx, sz) * 0.3;

  // Housing plinth.
  addBox(group, metal(0x4a4036, 0.8, 0.3), sx, sy * 0.3, sz, 0, -sy * 0.35, 0);

  // Core column.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, sy * 0.85, 14),
    metal(0x2c3230, 0.5, 0.6),
  );
  core.position.y = sy * 0.05;
  group.add(core);

  // Glowing band around the core - the reactor's heartbeat.
  const glow = new THREE.MeshStandardMaterial({
    color: 0x1a120c,
    emissive: REACTOR_GLOW,
    emissiveIntensity: 1.0,
    roughness: 0.4,
  });
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, sy * 0.16, 14),
    glow,
  );
  band.position.y = sy * 0.05;
  group.add(band);

  // Containment rings.
  const ringMaterial = metal(0x39434d, 0.55, 0.55);
  for (const yOff of [-0.18, 0.28]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.3, radius * 0.12, 8, 20),
      ringMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = sy * yOff;
    group.add(ring);
  }

  return {
    group,
    pulses: [{ material: glow, base: 1.0, amplitude: 0.3, frequency: 0.45, phase }],
  };
}

function buildCrate(size: Vec3): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;

  addBox(group, metal(0x4a5261, 0.85, 0.15), sx * 0.94, sy * 0.94, sz * 0.94, 0, 0, 0);
  // Lid and straps give the silhouette an edge to read in low light.
  addBox(group, metal(0x39414e, 0.8, 0.2), sx, sy * 0.1, sz, 0, sy * 0.45, 0);
  const strap = metal(0x5a6472, 0.7, 0.3);
  addBox(group, strap, sx * 1.01, sy * 0.12, sz * 0.14, 0, 0, 0);
  addBox(group, strap, sx * 0.14, sy * 0.12, sz * 1.01, 0, 0, 0);

  return { group, pulses: [] };
}

function buildSeat(size: Vec3): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;
  const pad = metal(0x47505c, 0.9, 0.1);

  addBox(group, metal(0x2e3741, 0.7, 0.4), sx * 0.3, sy * 0.3, sz * 0.3, 0, -sy * 0.35, 0);
  addBox(group, pad, sx, sy * 0.22, sz, 0, -sy * 0.09, 0);
  // Backrest toward the stern: bridge seats face the forward window (-Z).
  addBox(group, pad, sx, sy * 0.75, sz * 0.2, 0, sy * 0.2, sz * 0.4);

  return { group, pulses: [] };
}

/** The dashboard's table: a dark plinth under a softly glowing projector pad. */
function buildHolotable(size: Vec3, phase: number): PropVisual {
  const group = new THREE.Group();
  const { x: sx, y: sy, z: sz } = size;

  // Narrow plinth under a wider top: reads as a table, not a crate.
  addBox(group, metal(0x2a323c, 0.6, 0.5), sx * 0.62, sy * 0.78, sz * 0.62, 0, -sy * 0.11, 0);
  addBox(group, metal(0x3d4854, 0.5, 0.55), sx, sy * 0.14, sz, 0, sy * 0.43, 0);

  // The projector pad the hologram rises from.
  const pad = new THREE.MeshStandardMaterial({
    color: 0x06141c,
    emissive: HOLO_GLOW,
    emissiveMap: screenTexture('grid'),
    emissiveIntensity: SCREEN_LEVEL,
    roughness: 0.25,
  });
  addBox(group, pad, sx * 0.82, 0.012, sz * 0.74, 0, sy * 0.5 + 0.006, 0);

  // Four corner emitters.
  const emitter = metal(0x1c232b, 0.4, 0.7);
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      addBox(group, emitter, 0.07, 0.05, 0.07, cx * sx * 0.44, sy * 0.5 + 0.025, cz * sz * 0.4);
    }
  }

  return {
    group,
    pulses: [{ material: pad, base: SCREEN_LEVEL, amplitude: 0.4, frequency: 0.3, phase }],
  };
}

/** Build the visual assembly for one prop. `phase` de-syncs pulse timing. */
export function buildPropVisual(
  kind: PropKind,
  size: Vec3,
  phase: number,
  instrument?: BridgeInstrument,
): PropVisual {
  switch (kind) {
    case 'pod':
      return buildPod(size, phase);
    case 'console':
      return buildConsole(size, phase, instrument);
    case 'machine':
      return buildMachine(size, phase);
    case 'crate':
      return buildCrate(size);
    case 'seat':
      return buildSeat(size);
    case 'holotable':
      return buildHolotable(size, phase);
  }
}
