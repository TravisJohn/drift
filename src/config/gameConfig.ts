/**
 * Central tuning values for Drift.
 *
 * Everything that affects feel (speeds, durations, camera behavior) belongs
 * here, not hardcoded inside systems, so the vibe can be tuned in one place.
 */
export const gameConfig = {
  /** Fixed simulation rate (D8): logic always steps at this frequency. */
  simulation: {
    updateHz: 60,
    /**
     * Max logic steps one frame may run to catch up after a stall (e.g. a
     * backgrounded tab). Beyond this, time is dropped instead of spiraling.
     */
    maxCatchUpSteps: 5,
  },

  /** Drone movement feel. All speeds m/s, rates per second. */
  drone: {
    radius: 0.35,
    maxSpeed: 3.2,
    /** How quickly velocity approaches the target (exponential rate). */
    acceleration: 7,
    /** How quickly velocity bleeds off with no input. */
    damping: 5,
    maxVerticalSpeed: 2.2,
    verticalAcceleration: 6,
    /** Idle hover bob. */
    bobFrequency: 1.6,
    bobAmplitude: 0.04,
    /** How quickly the drone turns to face its direction of travel. */
    faceTurnRate: 8,
    /** Visual lean into motion (radians at full speed) and its smoothing. */
    leanPitchMax: 0.22,
    leanRollMax: 0.18,
    leanSmoothing: 6,
    /**
     * How far the drone may stray from the ship once outside, in metres
     * from the hull (physics/tether.ts): the red warning starts at
     * warnDistance, a soft pull back at pullDistance, a hard stop at
     * maxDistance.
     */
    tether: {
      warnDistance: 5,
      pullDistance: 8,
      maxDistance: 12,
      pullStrength: 3,
      /** Strain at which the ship AI tells the drone to come back. */
      speakAtStrain: 0.5,
    },
  },

  /**
   * How the drone looks and moves its parts (player/droneModel.ts,
   * droneAnimation.ts). Looks only: none of this changes collision, and
   * every part stays inside `drone.radius`.
   */
  droneLook: {
    /** Painted upper shell, gunmetal belly and fittings, service stripe. */
    hullColor: 0xd9d3c5,
    metalColor: 0x353b44,
    accentColor: 0xf0a23a,
    /** The single eye in the visor; above 1 it blooms. */
    eyeColor: 0x4be3ff,
    eyeIntensity: 2.4,
    /** Glow inside the four ducted thrusters and the ring under the belly. */
    exhaustColor: 0x48c6ff,
    exhaustIdle: 1.0,
    exhaustMax: 2.6,
    /** Radians a thruster tilts per m/s of travel, and its limit. */
    thrusterTiltPerSpeed: 0.11,
    thrusterTiltMax: 0.38,
    /** The antenna's slow beacon: one short flash per period. */
    beaconColor: 0xff4636,
    beaconPeriod: 2.8,
    beaconFlash: 0.16,
    beaconPeak: 3.2,
    beaconRest: 0.12,
    blink: {
      /** One blink falls somewhere inside each window of this length. */
      cycleSeconds: 4.6,
      /** Seconds from open to shut to open again. */
      durationSeconds: 0.17,
      /** Share of blinks that come as a quick double. */
      doubleChance: 0.22,
      seed: 7,
    },
    /** Colour the eye and glows shift to as the drone nears its tether limit. */
    warningColor: 0xff2414,
    /** Radius (m) of the red halo around the drone at full warning. */
    warningHaloRadius: 0.55,
    /** Brightness of that halo at full warning (bloom spreads it further). */
    warningHaloStrength: 0.85,
    /** Metres the eye slides across the visor when banking into a turn. */
    glanceDistance: 0.016,
    /** Metres of slow idle wander in the eye while the drone is still. */
    idleGazeDistance: 0.008,
  },

  /** Autopilot travel timings (seconds). */
  travel: {
    departDuration: 5,
    arriveDuration: 5,
    /**
     * Multiplier on each destination's cruise time. 1 = PRD pacing;
     * debug runs can shrink it to iterate quickly.
     */
    cruiseScale: 1,
  },

  /** Interaction defaults. */
  interaction: {
    helmRadius: 2.2,
    terminalRadius: 2.0,
    dashboardRadius: 1.9,
  },

  /** Ship dashboard: the bridge holo-table and its forward view. */
  dashboard: {
    /** Camera height while the dashboard is open. */
    eyeHeight: 1.9,
    /**
     * How far back from the viewport the camera stands (share of bridge
     * depth). Close enough that the viewport spans the whole screen.
     */
    standBack: 0.3,
    /** Downward tilt of the view, radians: centres the viewport in frame. */
    pitchDown: 0.07,
    /** Metres of slow camera sway. */
    sway: 0.04,
    /** Seconds between refreshes of the live readouts. */
    refreshSeconds: 0.25,
    /** The hologram at rest: metres above the table top, and its size. */
    tableHologram: { lift: 0.5, scale: 0.03, tilt: 0 },
    /**
     * The hologram while the dashboard is open: height, distance from the
     * viewport (share of bridge depth), size, and lean toward the viewer.
     */
    viewHologram: { height: 1.5, forward: 0.115, scale: 0.022, tilt: 0.9 },
  },

  /** Audio behavior (M6). Files themselves are author-supplied (PRD). */
  audio: {
    /** Seconds for a loop to fade fully in or out. */
    fadeSeconds: 2.5,
    /** Hover loop keeps this floor of its volume while idle. */
    hoverIdleGain: 0.3,
    /**
     * The engine loop follows the ship's speed: at a standstill it plays at
     * this share of its volume and this share of its pitch, rising to full
     * at cruise.
     */
    engineIdleGain: 0.35,
    engineIdleRate: 0.78,
    /**
     * Music is played "over the intercom": band-limited like a small
     * speaker, slightly overdriven, with faint static. Other sounds are
     * left full-range so the ship itself feels close.
     */
    /**
     * The ship's own hum, synthesized live (audio/shipHum.ts): electrical
     * hum, ventilation air and engine rumble. Plays alongside any files in
     * public/audio/amb_ship_hum; set `enabled: false` to rely on files only.
     */
    shipHum: {
      enabled: true,
      level: 0.55,
      baseHz: 55,
      electricalLevel: 0.22,
      airLevel: 0.5,
      rumbleIdle: 0.25,
      rumbleCruise: 0.85,
      engineRoomBoost: 0.8,
      /** Outside the ship, in vacuum: only a faint thrum gets through. */
      outsideLevel: 0.2,
    },
    intercom: {
      enabled: true,
      /** Nothing below / above these frequencies gets through. */
      highpassHz: 280,
      lowpassHz: 3400,
      /** The nasal "speaker" peak: where, and how many decibels. */
      presenceHz: 1500,
      presenceDb: 4,
      /** Overdrive: 1 is nearly clean, 3 is a blown speaker. */
      drive: 1.5,
      /** Volume of the static bed while music plays. */
      staticLevel: 0.012,
      /** Share of the untouched music mixed back in, 0..1. */
      dryMix: 0.12,
      outputGain: 1,
    },
  },

  /** Ship AI subtitles (M5). */
  narrative: {
    /** Seconds a trigger stays muted after it last spoke (anti-nag). */
    cooldownSeconds: 8,
    /** Beat of silence between queued lines. */
    gapSeconds: 0.7,
    /** Subtitle screen time: at least this ... */
    minDuration: 2.8,
    /** ... plus this per character of the line. */
    perCharSeconds: 0.055,
  },

  /** Space scene (M4). The ship never moves; space moves around it (D2). */
  space: {
    /** Near stars that slide past during travel (the sense of motion). */
    starCount: 900,
    /** World-space glow diameter of the smallest and largest near star. */
    starMinSize: 0.2,
    starMaxSize: 1.0,
    /** Stars live in a cube of this half-size, centered on the ship. */
    starExtent: 240,
    /** No stars spawn within this radius of the ship (they'd sit indoors). */
    starClearRadius: 24,
    /** Star drift in m/s at full cruise. */
    cruiseStarSpeed: 55,
    /** Deterministic star placement (same sky every run). */
    starSeed: 20261115,
    /** Distance of a docked location's body from the ship. */
    bodyDistance: 170,
    /** The distant sky: stars too far away to ever move, plus the nebula. */
    sky: {
      radius: 900,
      starCount: 4200,
      /** World-space glow diameters at `radius` (a few pixels on screen). */
      starMinSize: 3.5,
      starMaxSize: 24,
      /** Share of stars gathered into the galactic band, 0..1. */
      bandShare: 0.45,
      /** Thickness of the band (standard deviation, radians of latitude). */
      bandSpread: 0.16,
      /** Overall brightness of the nebula clouds. */
      nebulaIntensity: 0.7,
      /** Pixels per side of each face of the baked nebula texture. */
      nebulaBakeSize: 512,
      seed: 77031,
    },
  },

  /**
   * Author-supplied art (public/art/, see ART_PROMPTS.md). Each value is
   * per surface: wall, floor, ceiling.
   */
  art: {
    /**
     * World metres one repeat of the picture covers. The wall default is
     * the ceiling height, so a wall picture runs floor to ceiling once.
     */
    tileSize: { wall: 3.2, floor: 2, ceiling: 2.4 },
    /** How bright a supplied glow map shines; above 1 blooms. */
    emissiveLevel: 1.6,
    /** Relief strength when the normal map is derived from the picture. */
    derivedNormalStrength: 2.5,
  },

  /** The built look of the ship's interior: frames and coloured light. */
  interior: {
    /**
     * Metres between structural frames (a rib up each wall and a beam
     * across the ceiling). The nearest spacing that divides a room evenly
     * is used. Smaller = more ribs.
     */
    frameSpacing: 2,
    /** Brightness of the light strip in each rib; above 1 blooms. */
    ribLightLevel: 1.5,
    /** Brightness of the line of light along the foot of the walls. */
    guideLightLevel: 0.6,
    /** Strength and reach (metres) of the glow a rib throws on the wall. */
    ribGlowIntensity: 2,
    ribGlowReach: 2.6,
  },

  /** Final image treatment: tone mapping and the glow around bright things. */
  rendering: {
    /**
     * Cap on device pixels drawn per CSS pixel. High-density screens
     * multiply the lighting cost by up to 4x for little visible gain.
     */
    maxPixelRatio: 1.25,
    /** Overall brightness after tone mapping. */
    exposure: 1.0,
    /** Glow strength, spread and the brightness above which things glow. */
    bloomStrength: 0.55,
    bloomRadius: 0.6,
    bloomThreshold: 0.9,
    /**
     * Multisample anti-aliasing of the offscreen frame. Off by default:
     * on integrated graphics 4 samples cost as much as the whole rest of
     * the frame (measured ~10 ms). `fxaa` smooths edges for about 1 ms.
     */
    msaaSamples: 0,
    fxaa: true,
    /**
     * Room lighting is worked out once at startup, per vertex. Surfaces are
     * split into cells this many metres across; smaller = softer, more
     * accurate shadow edges, longer startup.
     */
    lightCellSize: 0.25,
    /**
     * Automatic resolution: the picture is drawn with fewer pixels when
     * frames run slow, and sharpened again when there is headroom.
     */
    adaptive: {
      targetFps: 60,
      minScale: 0.5,
      windowFrames: 45,
      /** Seconds of steady running before it tries a sharper setting. */
      holdSeconds: 20,
      /**
       * At startup (and after a resize) two frames are timed and the
       * sharpest setting that draws within this many milliseconds is
       * chosen outright. Under the 16.7 ms of a 60 fps frame on purpose:
       * some views of the ship cost more than the one measured.
       */
      budgetMs: 11,
      calibrationFrames: 8,
    },
    /**
     * Size of the image the glow is worked out on, relative to the glow
     * pass's own default (which is already half the frame each way, so
     * 0.5 here means a quarter). Smaller is much cheaper and a little
     * softer.
     */
    bloomResolutionScale: 0.5,
    /** How strongly interior surfaces reflect their surroundings. */
    environmentIntensity: 0.22,
    /** Pixels per side of the generated floor and ceiling textures. */
    panelTextureSize: 256,
    /**
     * Pixels per side of the generated wall texture. Larger than the
     * others because one repeat covers a whole wall, floor to ceiling,
     * and carries fine detail. Costs startup time and memory, not frames.
     */
    wallTextureSize: 1024,
  },

  /**
   * The ship seen from outside (world/space/shipExterior.ts and
   * world/space/exterior/): a plated, well-used working hull.
   */
  exterior: {
    /** Metres one repeat of the plating texture covers. */
    hullTileSize: 6,
    /** Pixels per side of the generated plating texture. */
    textureSize: 512,
    textureSeed: 2207,
    /** Seed for which portholes are lit and where surface detail sits. */
    hullSeed: 4127,
    /** Pieces of surface detail per square metre of flat hull top. */
    detailPerSquareMetre: 0.9,
    /** Engine glow: a pale ion blue. Core brightness idle and at full burn. */
    engineColor: 0x9fd6ff,
    engineIdle: 0.6,
    enginePeak: 7,
    /** Brightness of the lit windows and portholes; above 1 blooms. */
    windowGlow: 1.2,
    /** Navigation lights: red to port, green to starboard, white strobes. */
    portColor: 0xff3a2e,
    starboardColor: 0x3dff86,
    /** Port and starboard lights swell slowly once per period. */
    navPeriod: 3.4,
    navSwell: 1.4,
    /** Strobes give a quick double flash once per period. */
    strobePeriod: 1.9,
    strobeFlash: 0.07,
  },

  /** Exterior cinematic camera (M4), orbiting the ship during travel. */
  cinematic: {
    orbitRadius: 46,
    orbitHeight: 12,
    /** Slow orbit, radians per second. */
    yawRate: 0.07,
    /** Gentle vertical breathing of the orbit height. */
    bobAmplitude: 1.5,
    bobFrequency: 0.1,
  },

  /** Third-person follow camera. */
  camera: {
    distance: 3.4,
    minDistance: 0.6,
    /** The camera looks at a point this far above the drone's center. */
    eyeHeight: 0.45,
    /**
     * Looking around is a drag with the right mouse button held.
     * 'grab': the scene comes with the mouse - drag right to see what is
     * on your left, drag down to see the ceiling. 'turn': the view follows
     * the mouse instead - drag right to look right, down to look down.
     */
    lookStyle: 'grab' as 'grab' | 'turn',
    /** Radians the view turns per pixel dragged: half a turn in ~600 px. */
    lookSensitivity: 0.005,
    /**
     * How far the view can tip, in radians of camera height around the
     * drone: the minimum is the camera low, looking up at the ceiling;
     * the maximum is the camera high, looking down at the floor.
     */
    pitchMin: -1.1,
    pitchMax: 1.25,
    /** Gap kept between the camera and an occluding wall. */
    collisionMargin: 0.25,
    /** Exponential smoothing rate for camera position. */
    positionSmoothing: 14,
  },

  /** Debug flags, toggled via Vite env (`VITE_DEBUG=true npm run dev`). */
  debug: {
    enabled: import.meta.env?.VITE_DEBUG === 'true',
  },
} as const;

export type GameConfig = typeof gameConfig;
