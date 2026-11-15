/**
 * Game - wires the systems together and owns the loop.
 *
 * M0 scope: a Three.js renderer, a placeholder scene (slowly tumbling
 * wireframe cube in the dark - a stand-in for the ship until M1/M2), the
 * fixed-timestep loop, and the event bus. Later milestones replace the
 * placeholder scene with the real interior/space layering (D2).
 */
import * as THREE from 'three';
import { GameLoop } from './core/loop';
import { EventBus } from './core/events';
import { gameConfig } from './config/gameConfig';

export class Game {
  readonly events = new EventBus();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: GameLoop;
  private readonly placeholder: THREE.LineSegments;
  private readonly onResize = (): void => this.handleResize();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05060a);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    // Placeholder content so M0 visibly renders and the loop can be judged.
    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    this.placeholder = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x8899aa }),
    );
    this.scene.add(this.placeholder);

    this.loop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: () => this.render(),
      },
      {
        updateHz: gameConfig.simulation.updateHz,
        maxCatchUpSteps: gameConfig.simulation.maxCatchUpSteps,
      },
    );

    window.addEventListener('resize', this.onResize);
    this.handleResize();
  }

  start(): void {
    this.events.emit('app:started');
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.placeholder.geometry.dispose();
    (this.placeholder.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private update(dt: number): void {
    this.placeholder.rotation.x += 0.15 * dt;
    this.placeholder.rotation.y += 0.25 * dt;
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
