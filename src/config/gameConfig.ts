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
    starCount: 1400,
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
  },

  /** Exterior cinematic camera (M4), orbiting the ship during travel. */
  cinematic: {
    orbitRadius: 30,
    orbitHeight: 9,
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
    lookSensitivity: 0.0023,
    pitchMin: -0.5,
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
