import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gameConfig } from '../../src/config/gameConfig';
import { buildDroneModel } from '../../src/player/droneModel';
import { DroneVisual } from '../../src/player/droneVisual';
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

  it('glows red at the tether limit and returns to blue once back in reach', () => {
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
    const glow = (): THREE.PointLight => {
      let found: THREE.PointLight | null = null;
      visual.group.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) found = o as THREE.PointLight;
      });
      if (!found) throw new Error('no hover glow light');
      return found;
    };
    visual.apply(snapshot, 1, 3);
    expect(glow().color.r).toBeGreaterThan(glow().color.b);
    visual.apply({ ...snapshot, tetherStrain: 0 }, 1, 3);
    expect(glow().color.getHex()).toBe(gameConfig.droneLook.exhaustColor);
    // The halo is hidden again, so it costs nothing in normal flight.
    let haloShown = false;
    visual.group.traverse((o) => {
      if (
        (o as THREE.Mesh).isMesh &&
        o.visible &&
        (o as THREE.Mesh).material instanceof THREE.ShaderMaterial
      )
        haloShown = true;
    });
    expect(haloShown).toBe(false);
    visual.dispose();
  });
});
