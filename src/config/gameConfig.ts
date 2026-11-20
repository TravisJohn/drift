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
    /** Colour of the antenna beacon while the drone strains at its tether. */
    warningColor: 0xff2414,
    /** Radius (m) of the red glow round the antenna beacon. */
    warningHaloRadius: 0.07,
    /** Brightness of that glow on each alarm beat (bloom spreads it further). */
    warningHaloStrength: 1.6,
    /** Extra beacon brightness on each alarm beat, as a multiple of beaconPeak. */
    warningBeaconBoost: 1.5,
    /** The alarm rhythm: slow at first strain, fast at the limit (player/warningBeat.ts). */
    warningBeat: { slowInterval: 0.9, fastInterval: 0.18, flashSeconds: 0.16 },
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
    /** Tactical combat effects, synthesized live (combat/combatSounds.ts). */
    combatSounds: {
      enabled: true,
      level: 0.32,
    },
    /** Vesper Station blackout score and effects, synthesized live (salvage/vesperSounds.ts). */
    salvageSounds: {
      enabled: true,
      level: 0.7,
    },
    /** The drone's tether alarm, synthesized live (audio/warningBeep.ts). */
    warningBeep: {
      enabled: true,
      level: 0.16,
      lowHz: 1250,
      highHz: 1650,
      durationSeconds: 0.08,
    },
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
    powerSave: {
      intervalSeconds: 120,
      fadeDownSeconds: 4,
      dimSeconds: 14,
      fadeUpSeconds: 6,
      minimumLight: 0.045,
    },
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

  /**
   * Tactical combat on the command deck's hologram (src/combat). A 2D,
   * top-down fight; distances are arena units (about a pixel at 1x zoom),
   * speeds units per second, angles radians. Rules and numbers come from
   * the STARFALL prototype, re-tuned for a flat view.
   */
  combat: {
    /**
     * Space is endless: the fight moves with the ship. Rocks further than
     * this from the ship are recycled ahead of it; the radar shows this far.
     */
    fieldRadius: 1500,
    /** Units of the arena visible across the narrower side of the screen. */
    viewSpan: 1100,
    ship: {
      radius: 26,
      // Forward flight (author's design after playtesting): the hull always
      // faces forward and never rotates, and the ship is always moving
      // forward. W/S step the forward speed through notches that stay set
      // (S never stops it); A/D step a sideways drift that stays until
      // changed, so the pilot keeps navigating.
      /** Forward speed at each throttle notch, and the notch names shown. */
      forwardSpeeds: [90, 160, 240],
      throttleNames: ['Slow', 'Cruise', 'Fast'],
      /** The fight opens at this notch (cruise). */
      startThrottle: 1,
      /** Sideways speed added per A/D notch, and how many notches each way. */
      strafeStep: 70,
      strafeNotches: 2,
      /**
       * The cockpit drifts only while A/D is held (it is harder to judge
       * a set drift from the seat): holding one drifts this many notches.
       */
      holdDriftNotches: 2,
      /**
       * Shift (while boost energy lasts) goes the way the ship is drifting:
       * with a drift set it adds this much sideways speed (a hard dodge);
       * with none it adds `boostExtra` forward.
       */
      boostExtra: 150,
      boostSide: 220,
      /** How fast the engines bring the motion to the set speeds (units/s, per s). */
      accel: 240,
      /** ...and while boosting, so a dodge bites at once. */
      boostAccel: 700,
    },
    defence: {
      shieldMax: 100,
      hullMax: 100,
      /** Shields start to recharge after this long without a hit. */
      shieldRegenDelay: 4.5,
      shieldRegenRate: 9,
      /** Boost energy: drains while boosting, refills otherwise. */
      energyMax: 100,
      boostDrain: 28,
      energyRefill: 13,
      /** Starting a boost needs at least this much energy (an empty bar waits). */
      boostMinStart: 25,
      /** Damage from ramming a raider or scraping a rock. */
      ramDamage: 20,
      rockDamage: 9,
    },
    lasers: {
      cooldown: 0.135,
      speed: 1100,
      life: 1.1,
      damage: 1,
      heatPerShot: 7.5,
      coolRate: 22,
      /** Overheated cannons cool a little faster, and fire again below this heat. */
      overheatedCoolRate: 28,
      resumeHeat: 25,
      /** Twin cannons: this far either side of the hull's centre line. */
      spread: 11,
      /** Aim help: a target this close to the aim (radians) is led automatically. */
      assistAngle: 0.1,
    },
    missiles: {
      count: 6,
      cooldown: 0.7,
      launchSpeed: 320,
      speed: 640,
      /** How hard a missile steers toward its target (exponential rate). */
      homing: 4,
      life: 5,
      damage: 8,
      hitRadius: 30,
      /** Hold the aim within this angle of a raider, in range, to lock it. */
      lockAngle: 0.22,
      lockRange: 900,
      lockSeconds: 1.05,
    },
    enemy: {
      radius: 20,
      commanderRadius: 30,
      /**
       * Well above the ship's top notch (240), so raiders keep station and
       * get back in front after an attack run; boost (390) outruns them.
       */
      speed: 360,
      turnRate: 1.4,
      /**
       * How quickly a raider's motion swings round to where its nose points
       * (per second). Lower means wider, slidier turns: they carry momentum.
       */
      grip: 1.6,
      /**
       * Each raider holds a station around the ship at about this distance,
       * weaving in and out, its bearing swaying to and fro.
       */
      stationRange: 420,
      stationWeave: 120,
      stationSway: 0.35,
      stationSwayRate: 0.4,
      /**
       * Where the stations are: the wave spread across this half-arc ahead
       * of the nose (radians; inside the cockpit's 60 degree half-view),
       * except this share, spread across this half-arc behind the tail.
       */
      aheadArc: 0.75,
      rearShare: 0.25,
      rearArc: 0.6,
      /**
       * Keeping station, a raider matches the ship's velocity plus this
       * much speed toward its station per unit still to go.
       */
      paceGain: 0.9,
      /**
       * Attack runs: every `everyMin`..`everyMax` seconds a raider leaves
       * its station and turns in on the ship (head-on from ahead), for up
       * to `runTime` seconds or until it is within `breakRange`.
       */
      attack: { everyMin: 8, everyMax: 14, runTime: 3.5, breakRange: 420 },
      /** They open fire inside this range, when roughly facing the ship. */
      fireRange: 820,
      fireAngle: 0.5,
      shotSpeed: 520,
      shotLife: 2.2,
      /** Where a wave appears: this far from the ship, toward each station. */
      spawnMin: 900,
      spawnMax: 1250,
      /** Radians either side of its station a raider may appear. */
      spawnScatter: 0.25,
      /**
       * Raider missiles: slow and turning gently, so a sideways drift dodges
       * them, the fast notch outruns one from behind, and lasers shoot them
       * down. How often they fly is set per difficulty.
       */
      missile: {
        speed: 230,
        /** Most a missile can turn, radians a second. */
        turnRate: 1.1,
        life: 7,
        /** Size as a target for the ship's lasers. */
        radius: 12,
        /** Raiders launch only from this band of range. */
        minRange: 300,
        maxRange: 950,
      },
    },
    /** Raiders per wave; the last wave is led by a commander. */
    waves: [5, 7, 9],
    /** Seconds between a cleared wave and the next. */
    wavePause: 3,
    /** Repairs and rearming between waves. */
    rearm: { shield: 35, hull: 15 },
    difficulty: {
      rookie: {
        enemyHp: 3,
        commanderHp: 9,
        fireMin: 3.6,
        fireMax: 6.2,
        /** Random aim error, radians either way. */
        spread: 0.09,
        shotDamage: 13,
        /** Seconds between one raider's missiles, and most in flight at once. */
        missileMin: 10,
        missileMax: 18,
        maxMissiles: 1,
        missileDamage: 16,
      },
      ace: {
        enemyHp: 4,
        commanderHp: 12,
        fireMin: 1.8,
        fireMax: 3.5,
        spread: 0.04,
        shotDamage: 20,
        missileMin: 6,
        missileMax: 11,
        maxMissiles: 3,
        missileDamage: 22,
      },
    },
    score: { hit: 10, raider: 150, commander: 500, hullBonus: 10, shieldBonus: 5 },
    rocks: { count: 9, minRadius: 34, maxRadius: 90, drift: 14 },
  },

  /**
   * Vesper Station blackout (src/salvage): the drone's away mission on a
   * dark service deck. Distances are deck survey units (the deck is
   * 1184 x 908); times are seconds. Values come from the approved 2D
   * prototype (prototypes/Vesper-Blackout.html) and stay tunable here.
   */
  salvage: {
    /** Drone flight speed, units per second. */
    flightSpeed: 35,
    /** Drone hull radius for walls, sockets and guard sight. */
    droneRadius: 3.5,
    /** Where each run starts: inside the western airlock. */
    start: { x: 90, y: 548 },
    /** Cells to bring home, and how close a socket must be to tap it. */
    cellsNeeded: 2,
    socketReach: 11,
    /** Uninterrupted seconds beside a socket to pull its cell. */
    extractionSeconds: 10,
    /** Guards: sight cone half-angle (radians) and forward depth. */
    sightHalfAngle: 0.47,
    sightDepth: 56,
    /** Guards beyond this distance are not tested for sight (a fast reject). */
    sightCheckRange: 70,
    /** Patrol speed multiplier and seconds of RED ALERT before the reset. */
    alarmSpeed: 1.2,
    alarmSeconds: 2.2,
    /** Light seeds: active at once, lifetime, light radius, contact radius. */
    seedLimit: 5,
    seedSeconds: 15,
    seedRange: 140,
    seedRadius: 2,
    /** Drone lamp radius in deck units. */
    lampRange: 111,
    /** Patrollers closer than this start the proximity pulse. */
    warningRange: 110,
    /** Seconds the win banner stays before the results dialog. */
    resultsDelay: 1.4,
  },

  /** Debug flags, toggled via Vite env (`VITE_DEBUG=true npm run dev`). */
  debug: {
    enabled: import.meta.env?.VITE_DEBUG === 'true',
  },
} as const;

export type GameConfig = typeof gameConfig;
