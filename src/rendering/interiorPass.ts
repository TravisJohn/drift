/**
 * InteriorPass - draws the ship interior over the space image, shading
 * each pixel only once.
 *
 * The interior is the expensive part of the frame: many lights, each
 * evaluated per pixel. Drawn naively, walls of rooms behind the one you are
 * in get fully lit and then painted over (measured: more than half the
 * frame time on integrated graphics). So the pass draws twice:
 *   1. depth only - solid surfaces write how far away they are, nothing
 *      is lit;
 *   2. colour - with depth already known, the GPU rejects every hidden
 *      pixel before running the lighting.
 *
 * See-through things (glass, the drone's ground shadow) must not block
 * what is behind them, so they sit out step 1.
 */
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export class InteriorPass extends Pass {
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly seeThrough: THREE.Object3D[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    super();
    // Draws into the frame the space pass just filled; nothing to swap.
    this.needsSwap = false;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    // Keep the space image; only depth is reset before the interior draws.
    renderer.clearDepth();

    this.hideSeeThrough();
    this.scene.overrideMaterial = this.depthOnly;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.showSeeThrough();

    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
  }

  override dispose(): void {
    this.depthOnly.dispose();
  }

  /** Hide every visible see-through mesh for the depth-only draw. */
  private hideSeeThrough(): void {
    this.seeThrough.length = 0;
    this.scene.traverseVisible((object) => {
      const material = (object as THREE.Mesh).material as
        THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      if (list.some((m) => m.transparent || !m.depthWrite)) this.seeThrough.push(object);
    });
    for (const object of this.seeThrough) object.visible = false;
  }

  private showSeeThrough(): void {
    for (const object of this.seeThrough) object.visible = true;
  }
}
