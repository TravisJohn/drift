/**
 * Drone model - builds the maintenance drone's geometry.
 *
 * Layout, in metres, nose toward -Z, origin at the collision sphere's
 * centre (every part stays inside gameConfig.drone.radius):
 * - a squat two-tone hull: a painted shell over a gunmetal belly, with an
 *   amber service stripe, a top hatch and side vents;
 * - a dark glass visor across the front holding one glowing eye;
 * - four ducted thrusters on short struts at the diagonals, glowing inside
 *   and free to tilt;
 * - an antenna with a beacon, a glowing hover ring under the belly, and a
 *   tool arm folded under the chin.
 *
 * Construction only. How parts move is decided in droneAnimation.ts and
 * applied by droneVisual.ts through the handles returned here. Static
 * parts that share a material are merged into one mesh so the whole drone
 * costs about sixteen draw calls (the target includes integrated graphics).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gameConfig } from '../config/gameConfig';

const HULL_RADIUS = 0.17;
/** The hull is a sphere squashed a little flat and stretched a little long. */
const HULL_SCALE = new THREE.Vector3(1, 0.82, 1.08);
/** Horizontal distance from the centre to each thruster duct's axis. */
const THRUSTER_REACH = 0.215;
const THRUSTER_Y = -0.035;
const DUCT_RADIUS = 0.056;
const DUCT_HEIGHT = 0.05;

export interface DroneModel {
  readonly root: THREE.Group;
  /** The eye: scaled flat on Y to blink, moved on X/Y to glance. */
  readonly eye: THREE.Group;
  /** Where the eye sits at rest, in root space. */
  readonly eyeRest: THREE.Vector3;
  /** One pivot per thruster, at the duct's centre; rotate to tilt. */
  readonly thrusters: readonly THREE.Group[];
  readonly eyeMaterial: THREE.MeshStandardMaterial;
  readonly accentMaterial: THREE.MeshStandardMaterial;
  readonly exhaustMaterial: THREE.MeshStandardMaterial;
  readonly beaconMaterial: THREE.MeshStandardMaterial;
}

/** Bake a position, rotation and scale into a geometry (for merging). */
function placed(
  geometry: THREE.BufferGeometry,
  position: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.applyMatrix4(matrix);
}

/** One mesh from several placed geometries that share a material. */
function merged(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) {
    // Only happens if parts disagree on attributes - a programming error.
    throw new Error('Drift: drone parts could not be merged into one mesh');
  }
  return new THREE.Mesh(geometry, material);
}

function createMaterials() {
  const cfg = gameConfig.droneLook;
  return {
    paint: new THREE.MeshStandardMaterial({
      color: cfg.hullColor,
      roughness: 0.48,
      metalness: 0.15,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: cfg.metalColor,
      roughness: 0.36,
      metalness: 0.75,
    }),
    // Ducts are open tubes, seen from inside as well as out.
    duct: new THREE.MeshStandardMaterial({
      color: cfg.metalColor,
      roughness: 0.4,
      metalness: 0.7,
      side: THREE.DoubleSide,
    }),
    // A touch of self-light keeps the stripe readable in dark rooms.
    accent: new THREE.MeshStandardMaterial({
      color: cfg.accentColor,
      roughness: 0.5,
      metalness: 0.2,
      emissive: cfg.accentColor,
      emissiveIntensity: 0.18,
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.1, metalness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: cfg.eyeColor,
      emissiveIntensity: cfg.eyeIntensity,
    }),
    exhaust: new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: cfg.exhaustColor,
      emissiveIntensity: cfg.exhaustIdle,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: 0x200806,
      emissive: cfg.beaconColor,
      emissiveIntensity: cfg.beaconRest,
    }),
  };
}

type Materials = ReturnType<typeof createMaterials>;

/** Shell, belly, stripe and visor: built round, then squashed together. */
function buildHull(m: Materials): THREE.Group {
  const r = HULL_RADIUS;
  const hull = new THREE.Group();
  hull.scale.copy(HULL_SCALE);

  const half = Math.PI / 2;
  const paint = merged(
    [
      new THREE.SphereGeometry(r, 36, 12, 0, Math.PI * 2, 0, half),
      // Seam ring where shell meets belly.
      placed(new THREE.TorusGeometry(r * 1.004, 0.006, 6, 48), [0, 0, 0], [half, 0, 0]),
    ],
    m.paint,
  );

  const metal = merged(
    [
      new THREE.SphereGeometry(r * 0.985, 36, 10, 0, Math.PI * 2, half, half),
      // Service hatch on top.
      placed(new THREE.CylinderGeometry(0.045, 0.048, 0.012, 24), [0, r - 0.003, 0.02]),
      // Three vent slits on each side, just above the seam.
      ...[-1, 1].flatMap((side) =>
        [0.03, 0.048, 0.066].map((y) =>
          placed(new THREE.BoxGeometry(0.008, 0.007, 0.06), [
            side * Math.sqrt(r * r - y * y),
            y,
            0.035,
          ]),
        ),
      ),
    ],
    m.metal,
  );

  // Amber band around the shell, above the visor.
  const stripe = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.005, 36, 2, 0, Math.PI * 2, 0.98, 0.1),
    m.accent,
  );

  // Visor: a glass band across the front. In Three.js a sphere's phi of
  // 3PI/2 points along -Z, the drone's nose.
  const visorWidth = 1.9;
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(
      r * 1.012,
      28,
      8,
      (Math.PI * 3) / 2 - visorWidth / 2,
      visorWidth,
      1.2,
      0.64,
    ),
    m.glass,
  );

  hull.add(paint, metal, stripe, visor);
  return hull;
}

