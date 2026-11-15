import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { shipLayout } from '../../src/content/shipLayout';
import { boxFromCenterSize } from '../../src/physics/colliders';
import { vec3 } from '../../src/physics/vec3';
import { groundShadowStrength } from '../../src/player/droneVisual';
import { generatePanelTextureData } from '../../src/rendering/panelTextures';
import {
  type BakeLight,
  bakeVertexLight,
  distanceAttenuation,
  segmentBlocked,
  useBakedLight,
} from '../../src/world/ship/bakedLighting';
import { buildBoxesGeometry } from '../../src/world/ship/boxesGeometry';
import { buildRoomLights, buildShip, buildShipBoxes } from '../../src/world/ship/shipBuilder';
import { buildTrimBoxes } from '../../src/world/ship/trim';

describe('generatePanelTextureData (walls that read as plates, not flat colour)', () => {
  const SIZE = 64;
  const wall = generatePanelTextureData('wall', SIZE, 7);
  const pixel = (bytes: Uint8Array, x: number, y: number): number => bytes[(y * SIZE + x) * 4] ?? 0;

  it('produces RGBA maps of the requested size', () => {
    expect(wall.color).toHaveLength(SIZE * SIZE * 4);
    expect(wall.normal).toHaveLength(SIZE * SIZE * 4);
  });

  it('seams are darker than the plates between them', () => {
    // The wall has 2 x 2 plates: a seam runs along the tile edge, and the
    // middle of a plate sits a quarter of the way in.
    const seam = pixel(wall.color, 0, SIZE / 4);
    const plate = pixel(wall.color, SIZE / 4, SIZE / 4);
    expect(seam).toBeLessThan(plate * 0.85);
  });

  it('plates are flat and seams are not (the normal map carries relief)', () => {
    // Finer than the other checks: a seam is only a few pixels wide.
    const FINE = 256;
    const fine = generatePanelTextureData('wall', FINE, 7);
    const blue = (x: number, y: number): number => fine.normal[(y * FINE + x) * 4 + 2] ?? 0;
    const row = FINE / 4; // through the middle of a plate
    expect(blue(FINE / 4, row)).toBeGreaterThan(250); // facing straight out
    const besideSeam = [1, 2, 3, 4].map((x) => blue(x, row));
    expect(Math.min(...besideSeam)).toBeLessThan(235); // tilted into the seam
  });

  it('is deterministic, and different surfaces get different patterns', () => {
    expect(Array.from(generatePanelTextureData('wall', SIZE, 7).color)).toEqual(
      Array.from(wall.color),
    );
    expect(Array.from(generatePanelTextureData('ceiling', SIZE, 7).color)).not.toEqual(
      Array.from(wall.color),
    );
  });

  it('rejects a nonsensical size (fail loud)', () => {
    expect(() => generatePanelTextureData('wall', 4, 1)).toThrow();
    expect(() => generatePanelTextureData('wall', 10.5, 1)).toThrow();
  });
});

describe('buildBoxesGeometry', () => {
  const box = { center: vec3(1, 1, 0), size: vec3(4, 2, 0.3) };

  it('builds six quads per box by default', () => {
    const g = buildBoxesGeometry([box, box], 1);
    expect(g.getAttribute('position').count).toBe(2 * 6 * 4);
    expect(g.getIndex()?.count).toBe(2 * 6 * 6);
  });

  it('texture coordinates follow world metres, so seams line up across boxes', () => {
    const g = buildBoxesGeometry([box], 2);
    const uv = g.getAttribute('uv');
    const normal = g.getAttribute('normal');
    const us: number[] = [];
    for (let i = 0; i < uv.count; i++) if (normal.getZ(i) === 1) us.push(uv.getX(i));
    // The +Z face spans world x from -1 to 3; one texture repeat is 2 m.
    expect(Math.min(...us)).toBeCloseTo(-0.5, 6);
    expect(Math.max(...us)).toBeCloseTo(1.5, 6);
  });

  it('splits faces into cells no larger than maxCell (for baked light detail)', () => {
    const g = buildBoxesGeometry([box], 1, { maxCell: 0.5, faces: 'top' });
    // Top face is 4 m x 0.3 m: 8 x 1 cells, 9 x 2 vertices.
    expect(g.getAttribute('position').count).toBe(18);
    expect(g.getIndex()?.count).toBe(8 * 6);
  });

  it('can build only the face a floor or ceiling ever shows', () => {
    const top = buildBoxesGeometry([box], 1, { faces: 'top' });
    const bottom = buildBoxesGeometry([box], 1, { faces: 'bottom' });
    expect(top.getAttribute('normal').getY(0)).toBe(1);
    expect(bottom.getAttribute('normal').getY(0)).toBe(-1);
    expect(top.getAttribute('position').count).toBe(4);
  });

  it('every triangle faces outward (none would be culled from inside the room)', () => {
    const g = buildBoxesGeometry([box], 1, { maxCell: 1 });
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const index = g.getIndex();
    if (!index) throw new Error('expected an indexed geometry');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i));
      b.fromBufferAttribute(p, index.getX(i + 1));
      c.fromBufferAttribute(p, index.getX(i + 2));
      const face = b.sub(a).cross(c.sub(a)).normalize();
      const expected = new THREE.Vector3().fromBufferAttribute(n, index.getX(i));
      expect(face.dot(expected)).toBeCloseTo(1, 5);
    }
  });

  it('rejects a non-positive tile or cell size (fail loud)', () => {
    expect(() => buildBoxesGeometry([box], 0)).toThrow();
    expect(() => buildBoxesGeometry([box], 1, { maxCell: 0 })).toThrow();
  });
});

