/**
 * Game - wires the systems together and owns the loop.
 *
 * M3 scope: the ship interior, the drone, interaction (helm), the
 * destination menu, and the ShipState journey running underneath.
 * Travel visuals (space scene, cinematic camera) arrive in M4.
 */
import * as THREE from 'three';
import { GameLoop } from './core/loop';
import { EventBus } from './core/events';
import { InputManager } from './core/input';
import { gameConfig } from './config/gameConfig';
import { DroneController } from './player/droneController';
import { DroneVisual } from './player/droneVisual';
import { FollowCamera } from './player/followCamera';
import { shipLayout } from './content/shipLayout';
import { buildShip, type ShipWorld } from './world/ship/shipBuilder';
import { START_LOCATION_ID, getLocation, locations } from './content/destinations';
import { ShipState } from './state/shipState';
import { PlayerMode } from './state/playerMode';
import { InteractionSystem } from './interaction/interactionSystem';
import type { Interactable } from './interaction/interactable';
import { Hud } from './ui/hud';
import { DestinationMenu } from './ui/destinationMenu';

const IDLE_INPUT = { moveX: 0, moveZ: 0, moveY: 0 } as const;

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
  private readonly ship: ShipWorld;

  private readonly shipState: ShipState;
  private readonly playerMode = new PlayerMode();
  private readonly interaction = new InteractionSystem();
  private readonly interactables: Interactable[] = [];
  private readonly hud: Hud;
  private readonly menu = new DestinationMenu();

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

    // Gentle distance haze; makes the long corridor read deep and quiet.
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.03);

    this.ship = buildShip(shipLayout); // throws on invalid layout content
    this.scene.add(this.ship.group);

    this.drone = new DroneController(this.ship.spawn);
    this.droneVisual = new DroneVisual();
    this.scene.add(this.droneVisual.group);

    this.followCamera = new FollowCamera(0, 0.35);
    this.input = new InputManager(() => document.pointerLockElement === this.renderer.domElement);
    this.input.attach(window);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    // --- M3: journey state, HUD, and the helm interactable ---
    this.shipState = new ShipState(START_LOCATION_ID, {
      departDuration: gameConfig.travel.departDuration,
      arriveDuration: gameConfig.travel.arriveDuration,
    });
    this.hud = new Hud();
    this.refreshStatus();

    const helmProp = shipLayout.props.find((p) => p.id === 'helm');
    if (!helmProp) {
      throw new Error('Ship layout has no prop with id "helm"');
    }
    this.interactables.push({
      id: 'helm',
      position: helmProp.center,
      radius: gameConfig.interaction.helmRadius,
      promptText: '[E] Helm — set course',
      onInteract: () => this.openHelm(),
    });

    this.events.on('travel:requested', ({ destinationId }) => {
      const cruise = getLocation(destinationId).travelTime * gameConfig.travel.cruiseScale;
      const change = this.shipState.beginTravel(destinationId, cruise);
      this.events.emit('ship:phaseChanged', change);
      this.events.emit('travel:departed', { destinationId });
      this.refreshStatus();
    });

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
    this.menu.close();
    this.hud.dispose();
    this.ship.dispose();
    this.droneVisual.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Read-only state for dev tooling and tests (see main.ts). */
  get debugSnapshot(): {
    position: { x: number; y: number; z: number };
    cameraYaw: number;
    shipPhase: string;
    locationId: string;
    playerMode: string;
  } {
    const { position } = this.drone.snapshot;
    return {
      position,
      cameraYaw: this.followCamera.yaw,
      shipPhase: this.shipState.phase,
      locationId: this.shipState.locationId,
      playerMode: this.playerMode.mode,
    };
  }

  private update(dt: number): void {
    // Always consume edge presses so stale ones can't fire later.
    const interactPressed = this.input.consumePress('KeyE');

    // The journey continues regardless of what the player is doing (D3).
    for (const change of this.shipState.update(dt)) {
      this.events.emit('ship:phaseChanged', change);
      if (change.to === 'docked' && change.destinationId) {
        this.events.emit('travel:arrived', { destinationId: change.destinationId });
      }
    }
    this.refreshStatus();

    if (this.playerMode.isRoaming) {
      this.followCamera.applyLook(this.input.consumeLookDelta());
      const actions = this.input.sample();
      this.drone.update(dt, actions, this.followCamera.yaw, this.ship.colliders);

      const focusChange = this.interaction.update(this.drone.snapshot.position, this.interactables);
      if (focusChange) {
        this.hud.setPrompt(focusChange.focused?.promptText ?? null);
        if (focusChange.blurred) {
          this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
        }
        if (focusChange.focused) {
          this.events.emit('interact:focused', { interactableId: focusChange.focused.id });
        }
      }
      if (interactPressed) {
        this.interaction.focused?.onInteract();
      }
    } else {
      // Menus/overlays own the keys; the drone settles where it is.
      this.input.consumeLookDelta();
      this.drone.update(dt, IDLE_INPUT, this.followCamera.yaw, this.ship.colliders);
    }
  }

  /** Open the destination menu at the helm (only meaningful while docked). */
  private openHelm(): void {
    if (this.shipState.phase !== 'docked') {
      return; // autopilot already engaged; the ship AI will say so in M5
    }
    this.events.emit('player:modeChanged', this.playerMode.enterHelm());
    const focusChange = this.interaction.clear();
    if (focusChange?.blurred) {
      this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
    }
    this.hud.setPrompt(null);
    document.exitPointerLock();

    const choices = locations.filter((l) => l.id !== this.shipState.locationId);
    this.menu.open(choices, {
      onSelect: (destinationId) => {
        this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
        this.events.emit('travel:requested', { destinationId });
      },
      onCancel: () => {
        this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
      },
    });
  }

  /** Keep the HUD's quiet status line in sync with the journey. */
  private refreshStatus(): void {
    const phase = this.shipState.phase;
    if (phase === 'docked') {
      this.hud.setStatus(`Docked — ${getLocation(this.shipState.locationId).name}`);
    } else {
      const dest = this.shipState.destinationId
        ? getLocation(this.shipState.destinationId).name
        : '';
      const pct = phase === 'cruising' ? ` ${Math.round(this.shipState.progress * 100)}%` : '';
      const label =
        phase === 'departing' ? 'Departing' : phase === 'arriving' ? 'Arriving' : 'Cruising';
      this.hud.setStatus(`${label} — ${dest}${pct}`);
    }
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
      this.ship.colliders,
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
