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
import { fitRenderScale, isIntegratedGpu, shortGpuName } from './rendering/renderScale';
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
import { IntercomEffect } from './audio/intercomEffect';
import { ShipHum } from './audio/shipHum';
import { chooseView } from './rendering/viewMode';
import { connectAudioLibrary } from './audio/audioLibrarySource';
import { connectArt } from './art/surfaceArt';
import type { RoomSpec } from './content/shipLayout';
import { AppState } from './state/appState';
import { TitleScreen } from './ui/titleScreen';
import { PauseMenu } from './ui/pauseMenu';
import { DashboardOverlay } from './ui/dashboardOverlay';
import { type DashboardData, buildDashboardData } from './ui/dashboardModel';
import { type HologramPlacement, ShipHologram } from './world/ship/shipHologram';
import { dashboardPose } from './travel/dashboardCamera';
import { vec3 } from './physics/vec3';

const IDLE_INPUT = { moveX: 0, moveZ: 0, moveY: 0 } as const;
/** Wait for a window drag to stop before re-measuring. */
const RESIZE_SETTLE_MS = 500;

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
  private readonly gpuName: string;
  private showPerf = false;
  /** True once the player has dragged the view: they know how, hide the hint. */
  private hasLooked = false;
  private resizeTimer: number | undefined;
  private readonly cinematicCamera = new CinematicCamera();
  private cinematicPose: CameraPose | null = null;
  /** True while the follow camera is out in space, beyond the hull. */
  private droneOutside = false;
  private travelView: TravelView;
  private readonly playerMode = new PlayerMode();
  private readonly interaction = new InteractionSystem();
  private readonly interactables: Interactable[] = [];
  private readonly hud: Hud;
  private readonly menu = new DestinationMenu();
  private readonly puzzles = new PuzzleRegistry();
  private readonly puzzleOverlay = new PuzzleOverlay();
  private readonly narrative = new NarrativeDirector();
  private readonly intercom = new IntercomEffect();
  /** The ship's own synthesized hum: electrical, air, engine rumble. */
  private readonly hum = new ShipHum();
  // Music is piped through the intercom; every other sound stays direct.
  private readonly audio = new AudioManager(
    undefined,
    undefined,
    undefined,
    (element, category) => {
      if (category === 'music' && element instanceof HTMLMediaElement)
        this.intercom.connect(element);
    },
  );
  private readonly cryoRoom: RoomSpec | null;
  /** Bow and stern of the deck plan, for where the drone is along the ship. */
  private readonly shipBowZ = Math.min(...shipLayout.rooms.map((r) => r.minZ));
  private readonly shipSternZ = Math.max(...shipLayout.rooms.map((r) => r.maxZ));
  private elapsed = 0;
  private cryoGain = 0;

  // --- M7: app flow and the fps probe ---
  private readonly appState = new AppState();
  private readonly titleScreen = new TitleScreen();
  private readonly pauseMenu = new PauseMenu();

  // --- Ship dashboard: bridge holo-table, forward view, ship hologram ---
  private readonly dashboard = new DashboardOverlay();
  private readonly hologram = new ShipHologram(shipLayout);
  private readonly bridgeRoom: RoomSpec;
  private readonly hologramAtTable: HologramPlacement;
  private readonly hologramInView: HologramPlacement;
  private dashboardView: CameraPose | null = null;
  private dashboardRefresh = 0;
  /** True when any modal overlay was open at the end of the last step. */
  private lastOverlayOpen = false;
  private lastFrameAt: number | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 0;

  private readonly onResize = (): void => {
    this.handleResize();
    // A different window size (or screen) means a different pixel count:
    // re-measure once the dragging stops.
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.calibrateResolution(), RESIZE_SETTLE_MS);
  };
  private readonly onCanvasClick = (): void => {
    // The first gesture also unlocks audio (browser autoplay rules, M6).
    this.audio.unlock();
    this.intercom.resume();
    this.hum.resume();
  };
  /** A hand on the view while it is being dragged round. */
  private readonly onLookChange = (looking: boolean): void => {
    this.renderer.domElement.style.cursor = looking ? 'grabbing' : '';
  };

  constructor(private readonly container: HTMLElement) {
    // No canvas anti-aliasing: the frame is drawn offscreen and smoothed
    // there (FXAA); multisampling the final copy would be paid for nothing.
    // On a laptop with two graphics chips, ask for the fast one. It is only
    // a request: the browser and Windows have the final say.
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.gpuName = this.readGpuName();
    this.resolution = new AdaptiveResolution({
      ...gameConfig.rendering.adaptive,
      maxScale: gameConfig.rendering.maxPixelRatio,
    });
    this.renderer.setPixelRatio(this.resolution.calibrate(this.sharpestPixelRatio()));
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
    // Author-supplied wall/floor/ceiling art, if any, replaces the generated look.
    void connectArt(
      (surface, art) => this.ship.applySurfaceArt(surface, art),
      gameConfig.art.derivedNormalStrength,
    );
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
    this.input = new InputManager({ onLookChange: this.onLookChange });
    // Looking starts with a right-button press on the view itself.
    this.input.attach(window, this.renderer.domElement);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);

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

    // --- The ship dashboard: a holo-table on the bridge ---
    const bridge = shipLayout.rooms.find((r) => r.id === 'bridge');
    const tableProp = shipLayout.props.find((p) => p.id === 'dashboard');
    if (!bridge || !tableProp) {
      throw new Error('Ship layout needs a "bridge" room and a prop with id "dashboard"');
    }
    this.bridgeRoom = bridge;
    const holo = gameConfig.dashboard;
    this.hologramAtTable = {
      position: vec3(
        tableProp.center.x,
        tableProp.center.y + tableProp.size.y / 2 + holo.tableHologram.lift,
        tableProp.center.z,
      ),
      scale: holo.tableHologram.scale,
      tilt: holo.tableHologram.tilt,
    };
    this.hologramInView = {
      position: vec3(
        (bridge.minX + bridge.maxX) / 2,
        holo.viewHologram.height,
        bridge.minZ + (bridge.maxZ - bridge.minZ) * holo.viewHologram.forward,
      ),
      scale: holo.viewHologram.scale,
      tilt: holo.viewHologram.tilt,
    };
    this.hologram.setPlacement(this.hologramAtTable);
    this.scene.add(this.hologram.group);
    this.interactables.push({
      id: 'dashboard',
      position: tableProp.center,
      radius: gameConfig.interaction.dashboardRadius,
      promptText: '[E] Dashboard — ship overview',
      onInteract: () => this.openDashboard(),
    });
    this.events.on('dashboard:opened', () => this.narrative.trigger('dashboardOpened'));
    this.events.on('player:modeChanged', () => this.updateHint());

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
    this.calibrateResolution();
    this.loop.start();
  }

  /** The Begin click: a real user gesture, so it may unlock audio. */
  private beginSession(): void {
    this.audio.unlock();
    this.intercom.resume();
    this.hum.resume();
    this.appState.start();
    this.events.emit('app:started');
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    window.clearTimeout(this.resizeTimer);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.input.detach();
    this.menu.close();
    this.puzzleOverlay.close();
    this.titleScreen.close();
    this.pauseMenu.close();
    this.dashboard.close();
    this.hologram.dispose();
    this.audio.dispose();
    this.intercom.dispose();
    this.hum.dispose();
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
    if (this.input.consumePress('F2')) {
      this.showPerf = !this.showPerf;
      this.refreshPerf();
    }
    const overlayWasOpen = this.lastOverlayOpen;
    this.lastOverlayOpen =
      this.menu.isOpen ||
      this.puzzleOverlay.isOpen ||
      this.pauseMenu.isOpen ||
      this.dashboard.isOpen;

    // Title / pause: time stands still, but the ship keeps breathing and
    // audio fades keep moving so nothing pops when the player returns.
    if (!this.appState.isPlaying) {
      this.elapsed += dt;
      this.ship.update(this.elapsed);
      this.hologram.update(this.elapsed);
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
    this.hologram.update(this.elapsed);
    this.hologram.setMarker(this.drone.snapshot.position);
    this.updateAudio(dt);

    // M4: space keeps drifting whatever the player is doing.
    this.travelView = computeTravelView(this.shipSnapshot());
    this.spaceScene.update(dt, this.travelView);

    if (this.playerMode.mode === 'atDashboard') {
      this.dashboardView = dashboardPose(this.bridgeRoom, this.elapsed);
      this.dashboardRefresh += dt;
      if (this.dashboardRefresh >= gameConfig.dashboard.refreshSeconds) {
        this.dashboardRefresh = 0;
        this.dashboard.update(this.dashboardData());
      }
    }

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
      const look = this.input.consumeLookDelta();
      this.followCamera.applyLook(look);
      if (!this.hasLooked && (look.dx !== 0 || look.dy !== 0)) {
        this.hasLooked = true;
        this.updateHint();
      }
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

    // The engine spools with the journey: louder and higher as speed builds.
    const cfg = gameConfig.audio;
    const way = this.travelView.driftSpeed;
    this.audio.setLoopGain(
      'amb_engine_cruise',
      cfg.engineIdleGain + (1 - cfg.engineIdleGain) * way,
    );
    this.audio.setLoopRate(
      'amb_engine_cruise',
      cfg.engineIdleRate + (1 - cfg.engineIdleRate) * way,
    );
    this.intercom.setLevel(this.audio.categoryLevel('music'));
    // The hum grows toward the engine room (0 at the bow, 1 at the stern).
    const nearEngine = (position.z - this.shipBowZ) / (this.shipSternZ - this.shipBowZ);
    this.hum.update({ engine: way, nearEngine, outside: this.droneOutside });

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
    this.updateExteriorVisibility();
    this.hud.setPrompt('[V] Return inside');
  }

  private exitCinematic(): void {
    this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
    this.cinematicPose = null;
    this.updateExteriorVisibility();
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
    this.releaseControls();

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

  /** Hand the screen to an overlay: drop focus and prompt. */
  private releaseControls(): void {
    const focusChange = this.interaction.clear();
    if (focusChange?.blurred) {
      this.events.emit('interact:blurred', { interactableId: focusChange.blurred.id });
    }
    this.hud.setPrompt(null);
  }

  /** What the dashboard shows right now, from live game state. */
  private dashboardData(): DashboardData {
    const destinationId = this.shipState.destinationId;
    return buildDashboardData({
      rooms: shipLayout.rooms,
      podCount: shipLayout.props.filter((p) => p.kind === 'pod').length,
      phase: this.shipState.phase,
      progress: this.shipState.progress,
      locationName: getLocation(this.shipState.locationId).name,
      destinationName: destinationId ? getLocation(destinationId).name : null,
      // Every registered module appears here: the AWS training entry point.
      training: this.puzzles.ids().map((id) => ({ id, title: this.puzzles.get(id).title })),
    });
  }

  /** Open the ship dashboard at the bridge holo-table. */
  private openDashboard(): void {
    this.events.emit('player:modeChanged', this.playerMode.enterDashboard());
    this.releaseControls();
    this.audio.playOnce('sfx_ui_blip');
    this.dashboardView = dashboardPose(this.bridgeRoom, this.elapsed);
    this.dashboardRefresh = 0;
    this.hologram.setPlacement(this.hologramInView);
    this.events.emit('dashboard:opened');

    this.dashboard.open(this.dashboardData(), {
      onRoomSelected: (roomId) => this.hologram.setHighlight(roomId),
      onTraining: (moduleId) => {
        this.closeDashboard();
        this.openTerminal('dashboard', moduleId);
      },
      onClose: () => this.closeDashboard(),
    });
  }

  /** Return from the dashboard view to the drone. */
  private closeDashboard(): void {
    this.events.emit('player:modeChanged', this.playerMode.exitToRoaming());
    this.dashboardView = null;
    this.hologram.setHighlight(null);
    this.hologram.setPlacement(this.hologramAtTable);
    this.events.emit('dashboard:closed');
  }

  /** Open the training overlay on one module (M5, D5). */
  private openTerminal(terminalId: string, moduleId = 'placeholder'): void {
    this.events.emit('player:modeChanged', this.playerMode.enterTerminal());
    this.releaseControls();
    this.events.emit('terminal:opened', { terminalId });

    this.puzzleOverlay.open(this.puzzles.get(moduleId), {
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
        this.refreshPerf();
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }
    }
    this.lastFrameAt = now;

    const snapshot = this.drone.snapshot;
    this.droneVisual.apply(snapshot, alpha, now / 1000);

    // Cinematic: only the space scene, from the orbiting exterior camera.
    if (this.cinematicPose !== null) {
      const { position, lookAt } = this.cinematicPose;
      this.spaceCamera.position.set(position.x, position.y, position.z);
      this.spaceCamera.lookAt(lookAt.x, lookAt.y, lookAt.z);
      this.pipeline.render(false);
      return;
    }

    if (this.dashboardView !== null) {
      // Dashboard: a fixed view from the bridge, looking ahead.
      const { position, lookAt } = this.dashboardView;
      this.camera.position.set(position.x, position.y, position.z);
      this.camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
    } else {
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
    }

    const view = chooseView({
      cinematic: false,
      dashboard: this.dashboardView !== null,
      cameraInsideHull: this.spaceScene.hullContains(this.camera.position),
    });
    this.setDroneOutside(view === 'exterior');
    if (view === 'exterior') {
      // Out in space: the ship from outside, the same hull the V shot shows,
      // with the drone beside it. Nothing of the interior is drawn.
      this.spaceCamera.position.copy(this.camera.position);
      this.spaceCamera.quaternion.copy(this.camera.quaternion);
      this.pipeline.render(false);
      return;
    }

    // Layered render (D2): space from the origin with the interior camera's
    // rotation, then depth cleared and the interior drawn on top - so space
    // is only visible through the real window openings.
    this.spaceCamera.position.set(0, 0, 0);
    this.spaceCamera.quaternion.copy(this.camera.quaternion);
    this.pipeline.render(true);
  }

  /**
   * Move the drone between the interior and the space scene as its camera
   * leaves or re-enters the ship. Outside, it is drawn and lit with the
   * hull (its headlight falls on the plating); its deck shadow is hidden,
   * as there is no deck under it.
   */
  private setDroneOutside(outside: boolean): void {
    if (outside === this.droneOutside) return;
    this.droneOutside = outside;
    (outside ? this.spaceScene.scene : this.scene).add(this.droneVisual.group);
    this.droneVisual.groundShadow.visible = !outside;
    this.updateExteriorVisibility();
  }

  /** The hull is drawn whenever the ship is seen from outside. */
  private updateExteriorVisibility(): void {
    this.spaceScene.setExteriorVisible(this.cinematicPose !== null || this.droneOutside);
  }

  /** The sharpest pixel ratio this screen can show, within the game's cap. */
  private sharpestPixelRatio(): number {
    return Math.min(window.devicePixelRatio, gameConfig.rendering.maxPixelRatio);
  }

  /** The graphics chip the browser gave us, as a readable name. */
  private readGpuName(): string {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const raw: unknown = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    return shortGpuName(typeof raw === 'string' ? raw : '');
  }

  private applyPixelRatio(scale: number): void {
    this.renderer.setPixelRatio(scale);
    this.handleResize();
  }

  /**
   * Choose the drawing resolution by measurement: time a frame at the
   * sharpest and at the softest setting, and take the sharpest one that
   * fits the frame budget. Run at startup and after a resize, so a weak
   * graphics chip is on the right setting before play begins.
   */
  private calibrateResolution(): void {
    const cfg = gameConfig.rendering.adaptive;
    const sharpest = this.sharpestPixelRatio();
    if (sharpest <= cfg.minScale) {
      this.applyPixelRatio(this.resolution.calibrate(sharpest));
      return;
    }
    this.render(0); // place the camera, so the timed frames show the real view
    const time = (scale: number): { scale: number; frameMs: number } => {
      this.applyPixelRatio(scale);
      return { scale, frameMs: this.pipeline.measureFrameMs(cfg.calibrationFrames) };
    };
    const high = time(sharpest);
    const low = time(cfg.minScale);
    const chosen = this.resolution.calibrate(
      fitRenderScale(low, high, cfg.budgetMs, cfg.minScale, sharpest),
    );
    this.applyPixelRatio(chosen);
    // The clock must not count the measuring itself as one slow frame.
    this.lastFrameAt = null;
    console.info(
      `Drift graphics: ${this.gpuName}; a full-sharpness frame takes ${high.frameMs.toFixed(1)} ms; ` +
        `drawing at ${chosen.toFixed(2)}x` +
        (isIntegratedGpu(this.gpuName) && chosen < sharpest
          ? ' (integrated graphics: if this machine also has a dedicated graphics chip, ' +
            'set the browser to use it in Windows Graphics settings)'
          : ''),
    );
    this.refreshPerf();
  }

  /** Update the F2 readout: frame rate, drawing resolution, graphics chip. */
  private refreshPerf(): void {
    if (!this.showPerf) {
      this.hud.setPerf(null);
      return;
    }
    const canvas = this.renderer.domElement;
    this.hud.setPerf(
      // No rate until the first half second of frames has been counted.
      `${this.fps > 0 ? `${Math.round(this.fps)} fps` : 'measuring'}\n` +
        `${canvas.width}x${canvas.height} (${this.resolution.scale.toFixed(2)}x)\n` +
        this.gpuName,
    );
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

  /** Show the controls hint until the player has looked around once. */
  private updateHint(): void {
    const hint = document.getElementById('hint');
    if (!hint) return;
    // The hint is about flying; it only belongs on screen while roaming.
    hint.style.opacity = this.hasLooked || !this.playerMode.isRoaming ? '0' : '1';
  }
}
