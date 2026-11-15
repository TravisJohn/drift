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

  /** Debug flags, toggled via Vite env (`VITE_DEBUG=true npm run dev`). */
  debug: {
    enabled: import.meta.env?.VITE_DEBUG === 'true',
  },
} as const;

export type GameConfig = typeof gameConfig;