describe('buildTrimBoxes', () => {
  const walls = buildShipBoxes(shipLayout).filter((b) => b.role === 'wall');
  const trim = buildTrimBoxes(shipLayout, walls);
  const count = (role: string): number => trim.filter((t) => t.role === role).length;

  it('glazes every window and frames it on all four sides', () => {
    expect(count('glass')).toBe(shipLayout.windows.length);
  });

  it('gives every door a light bar and a frame without a sill to trip on', () => {
    expect(count('doorLight')).toBe(shipLayout.doors.length);
    // Windows have 4 bars, doors 3.
    expect(count('frame')).toBe(shipLayout.windows.length * 4 + shipLayout.doors.length * 3);
  });

  it('runs a baseboard and guide light along the foot of the walls', () => {
    expect(count('baseboard')).toBeGreaterThan(shipLayout.rooms.length);
    expect(count('guideLight')).toBe(count('baseboard'));
  });

  it('stays within a few centimetres of the walls (it is not a collider)', () => {
    const t = shipLayout.wallThickness;
    for (const piece of trim) {
      const thin = Math.min(piece.size.x, piece.size.z);
      expect(thin).toBeLessThanOrEqual(t + 0.1);
      expect(piece.size.x).toBeGreaterThan(0);
      expect(piece.size.y).toBeGreaterThan(0);
      expect(piece.size.z).toBeGreaterThan(0);
    }
  });

  it('never blocks a doorway at drone height', () => {
    for (const piece of trim) {
      if (piece.role !== 'frame' && piece.role !== 'doorLight') continue;
      const spansOpening = Math.max(piece.size.x, piece.size.z) > shipLayout.doorWidth * 0.8;
      const low = piece.center.y - piece.size.y / 2 < 1.8;
      const isWindowBar = piece.center.y < shipLayout.windowTop && piece.size.y < 0.1;
      // A bar wide enough to span a door must be up at the door head.
      if (spansOpening && low && !isWindowBar) {
        throw new Error(`trim piece crosses a doorway at height ${piece.center.y}`);
      }
    }
  });
});

