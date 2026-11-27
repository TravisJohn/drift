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
import { gameConfig } from '../../src/config/gameConfig';
import { buildFrames } from '../../src/world/ship/frames';
import {
  buildAccentLights,
  buildRoomLights,
  buildShip,
  buildShipBoxes,
} from '../../src/world/ship/shipBuilder';
import { buildTrimBoxes } from '../../src/world/ship/trim';
import { isGlowLimitedNearCamera } from '../../src/rendering/nearGlow';

describe('generatePanelTextureData (a bulkhead wall, not flat colour)', () => {
  const SIZE = 256;
  const wall = generatePanelTextureData('wall', SIZE, 7);
  /** Brightness (0..255) of the wall at tile coordinates u, v. */
  const tone = (data: { color: Uint8Array; size: number }, u: number, v: number): number => {
    const i = (Math.floor(v * data.size) * data.size + Math.floor(u * data.size)) * 4;
    return ((data.color[i] ?? 0) + (data.color[i + 1] ?? 0) + (data.color[i + 2] ?? 0)) / 3;
  };
  // Landmarks of the default design: a tall panel spans u 0..0.375 in the
  // main band (v 0.28..0.75); a plain plate spans u 0.25..0.5 in the kick
  // band below it.
  const PANEL = { u: 0.19, v: 0.55 };
  const KICK_PLATE = { u: 0.42, v: 0.2 };

  it('produces RGBA maps of the requested size', () => {
    expect(wall.color).toHaveLength(SIZE * SIZE * 4);
    expect(wall.normal).toHaveLength(SIZE * SIZE * 4);
  });

  it('the joint between two panels is darker than the panels', () => {
    const joint = tone(wall, 0.375, PANEL.v);
    expect(joint).toBeLessThan(tone(wall, PANEL.u, PANEL.v) * 0.7);
  });

  it('the kick band at the foot of the wall is darker than the panels above it', () => {
    expect(tone(wall, KICK_PLATE.u, KICK_PLATE.v)).toBeLessThan(tone(wall, PANEL.u, PANEL.v) * 0.7);
  });

  it('the band lines follow the window sill and head it is given', () => {
    // v = 0.33 is tall panel by default; raise the sill and it is kick band.
    const raised = generatePanelTextureData('wall', SIZE, 7, { sill: 0.4, head: 0.8 });
    expect(tone(raised, KICK_PLATE.u, 0.33)).toBeLessThan(tone(wall, PANEL.u, 0.33) * 0.7);
    // The belt between bands is a dark line exactly at the sill.
    expect(tone(raised, PANEL.u, 0.4)).toBeLessThan(tone(raised, PANEL.u, 0.6) * 0.7);
    expect(tone(wall, PANEL.u, 0.28)).toBeLessThan(tone(wall, PANEL.u, 0.6) * 0.7);
  });

  it('panel faces are flat and their edges are not (the normal map carries relief)', () => {
    const blue = (u: number, v: number): number =>
      wall.normal[(Math.floor(v * SIZE) * SIZE + Math.floor(u * SIZE)) * 4 + 2] ?? 0;
    expect(blue(PANEL.u, PANEL.v)).toBeGreaterThan(250); // facing straight out
    const atJoint = [-2, -1, 0, 1, 2].map((dx) => blue(0.375 + dx / SIZE, PANEL.v));
    expect(Math.min(...atJoint)).toBeLessThan(235); // tilted into the joint
  });

  it('is lit from above: a panel edge facing the ceiling is lighter than one facing the floor', () => {
    const FINE = 512;
    const fine = generatePanelTextureData('wall', FINE, 7);
    const average = (from: number, to: number): number => {
      let sum = 0;
      let count = 0;
      for (let v = from; v <= to; v += 0.5 / FINE) {
        sum += tone(fine, PANEL.u, v);
        count++;
      }
      return sum / count;
    };
    // The same sloped edge at the panel's top and at its foot: identical
    // but for which way it faces.
    const topEdge = average(0.74, 0.746);
    const bottomEdge = average(0.284, 0.29);
    expect(topEdge).toBeGreaterThan(bottomEdge * 1.2);
  });

  it('carries painted marks; floors and ceilings stay grey for their material to tint', () => {
    const orange = (data: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) > (data[i + 2] ?? 0) * 2 && (data[i] ?? 0) > 120) count++;
      }
      return count;
    };
    expect(orange(wall.color)).toBeGreaterThan(4);
    expect(orange(generatePanelTextureData('floor', SIZE, 7).color)).toBe(0);
    expect(orange(generatePanelTextureData('ceiling', SIZE, 7).color)).toBe(0);
  });

  it('repeats without a visible join (left edge meets right, top meets bottom)', () => {
    let worst = 0;
    for (let i = 0; i < SIZE; i++) {
      const left = tone(wall, 0.5 / SIZE, (i + 0.5) / SIZE);
      const right = tone(wall, 1 - 0.5 / SIZE, (i + 0.5) / SIZE);
      const bottom = tone(wall, (i + 0.5) / SIZE, 0.5 / SIZE);
      const top = tone(wall, (i + 0.5) / SIZE, 1 - 0.5 / SIZE);
      worst = Math.max(worst, Math.abs(left - right), Math.abs(top - bottom));
    }
    expect(worst).toBeLessThan(40);
  });

  it('is deterministic, and different surfaces get different patterns', () => {
    expect(Array.from(generatePanelTextureData('wall', 64, 7).color)).toEqual(
      Array.from(generatePanelTextureData('wall', 64, 7).color),
    );
    expect(Array.from(generatePanelTextureData('ceiling', SIZE, 7).color)).not.toEqual(
      Array.from(wall.color),
    );
  });

  it('rejects a nonsensical size or band layout (fail loud)', () => {
    expect(() => generatePanelTextureData('wall', 4, 1)).toThrow();
    expect(() => generatePanelTextureData('wall', 10.5, 1)).toThrow();
    expect(() => generatePanelTextureData('wall', 64, 1, { sill: 0.8, head: 0.3 })).toThrow();
    expect(() => generatePanelTextureData('wall', 64, 1, { sill: 0, head: 0.75 })).toThrow();
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

  it('gives every door a light bar on each face and a frame without a sill to trip on', () => {
    // One strip facing each room the door joins.
    expect(count('doorLight')).toBe(shipLayout.doors.length * 2);
    // Windows have 4 bars, doors 3.
    expect(count('frame')).toBe(shipLayout.windows.length * 4 + shipLayout.doors.length * 3);
  });

  it('runs a baseboard along the foot of the walls', () => {
    expect(count('baseboard')).toBeGreaterThan(shipLayout.rooms.length);
  });

  it('runs a guide light along each face that looks into a room, in that room', () => {
    const guides = trim.filter((p) => p.role === 'guideLight');
    // Inner walls have a room on both faces, so there are more guide
    // lights than baseboards; the outside of the hull has none.
    expect(guides.length).toBeGreaterThan(count('baseboard'));
    expect(guides.length).toBeLessThan(count('baseboard') * 2);
    for (const guide of guides) {
      const room = shipLayout.rooms.find((r) => r.id === guide.roomId);
      if (!room) throw new Error('guide light without a room');
      expect(guide.center.x).toBeGreaterThan(room.minX);
      expect(guide.center.x).toBeLessThan(room.maxX);
      expect(guide.center.z).toBeGreaterThan(room.minZ);
      expect(guide.center.z).toBeLessThan(room.maxZ);
    }
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

  it('keeps door lights thin from below, so a camera under a doorway is not flooded with glow', () => {
    // A bar as deep as the wall showed a wide glowing panel overhead; with
    // the follow camera in a doorway it filled the frame and bloom turned
    // the whole bridge white.
    const t = shipLayout.wallThickness;
    const lights = trim.filter((p) => p.role === 'doorLight');
    for (const light of lights) {
      expect(Math.min(light.size.x, light.size.z)).toBeLessThanOrEqual(0.05);
    }
    // Each strip has exactly one partner across the wall: the same door seen
    // from the other room.
    for (const light of lights) {
      const partners = lights.filter((other) => {
        if (other === light) return false;
        return Math.hypot(other.center.x - light.center.x, other.center.z - light.center.z) < 0.5;
      });
      expect(partners.length).toBe(1);
      const partner = partners[0]!;
      const gap = Math.hypot(partner.center.x - light.center.x, partner.center.z - light.center.z);
      expect(gap).toBeGreaterThan(t * 0.9);
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

  it("adds a small glow for every rib light, in its room's own colour", () => {
    const frames = buildFrames(shipLayout, gameConfig.interior.frameSpacing);
    const glows = buildAccentLights(frames.glows);
    const roomLights = buildRoomLights(shipLayout);
    expect(glows).toHaveLength(frames.glows.length);
    const shortestRoomLight = Math.min(...roomLights.map((l) => l.distance));
    for (const glow of glows) {
      expect(glow.distance).toBeLessThan(shortestRoomLight);
      expect(glow.wavers).toBe(false);
    }
    const colourOf = (roomId: string): readonly number[] => {
      const index = frames.glows.findIndex((g) => g.roomId === roomId);
      return glows[index]?.color ?? [];
    };
    // Engineering glows warm, the cryo bay cold.
    const [warmR = 0, , warmB = 0] = colourOf('engineering');
    const [coldR = 0, , coldB = 0] = colourOf('cryo');
    expect(warmR).toBeGreaterThan(warmB * 2);
    expect(coldB).toBeGreaterThan(coldR * 2);
  });

  it('gives each room its own colour of rib light', () => {
    const ship = buildShip(shipLayout);
    const colours = new Set<number>();
    ship.group.traverse((obj) => {
      if (!obj.name.startsWith('trim:accent:')) return;
      const material = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(material.emissiveIntensity).toBeGreaterThan(1); // bright enough to bloom
      colours.add(material.emissive.getHex());
    });
    expect(colours.size).toBe(shipLayout.rooms.length);
    ship.dispose();
  });

  it('holds every bright light fixture under the glow threshold when the camera is beside it', () => {
    const ship = buildShip(shipLayout);
    const threshold = gameConfig.rendering.bloomThreshold;
    let fixtures = 0;
    ship.group.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!material?.isMeshStandardMaterial || material.emissiveMap) return;
      // Same luminance weights the glow pass uses.
      const c = material.emissive.clone().multiplyScalar(material.emissiveIntensity);
      if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b <= threshold) return;
      fixtures++;
      expect(isGlowLimitedNearCamera(material), `${obj.name || 'unnamed'} is not limited`).toBe(
        true,
      );
    });
    // Door strips, rib lights and the ceiling strips at least.
    expect(fixtures).toBeGreaterThanOrEqual(3);
    ship.dispose();
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