/** Iris ring and pupil, facing -Z, origin at the eye's centre. */
function buildEye(m: Materials): THREE.Group {
  const eye = new THREE.Group();
  eye.add(
    merged(
      [
        new THREE.TorusGeometry(0.034, 0.006, 8, 32),
        // Circles face +Z; turn the pupil round to face the nose.
        placed(new THREE.CircleGeometry(0.019, 24), [0, 0, -0.002], [0, Math.PI, 0]),
      ],
      m.eye,
    ),
  );
  return eye;
}

/** One ducted thruster around a pivot at the duct's centre. */
function buildThruster(m: Materials, angle: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(
    Math.cos(angle) * THRUSTER_REACH,
    THRUSTER_Y,
    Math.sin(angle) * THRUSTER_REACH,
  );
  const top = DUCT_HEIGHT / 2;
  const body = merged(
    [
      new THREE.CylinderGeometry(DUCT_RADIUS, DUCT_RADIUS * 0.9, DUCT_HEIGHT, 20, 1, true),
      placed(new THREE.TorusGeometry(DUCT_RADIUS, 0.007, 6, 24), [0, top, 0], [Math.PI / 2, 0, 0]),
      // Fan hub and three blades.
      new THREE.CylinderGeometry(0.012, 0.015, 0.026, 10),
      // Each blade is pitched about its own length, then spread round.
      ...[0, 1, 2].map((i) =>
        new THREE.BoxGeometry(DUCT_RADIUS * 1.6, 0.003, 0.012)
          .rotateX(0.35)
          .rotateY((i * Math.PI * 2) / 3)
          .translate(0, 0.004, 0),
      ),
    ],
    m.duct,
  );
  // Glow seen from above (down into the duct) and from below (exhaust).
  const exhaust = merged(
    [
      placed(
        new THREE.CircleGeometry(DUCT_RADIUS * 0.82, 20),
        [0, -0.008, 0],
        [-Math.PI / 2, 0, 0],
      ),
      placed(
        new THREE.CircleGeometry(DUCT_RADIUS * 0.82, 20),
        [0, -top + 0.003, 0],
        [Math.PI / 2, 0, 0],
      ),
    ],
    m.exhaust,
  );
  pivot.add(body, exhaust);
  return pivot;
}

/** Struts, antenna mast and folded tool arm: fixed gunmetal fittings. */
function buildFittings(m: Materials): THREE.Mesh {
  const struts = [0, 1, 2, 3].map((i) => {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const mid = (THRUSTER_REACH - DUCT_RADIUS + 0.11) / 2;
    return placed(
      new THREE.BoxGeometry(0.1, 0.016, 0.026),
      [Math.cos(angle) * mid, THRUSTER_Y, Math.sin(angle) * mid],
      [0, -angle, 0],
    );
  });

  // Antenna on the upper back, leaning back a little.
  const mast = placed(
    new THREE.CylinderGeometry(0.006, 0.008, 0.1, 8),
    [0.045, 0.125 + 0.05 * Math.cos(0.25), 0.06 + 0.05 * Math.sin(0.25)],
    [0.25, 0, 0],
  );

  // Tool arm folded under the chin: shoulder, arm, two jaws.
  const arm = [
    placed(
      new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10),
      [0, -0.118, -0.085],
      [0, 0, Math.PI / 2],
    ),
    placed(new THREE.BoxGeometry(0.02, 0.02, 0.08), [0, -0.135, -0.121], [-0.45, 0, 0]),
    placed(new THREE.BoxGeometry(0.006, 0.03, 0.02), [-0.011, -0.164, -0.162]),
    placed(new THREE.BoxGeometry(0.006, 0.03, 0.02), [0.011, -0.164, -0.162]),
  ];
  return merged([...struts, mast, ...arm], m.metal);
}

export function buildDroneModel(): DroneModel {
  const m = createMaterials();
  const root = new THREE.Group();
  root.name = 'drone';

  root.add(buildHull(m), buildFittings(m));

  // The eye sits just proud of the visor's centre.
  const eyeRest = new THREE.Vector3(0, 0.006, -HULL_RADIUS * 1.012 * HULL_SCALE.z - 0.003);
  const eye = buildEye(m);
  eye.position.copy(eyeRest);
  root.add(eye);

  const thrusters = [0, 1, 2, 3].map((i) => buildThruster(m, Math.PI / 4 + (i * Math.PI) / 2));
  root.add(...thrusters);

  // Hover ring on the belly, sharing the thrusters' glow.
  const ringY = -HULL_RADIUS * HULL_SCALE.y * Math.sqrt(1 - (0.065 / HULL_RADIUS) ** 2);
  const hoverRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.009, 8, 32), m.exhaust);
  hoverRing.rotation.x = Math.PI / 2;
  hoverRing.position.y = ringY;

  // Beacon at the top of the antenna (mast end, see buildFittings).
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), m.beacon);
  beacon.position.set(0.045, 0.125 + 0.1 * Math.cos(0.25), 0.06 + 0.1 * Math.sin(0.25));

  root.add(hoverRing, beacon);

  return {
    root,
    eye,
    eyeRest,
    thrusters,
    eyeMaterial: m.eye,
    accentMaterial: m.accent,
    exhaustMaterial: m.exhaust,
    beaconMaterial: m.beacon,
  };
}
