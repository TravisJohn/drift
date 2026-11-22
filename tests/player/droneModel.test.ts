import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gameConfig } from '../../src/config/gameConfig';
import { buildDroneModel } from '../../src/player/droneModel';
import { DroneVisual } from '../../src/player/droneVisual';
import { companionColor, companionPose } from '../../src/player/companionPatrol';
import { ShipCompanions } from '../../src/player/shipCompanions';
import { shipLayout } from '../../src/content/shipLayout';
import { boxFromCenterSize } from '../../src/physics/colliders';
import { sphereBoxContact } from '../../src/physics/sphereCollision';
import { buildShipBoxes } from '../../src/world/ship/shipBuilder';
import { vec3 } from '../../src/physics/vec3';

/** Furthest any vertex of `root` lies from its origin, after transforms. */
function farthestVertex(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let max = 0;
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const positions = mesh.geometry.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      max = Math.max(max, v.length());
    }
  });
  return max;
}

function count(root: THREE.Object3D, test: (o: THREE.Object3D) => boolean): number {
  let n = 0;
  root.traverse((o) => {
    if (test(o)) n++;
  });
  return n;
}

describe('buildDroneModel (looks never change collision)', () => {
  it('fits entirely inside the collision sphere at rest', () => {
    const { root } = buildDroneModel();
    expect(farthestVertex(root)).toBeLessThan(gameConfig.drone.radius);
  });

  it('still fits with every thruster tilted to its limit', () => {
    const model = buildDroneModel();
    const max = gameConfig.droneLook.thrusterTiltMax;
    for (const t of model.thrusters) t.rotation.set(max, 0, -max);
    expect(farthestVertex(model.root)).toBeLessThan(gameConfig.drone.radius);
  });

  it('puts the eye on the nose (-Z), centred', () => {
    const { eyeRest } = buildDroneModel();
    expect(eyeRest.z).toBeLessThan(-0.15);
    expect(eyeRest.x).toBe(0);
  });

  it('has four thrusters, one in each diagonal quarter', () => {
    const { thrusters } = buildDroneModel();
    expect(thrusters).toHaveLength(4);
    const quarters = new Set(
      thrusters.map((t) => `${Math.sign(t.position.x)},${Math.sign(t.position.z)}`),
    );
    expect(quarters.size).toBe(4);
  });

  it('stays within a small draw-call budget (integrated graphics target)', () => {
    const { root } = buildDroneModel();
    expect(count(root, (o) => (o as THREE.Mesh).isMesh === true)).toBeLessThanOrEqual(16);
  });
});

describe('ShipCompanions', () => {
  it('adds distinct scouts alongside the player drone and moves them independently', () => {
    const roster = new ShipCompanions();
    roster.add(1, 0);
    roster.add(2, 0);
    roster.add(2, 0);
    const geometry = buildDroneModel('vesper-scout', companionColor(1));
    expect(farthestVertex(geometry.root)).toBeLessThan(gameConfig.drone.radius);
    const first = roster.group.getObjectByName('Vesper Scout 01')!;
    const second = roster.group.getObjectByName('Vesper Scout 02')!;
    expect(roster.group.children).toHaveLength(4); // model and scan beam per scout
    expect(first.position.equals(second.position)).toBe(false);
    expect(new Set(Array.from({ length: 24 }, (_, i) => companionColor(i + 1))).size).toBe(24);
    const initial = first.position.clone();
    roster.update(5);
    expect(first.position.distanceTo(initial)).toBeGreaterThan(1);
    roster.dispose();
  });

  it('flies through the actual doorway and clears the ship geometry at every inspection stop', () => {
    const boxes = buildShipBoxes(shipLayout).map((box) => boxFromCenterSize(box.center, box.size));
    const endpoints = new Set<number>();
    let enteredCorridor = false;
    for (let time = 0; time < 30; time += 0.05) {
      const { position, scan } = companionPose(1, time);
      if (scan) endpoints.add(scan.x);
      if (position.z > -10) enteredCorridor = true;
      expect(
        boxes.some((box) => sphereBoxContact(position, gameConfig.drone.radius + 0.035, box)),
      ).toBe(false);
      const raised = { ...position, y: position.y + 0.32 };
      expect(
        boxes.some((box) => sphereBoxContact(raised, gameConfig.drone.radius + 0.035, box)),
      ).toBe(false);
    }
    expect(enteredCorridor).toBe(true);
    expect(endpoints.size).toBe(2);
  });
});

describe('DroneVisual', () => {
  it('adds no lights beyond the original two (lights cost every surface)', () => {
    const visual = new DroneVisual();
    expect(count(visual.group, (o) => (o as THREE.Light).isLight === true)).toBe(2);
    visual.dispose();
  });

  it('moves its parts from controller state without errors', () => {
    const visual = new DroneVisual();
    const snapshot = {
      position: vec3(1, 1, 1),
      prevPosition: vec3(1, 1, 1.05),
      velocity: vec3(0, 0, -3),
      yaw: 0,
      leanPitch: -0.1,
      leanRoll: 0.1,
      bobOffset: 0,
      tetherStrain: 0,
    };
    visual.apply(snapshot, 0.5, 10);
    expect(visual.group.position.z).toBeCloseTo(1.025, 6);
    visual.dispose();
  });

  it('warns on the antenna only: a red beacon in a small glow, gone when back in reach', () => {
    const visual = new DroneVisual();
    const snapshot = {
      position: vec3(0, 1, 0),
      prevPosition: vec3(0, 1, 0),
      velocity: vec3(0, 0, 0),
      yaw: 0,
      leanPitch: 0,
      leanRoll: 0,
      bobOffset: 0,
      tetherStrain: 1,
    };
    const find = <T extends THREE.Object3D>(test: (o: THREE.Object3D) => boolean): T => {
      let found: THREE.Object3D | null = null;
      visual.group.traverse((o) => {
        if (test(o)) found = o;
      });
      if (!found) throw new Error('part not found');
      return found as T;
    };
    const halo = find<THREE.Mesh>(
      (o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material instanceof THREE.ShaderMaterial,
    );
    const beacon = find<THREE.Mesh>(
      (o) =>
        (o as THREE.Mesh).isMesh &&
        ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive?.getHex() ===
          gameConfig.droneLook.beaconColor,
    );
    const beaconMaterial = beacon.material as THREE.MeshStandardMaterial;
    const hoverLight = find<THREE.PointLight>((o) => (o as THREE.PointLight).isPointLight);

    visual.apply(snapshot, 1, 3, 1);
    expect(beaconMaterial.emissive.getHex()).toBe(gameConfig.droneLook.warningColor);
    expect(halo.visible).toBe(true);
    // The glow sits on the antenna, and is small: about the size of the beacon's glow, not the drone.
    expect(halo.position.distanceTo(beacon.position)).toBeLessThan(1e-9);
    expect(gameConfig.droneLook.warningHaloRadius).toBeLessThan(gameConfig.drone.radius / 2);
    // The rest of the drone keeps its colours.
    expect(hoverLight.color.getHex()).toBe(gameConfig.droneLook.exhaustColor);

    visual.apply({ ...snapshot, tetherStrain: 0 }, 1, 3, 0);
    expect(beaconMaterial.emissive.getHex()).toBe(gameConfig.droneLook.beaconColor);
    expect(halo.visible).toBe(false);
    visual.dispose();
  });
});
