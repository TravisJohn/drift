/**
 * RenderPipeline - draws the frame: space, then the ship interior on top,
 * then the finishing treatment (glow around bright things, film-style tone
 * mapping).
 *
 * The layered draw (D2) is unchanged: space first, depth cleared, interior
 * over it, so space shows only through the real window openings. It now
 * happens in an offscreen HDR frame so lights brighter than white keep
 * their brightness until the bloom and tone-mapping passes have used it.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gameConfig } from '../config/gameConfig';

export interface RenderLayer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

export class RenderPipeline {
  private readonly composer: EffectComposer;
  private readonly interiorPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly target: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, space: RenderLayer, interior: RenderLayer) {
    const cfg = gameConfig.rendering;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: cfg.msaaSamples,
    });
    this.composer = new EffectComposer(renderer, this.target);

    const spacePass = new RenderPass(space.scene, space.camera);
    this.interiorPass = new RenderPass(interior.scene, interior.camera);
    // Keep the space image; only depth is reset before the interior draws.
    this.interiorPass.clear = false;
    this.interiorPass.clearDepth = true;

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      cfg.bloomStrength,
      cfg.bloomRadius,
      cfg.bloomThreshold,
    );

    this.composer.addPass(spacePass);
    this.composer.addPass(this.interiorPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** `showInterior` is false for the exterior cinematic shot. */
  render(showInterior: boolean): void {
    this.interiorPass.enabled = showInterior;
    this.composer.render();
  }

  dispose(): void {
    this.bloomPass.dispose();
    this.composer.dispose();
    this.target.dispose();
  }
}
