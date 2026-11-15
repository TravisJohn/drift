/**
 * Interior environment - something for metal to reflect.
 *
 * Physically based materials look flat and dead with nothing around them
 * to mirror. This bakes a small neutral "room" (soft light panels, no
 * image file) into a reflection map once at startup; every interior
 * surface then picks up faint, plausible highlights from it.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface InteriorEnvironment {
  readonly texture: THREE.Texture;
  dispose(): void;
}

export function createInteriorEnvironment(renderer: THREE.WebGLRenderer): InteriorEnvironment {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // The second argument blurs the bake a little: we want soft highlights,
  // not a mirror image of the generator's light panels.
  const target = generator.fromScene(room, 0.04);
  room.dispose();
  generator.dispose();
  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