describe('baked lighting', () => {
  const light = (over: Partial<BakeLight> = {}): BakeLight => ({
    position: vec3(0, 3, 0),
    color: [10, 10, 10],
    distance: 20,
    decay: 2,
    softRadius: 0,
    wavers: false,
    ...over,
  });
  const upFacing = (x: number, z: number): { p: Float32Array; n: Float32Array } => ({
    p: new Float32Array([x, 0, z]),
    n: new Float32Array([0, 1, 0]),
  });

  it('matches Three.js point-light falloff, so a bake equals the live light', () => {
    expect(distanceAttenuation(2, 0, 2)).toBeCloseTo(0.25, 6);
    // With a range, light fades to exactly nothing at the range.
    expect(distanceAttenuation(10, 10, 2)).toBe(0);
    expect(distanceAttenuation(5, 10, 2)).toBeCloseTo((1 / 25) * (1 - 1 / 16) ** 2, 6);
  });

  it('a surface facing the light is lit; one facing away is not', () => {
    const { p } = upFacing(0, 0);
    const lit = bakeVertexLight(p, new Float32Array([0, 1, 0]), [light()], []);
    const away = bakeVertexLight(p, new Float32Array([0, -1, 0]), [light()], []);
    expect(lit.steady[0]).toBeGreaterThan(0);
    expect(away.steady[0]).toBe(0);
  });

  it('light falls off with distance', () => {
    const near = bakeVertexLight(upFacing(0, 0).p, upFacing(0, 0).n, [light()], []);
    const far = bakeVertexLight(upFacing(6, 0).p, upFacing(6, 0).n, [light()], []);
    expect(far.steady[0]).toBeLessThan((near.steady[0] ?? 0) * 0.5);
  });

  it('a box between the light and the surface casts a shadow', () => {
    const crate = boxFromCenterSize(vec3(0, 1.5, 0), vec3(1, 1, 1));
    const { p, n } = upFacing(0, 0);
    expect(bakeVertexLight(p, n, [light()], [crate]).steady[0]).toBe(0);
    // Beside the crate, not under it: still lit.
    const beside = upFacing(3, 0);
    expect(bakeVertexLight(beside.p, beside.n, [light()], [crate]).steady[0]).toBeGreaterThan(0);
  });

  it('a prop is not shadowed by its own collider', () => {
    const own = boxFromCenterSize(vec3(0, 0.5, 0), vec3(1, 1, 1));
    const top = { p: new Float32Array([0, 1, 0]), n: new Float32Array([0, 1, 0]) };
    // The vertex sits on the collider's top face; nudged, it clears it either way.
    const inside = { p: new Float32Array([0, 0.5, 0]), n: new Float32Array([0, 1, 0]) };
    expect(bakeVertexLight(inside.p, inside.n, [light()], [own]).steady[0]).toBe(0);
    expect(bakeVertexLight(inside.p, inside.n, [light()], [own], 0).steady[0]).toBeGreaterThan(0);
    expect(bakeVertexLight(top.p, top.n, [light()], [own]).steady[0]).toBeGreaterThan(0);
  });

  it('light does not leak through walls into the next room', () => {
    const wall = boxFromCenterSize(vec3(2, 1.6, 0), vec3(0.3, 3.2, 10));
    const nextRoom = upFacing(4, 0);
    expect(bakeVertexLight(nextRoom.p, nextRoom.n, [light()], [wall]).steady[0]).toBe(0);
  });

  it('a soft fixture does not burn the surface right beside it', () => {
    const close = { p: new Float32Array([0, 2.9, 0]), n: new Float32Array([0, 1, 0]) };
    const hard = bakeVertexLight(close.p, close.n, [light()], []).steady[0] ?? 0;
    const soft = bakeVertexLight(close.p, close.n, [light({ softRadius: 1.4 })], []).steady[0] ?? 0;
    expect(soft).toBeLessThan(hard / 50);
  });

  it('keeps wavering lights apart so they can flicker at run time', () => {
    const { p, n } = upFacing(0, 0);
    const baked = bakeVertexLight(p, n, [light({ wavers: true })], []);
    expect(baked.steady[0]).toBe(0);
    expect(baked.wavering[0]).toBeGreaterThan(0);
  });

  it('segmentBlocked ignores a box the line only touches', () => {
    const box = boxFromCenterSize(vec3(0, 0.5, 0), vec3(1, 1, 1));
    expect(segmentBlocked(vec3(-2, 0.5, 0), vec3(2, 0.5, 0), [box])).toBe(true);
    expect(segmentBlocked(vec3(-2, 1, 0), vec3(2, 1, 0), [box])).toBe(false); // along the top
    expect(segmentBlocked(vec3(-2, 3, 0), vec3(2, 3, 0), [box])).toBe(false);
  });

  it('rejects mismatched vertex data (fail loud)', () => {
    expect(() => bakeVertexLight(new Float32Array(3), new Float32Array(6), [], [])).toThrow();
  });

  it('fails loudly if a Three.js upgrade renames the shader hooks it relies on', () => {
    const material = new THREE.MeshStandardMaterial();
    useBakedLight(material, { value: 1 });
    const compile = material.onBeforeCompile.bind(material) as (shader: unknown) => void;
    expect(() =>
      compile({ uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' }),
    ).toThrow(/shader anchor/);

    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <lights_fragment_maps>',
    };
    compile(shader);
    expect(shader.vertexShader).toContain('bakedLight + bakedWaver * uLightWaver');
    expect(shader.fragmentShader).toContain('irradiance += vBakedLight');
    material.dispose();
  });
});

describe('the lit ship', () => {
  it('has a light for every room and extra ones down the long corridor', () => {
    const lights = buildRoomLights(shipLayout);
    expect(lights.length).toBe(shipLayout.rooms.length + 2);
    expect(lights.filter((l) => l.wavers).length).toBe(1); // engineering only
    for (const l of lights) expect(l.position.y).toBeLessThan(shipLayout.ceilingHeight);
  });

  it('bakes light onto the structure, and leaves some of it in shadow', () => {
    const ship = buildShip(shipLayout);
    let litVertices = 0;
    let darkVertices = 0;
    ship.group.traverse((obj) => {
      const baked = (obj as THREE.Mesh).geometry?.getAttribute('bakedLight');
      if (!baked) return;
      for (let i = 0; i < baked.count; i++) {
        if (baked.getX(i) + baked.getY(i) + baked.getZ(i) > 0.05) litVertices++;
        else darkVertices++;
      }
    });
    expect(litVertices).toBeGreaterThan(1000);
    expect(darkVertices).toBeGreaterThan(100);
    ship.dispose();
  });

  it('needs no live room lights: the only lights left are cheap ones', () => {
    const ship = buildShip(shipLayout);
    let pointLights = 0;
    ship.group.traverse((obj) => {
      if ((obj as THREE.PointLight).isPointLight) pointLights++;
    });
    expect(pointLights).toBe(0);
    ship.dispose();
  });
});

describe('groundShadowStrength (the drone looks grounded, not pasted on)', () => {
  it('is strongest near the deck and gone when flying high', () => {
    expect(groundShadowStrength(0)).toBeGreaterThan(0.4);
    expect(groundShadowStrength(1)).toBeLessThan(groundShadowStrength(0.3));
    expect(groundShadowStrength(3)).toBe(0);
  });
});
