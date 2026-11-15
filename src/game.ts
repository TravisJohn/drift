/**
 * Game - wires the systems together and owns the loop.
 *
 * M1 scope: a grey-box room, the hover drone with collision, the orbit
 * follow camera, keyboard+mouse input with pointer lock. The real ship
 * layout arrives in M2; interior/space layering (D2) arrives in M4.
 */
import * as THREE from 'three';
import { GameLoop } from './core/loop';
import { EventBus } from './core/events';
import { InputManager } from './core/input';
import { gameConfig } from './config/gameConfig';
import { DroneController } from './player/droneController';
import { DroneVisual, DRONE_SPAWN } from './player/droneVisual';
import { FollowCamera } from './player/followCamera';
import { buildGreyRoom, type GreyRoom } from './world/greyRoom';

export class Game {
  readonly events = new EventBus();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: GameLoop;

  private readonly input: InputManager;
  private readonly drone: DroneController;
  private readonly droneVisual: DroneVisual;
  private readonly followCamera: FollowCamera;
  private readonly room: GreyRoom;

  private readonly onResize = (): void => this.handleResize();
  private readonly onCanvasClick = (): void => {
    // Pointer lock enables mouse look; the browser exits it on Esc.
    if (document.pointerLockElement !== this.renderer.domElement) {
      // Can reject (e.g. right after Esc); a failed lock just leaves the
      // hint visible, so a warn is enough.
      Promise.resolve(this.renderer.domElement.requestPointerLock()).catch((error: unknown) => {
        console.warn('Drift: pointer lock request failed', error);
      });
    }
  };
  private readonly onPointerLockChange = (): void => this.updateHint();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05060a);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    this.room = buildGreyRoom();
    this.scene.add(this.room.group);

    this.drone = new DroneController(DRONE_SPAWN);
    this.droneVisual = new DroneVisual();
    this.scene.add(this.droneVisual.group);

    this.followCamera = new FollowCamera(0, 0.35);
    this.input = new InputManager(() => document.pointerLockElement === this.renderer.domElement);
    this.input.attach(window);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    this.loop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: (alpha) => this.render(alpha),
      },
      {
        updateHz: gameConfig.simulation.updateHz,
        maxCatchUpSteps: gameConfig.simulation.maxCatchUpSteps,
      },
    );

    window.addEventListener('resize', this.onResize);
    this.handleResize();
    this.updateHint();
  }

  start(): void {
    this.events.emit('app:started');
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.input.detach();
    this.room.dispose();
    this.droneVisual.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Read-only state for dev tooling and tests (see main.ts). */
  get debugSnapshot(): { position: { x: number; y: number; z: number }; cameraYaw: number } {
    const { position } = this.drone.snapshot;
    return { position, cameraYaw: this.followCamera.yaw };
  }

  private update(dt: number): void {
    this.followCamera.applyLook(this.input.consumeLookDelta());
    const actions = this.input.sample();
    this.drone.update(dt, actions, this.followCamera.yaw, this.room.colliders);
  }

  private render(alpha: number): void {
    const snapshot = this.drone.snapshot;
    this.droneVisual.apply(snapshot, alpha);

    // Camera tracks the interpolated visual position for judder-free follow.
    const pose = this.followCamera.update(
      1 / gameConfig.simulation.updateHz,
      {
        x: this.droneVisual.group.position.x,
        y: this.droneVisual.group.position.y,
        z: this.droneVisual.group.position.z,
      },
      this.room.colliders,
    );
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);

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

  /** Show the controls hint only while the pointer is not locked. */
  private updateHint(): void {
    const hint = document.getElementById('hint');
    if (!hint) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    hint.style.opacity = locked ? '0' : '1';
  }
}
