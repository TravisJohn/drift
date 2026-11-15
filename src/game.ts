/**
 * Game - wires the systems together and owns the loop.
 *
 * M3 scope: the ship interior, the drone, interaction (helm), the
 * destination menu, and the ShipState journey running underneath.
 * M4 scope: the space scene behind the windows (layered render, D2), the
 * TravelDirector's visual read of the journey, and the exterior cinematic
 * camera (V during travel).
 * M5 scope: the lab terminal + pluggable puzzles (D5) and the ship AI's
 * subtitles via the NarrativeDirector.
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
import { SpaceScene } from './world/space/spaceScene';
import { RenderPipeline } from './rendering/renderPipeline';
import { AdaptiveResolution } from './rendering/adaptiveResolution';
import { type InteriorEnvironment, createInteriorEnvironment } from './rendering/environment';
import {
  computeTravelView,
  type TravelShipSnapshot,
  type TravelView,
} from './travel/travelDirector';
import { CinematicCamera } from './travel/cinematicCamera';
import type { CameraPose } from './player/followCamera';
import { PuzzleRegistry } from './learning/puzzleRegistry';
import { PlaceholderPuzzle } from './learning/placeholderPuzzle';
import { PuzzleOverlay } from './ui/puzzleOverlay';
import { NarrativeDirector } from './narrative/narrativeDirector';
import { AudioManager } from './audio/audioManager';
import { connectAudioLibrary } from './audio/audioLibrarySource';
import type { RoomSpec } from './content/shipLayout';
import { AppState } from './state/appState';
import { TitleScreen } from './ui/titleScreen';
import { PauseMenu } from './ui/pauseMenu';

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
  private readonly spaceScene: SpaceScene;
  private readonly spaceCamera: THREE.PerspectiveCamera;
  private readonly pipeline: RenderPipeline;
  private readonly environment: InteriorEnvironment;
  private readonly resolution: AdaptiveResolution;
  private readonly cinematicCamera = new CinematicCamera();
  private cinematicPose: CameraPose | null = null;
  private travelView: TravelView;
  private readonly playerMode = new PlayerMode();
  private readonly interaction = new InteractionSystem();
  private readonly interactables: Interactable[] = [];
  private readonly hud: Hud;
  private readonly menu = new DestinationMenu();
  private readonly puzzles = new PuzzleRegistry();
  private readonly puzzleOverlay = new PuzzleOverlay();
  private readonly narrative = new NarrativeDirector();
  private readonly audio = new AudioManager();
  private readonly cryoRoom: RoomSpec | null;
  private elapsed = 0;
  private cryoGain = 0;

  // --- M7: app flow and the fps probe ---
  private readonly appState = new AppState();
  private readonly titleScreen = new TitleScreen();
  private readonly pauseMenu = new PauseMenu();
  /** True when any modal overlay was open at the end of the last step. */
  private lastOverlayOpen = false;
  private lastFrameAt: number | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 0;

  private readonly onResize = (): void => this.handleResize();
  private readonly onCanvasClick = (): void => {
    // The first gesture also unlocks audio (browser autoplay rules, M6).
    this.audio.unlock();
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
    // No canvas anti-aliasing: the frame is drawn offscreen and smoothed
    // there (FXAA); multisampling the final copy would be paid for nothing.
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.resolution = new AdaptiveResolution({
      ...gameConfig.rendering.adaptive,
      maxScale: Math.min(window.devicePixelRatio, gameConfig.rendering.maxPixelRatio),
    });
    this.renderer.setPixelRatio(this.resolution.scale);
    this.renderer.setClearColor(0x05060a);
    // Layered render (D2): we clear manually - space first, interior on top.
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    // Gentle distance haze; makes the long corridor read deep and quiet.
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.03);

    this.ship = buildShip(shipLayout); // throws on invalid layout content
    this.scene.add(this.ship.group);
    // Something for the metal to reflect (baked once, no image files).
    this.environment = createInteriorEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = gameConfig.rendering.environmentIntensity;

    // --- M4: the universe outside the windows ---
    this.spaceScene = new SpaceScene(locations, shipLayout);
    this.spaceCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.pipeline = new RenderPipeline(
      this.renderer,
      { scene: this.spaceScene.scene, camera: this.spaceCamera },
      { scene: this.scene, camera: this.camera },
    );

    this.drone = new DroneController(this.ship.spawn);
    this.droneVisual = new DroneVisual();
    this.scene.add(this.droneVisual.group, this.droneVisual.groundShadow);

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
    this.travelView = computeTravelView(this.shipSnapshot());
    this.spaceScene.update(0, this.travelView);
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

    // --- M5: the lab terminal, pluggable puzzles and the ship AI ---
    this.puzzles.register(new PlaceholderPuzzle());

    const terminalProp = shipLayout.props.find((p) => p.id === 'terminal-lab');
    if (!terminalProp) {
      throw new Error('Ship layout has no prop with id "terminal-lab"');
    }
    this.interactables.push({
      id: 'terminal-lab',
      position: terminalProp.center,
      radius: gameConfig.interaction.terminalRadius,
      promptText: '[E] Terminal — training',
      onInteract: () => this.openTerminal('terminal-lab'),
    });

    // The ship AI reacts to the journey; the director decides what it says.
    this.events.on('app:started', () => this.narrative.trigger('started'));
    this.events.on('travel:departed', ({ destinationId }) =>
      this.narrative.trigger('departed', { destination: getLocation(destinationId).name }),
    );
    this.events.on('ship:phaseChanged', ({ to }) => {
      if (to === 'cruising') this.narrative.trigger('cruising');
    });
    this.events.on('travel:arrived', ({ destinationId }) =>
      this.narrative.trigger('arrived', { destination: getLocation(destinationId).name }),
    );
    this.events.on('terminal:opened', () => this.narrative.trigger('terminalOpened'));

    // --- M6: the soundscape follows the journey (author-supplied files) ---
    // The file listing arrives async and again whenever files change.
    connectAudioLibrary((library) => this.audio.setLibrary(library));
    this.cryoRoom = shipLayout.rooms.find((r) => r.id === 'cryo') ?? null;
    this.events.on('app:started', () => {
      this.audio.playLoop('amb_ship_hum');
      this.audio.playLoop('music_roaming');
      this.audio.playLoop('sfx_drone_hover');
      this.audio.playLoop('amb_cryo_bay');
      this.audio.setLoopGain('amb_cryo_bay', 0); // swells only inside the bay
    });
    this.events.on('ship:phaseChanged', ({ to }) => {
      if (to === 'departing') {
        this.audio.playOnce('sfx_depart');
        this.audio.playLoop('amb_engine_cruise');
        this.audio.stopLoop('music_roaming');
        this.audio.playLoop('music_cruise');
      } else if (to === 'docked') {
        this.audio.playOnce('sfx_arrive');
        this.audio.stopLoop('amb_engine_cruise');
        this.audio.stopLoop('music_cruise');
        this.audio.playLoop('music_roaming');
      }
    });
    this.events.on('terminal:opened', () => this.audio.playOnce('sfx_terminal'));

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

  /** Boot to the title screen; the loop renders the dim ship behind it. */
  start(): void {
    this.titleScreen.show({ onBegin: () => this.beginSession() });
    this.spaceScene.prepare(this.renderer);
    this.loop.start();
  }

  /** The Begin click: a real user gesture, so it may unlock audio. */
  private beginSession(): void {
    this.audio.unlock();
    this.appState.start();
    this.events.emit('app:started');
    this.onCanvasClick(); // capture the pointer from the same gesture
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.input.detach();
    this.menu.close();
    this.puzzleOverlay.close();
    this.titleScreen.close();
    this.pauseMenu.close();
    this.audio.dispose();
    this.hud.dispose();
    this.ship.dispose();
    this.spaceScene.dispose();
    this.pipeline.dispose();
    this.environment.dispose();
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
    starDrift: number;
    appState: string;
    fps: number;
  } {
    const { position } = this.drone.snapshot;
    return {
      position,
      cameraYaw: this.followCamera.yaw,
      shipPhase: this.shipState.phase,
      locationId: this.shipState.locationId,
      playerMode: this.playerMode.mode,
      starDrift: this.travelView.driftSpeed,
      appState: this.appState.state,
      fps: this.fps,
    };
  }

  private update(dt: number): void {
    // Always consume edge presses so stale ones can't fire later.
    const interactPressed = this.input.consumePress('KeyE');
    const viewPressed = this.input.consumePress('KeyV');
    const escPressed = this.input.consumePress('Escape');
    const overlayWasOpen = this.lastOverlayOpen;
    this.lastOverlayOpen = this.menu.isOpen || this.puzzleOverlay.isOpen || this.pauseMenu.isOpen;

    // Title / pause: time stands still, but the ship keeps breathing and
    // audio fades keep moving so nothing pops when the player returns.
    if (!this.appState.isPlaying) {
      this.elapsed += dt;
      this.ship.update(this.elapsed);
      this.audio.update(dt);
      this.input.consumeLookDelta();
      return;
    }

    // Esc pauses - unless this press just closed an overlay (its own
    // listener handled it between steps) or we are mid-overlay.
    if (escPressed && this.playerMode.isRoaming && !overlayWasOpen) {
      this.openPause();
      return;
    }

    // The journey continues regardless of what the player is doing (D3).
    for (const change of this.shipState.update(dt)) {
      this.events.emit('ship:phaseChanged', change);
      if (change.to === 'docked' && change.destinationId) {
        this.events.emit('travel:arrived', { destinationId: change.destinationId });
      }
    }
    this.refreshStatus();

    // M5: the ship AI's subtitle (null = silence).
    this.hud.setSubtitle(this.narrative.update(dt));

    // M6: breathing glows, light waver, and the soundscape.
    this.elapsed += dt;
    this.ship.update(this.elapsed);
    this.updateAudio(dt);

    // M4: space keeps drifting whatever the player is doing.
    this.travelView = computeTravelView(this.shipSnapshot());
    this.spaceScene.update(dt, this.travelView);

    // The exterior shot ends itself when the journey does.
    if (this.playerMode.mode === 'cinematic' && this.shipState.phase === 'docked') {
      this.exitCinematic();
    }

    if (this.playerMode.mode === 'cinematic') {
      if (viewPressed) {
        this.exitCinematic();
      } else {
        this.cinematicPose = this.cinematicCamera.update(dt);
      }
    } else if (viewPressed && this.playerMode.isRoaming && this.shipState.phase !== 'docked') {
      this.enterCinematic();
    }

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

  /** Freeze the simulation and show the pause menu (Esc, M7). */
  private openPause(): void {
    this.appState.pause();
    this.events.emit('app:paused');
    document.exitPointerLock();
    this.pauseMenu.open({
      onResume: () => {
        this.appState.resume();
        this.events.emit('app:resumed');
      },
    });
  }

  /** Per-step audio gains: hover follows speed, cryo ambience proximity. */
  private updateAudio(dt: number): void {
    const { velocity, position } = this.drone.snapshot;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const factor = Math.min(1, speed / gameConfig.drone.maxSpeed);
    const idle = gameConfig.audio.hoverIdleGain;
    this.audio.setLoopGain('sfx_drone_hover', idle + (1 - idle) * factor);

    if (this.cryoRoom) {
      const inside =
        position.x >= this.cryoRoom.minX &&
        position.x <= this.cryoRoom.maxX &&
        position.z >= this.cryoRoom.minZ &&
        position.z <= this.cryoRoom.maxZ;
      const blend = 1 - Math.exp(-2 * dt);
      this.cryoGain += ((inside ? 1 : 0) - this.cryoGain) * blend;
      this.audio.setLoopGain('amb_cryo_bay', this.cryoGain);
    }

    this.audio.update(dt);
  }

  /** Enter the exterior travel shot (V during travel, M4). */
  private enterCinematic(): void {
    this.events.emit('player:modeChanged', this.playerMode.enterCinematic());
    const focusChange = this.interaction.clear();
    if (focusChange?.blurred) {
      this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
    }
    this.cinematicCamera.reset();
    this.cinematicPose = this.cinematicCamera.update(0);
    this.spaceScene.setExteriorVisible(true);
    this.hud.setPrompt('[V] Return inside');
  }

  private exitCinematic(): void {
    this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
    this.cinematicPose = null;
    this.spaceScene.setExteriorVisible(false);
    this.hud.setPrompt(null);
  }

  /** The slice of ShipState the TravelDirector reads. */
  private shipSnapshot(): TravelShipSnapshot {
    return {
      phase: this.shipState.phase,
      phaseProgress: this.shipState.phaseProgress,
      locationId: this.shipState.locationId,
      destinationId: this.shipState.destinationId,
    };
  }

  /** Open the destination menu at the helm (only meaningful while docked). */
  private openHelm(): void {
    if (this.shipState.phase !== 'docked') {
      // Autopilot already has the helm; the ship AI says so (cooldown-gated).
      this.narrative.trigger('helmLocked');
      return;
    }
    this.events.emit('player:modeChanged', this.playerMode.enterHelm());
    const focusChange = this.interaction.clear();
    if (focusChange?.blurred) {
      this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
    }
    this.hud.setPrompt(null);
    document.exitPointerLock();

    this.audio.playOnce('sfx_ui_blip');
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

  /** Open the training terminal overlay (M5, D5). */
  private openTerminal(terminalId: string): void {
    this.events.emit('player:modeChanged', this.playerMode.enterTerminal());
    const focusChange = this.interaction.clear();
    if (focusChange?.blurred) {
      this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
    }
    this.hud.setPrompt(null);
    document.exitPointerLock();
    this.events.emit('terminal:opened', { terminalId });

    this.puzzleOverlay.open(this.puzzles.get('placeholder'), {
      onComplete: () => this.narrative.trigger('terminalComplete'),
      onClose: () => {
        this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
        this.events.emit('terminal:closed', { terminalId });
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
    // Rolling fps over ~30 frames, for the PRD performance check (M7).
    const now = performance.now();
    if (this.lastFrameAt !== null) {
      // Slow frames lower the drawn resolution; headroom raises it again.
      if (this.resolution.sample(now - this.lastFrameAt) !== null) {
        this.renderer.setPixelRatio(this.resolution.scale);
        this.handleResize();
      }
      this.fpsAccum += now - this.lastFrameAt;
      if (++this.fpsFrames >= 30) {
        this.fps = this.fpsAccum > 0 ? (1000 * this.fpsFrames) / this.fpsAccum : 0;
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }
    }
    this.lastFrameAt = now;

    const snapshot = this.drone.snapshot;
    this.droneVisual.apply(snapshot, alpha);

    // Cinematic: only the space scene, from the orbiting exterior camera.
    if (this.cinematicPose !== null) {
      const { position, lookAt } = this.cinematicPose;
      this.spaceCamera.position.set(position.x, position.y, position.z);
      this.spaceCamera.lookAt(lookAt.x, lookAt.y, lookAt.z);
      this.pipeline.render(false);
      return;
    }

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

    // Layered render (D2): space from the origin with the interior camera's
    // rotation, then depth cleared and the interior drawn on top - so space
    // is only visible through the real window openings.
    this.spaceCamera.position.set(0, 0, 0);
    this.spaceCamera.quaternion.copy(this.camera.quaternion);
    this.pipeline.render(true);
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.spaceCamera.aspect = width / height;
    this.spaceCamera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    const pixelRatio = this.renderer.getPixelRatio();
    this.pipeline.setSize(width, height, pixelRatio);
    this.spaceScene.setViewport(height * pixelRatio, this.spaceCamera.fov);
  }

  /** Show the controls hint only while the pointer is not locked. */
  private updateHint(): void {
    const hint = document.getElementById('hint');
    if (!hint) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    hint.style.opacity = locked ? '0' : '1';
  }
}
