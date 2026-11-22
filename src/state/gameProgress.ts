import { locations, START_LOCATION_ID } from '../content/destinations';
import { VESPER_LOCATION_ID } from '../content/vesperDeckPlan';

export const PROGRESS_KEY = 'drift.checkpoint.v1';
const LEGACY_DRONE_KEY = 'drift.drone-loadout';

interface Checkpoint {
  readonly locationId: string;
  readonly vesperRecovered: boolean;
  readonly companions: readonly number[];
}

function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== 'object' || value === null) return false;
  const { locationId, vesperRecovered, companions } = value as Partial<Checkpoint>;
  return (
    locations.some((location) => location.id === locationId) &&
    typeof vesperRecovered === 'boolean' &&
    Array.isArray(companions) &&
    companions.every((id, index) => id === index + 1) &&
    (companions.length === 0 || vesperRecovered)
  );
}

/** Docked checkpoints. A journey or away mission in progress restarts from the ship. */
export class GameProgress {
  private checkpoint: Checkpoint = {
    locationId: START_LOCATION_ID,
    vesperRecovered: false,
    companions: [],
  };
  private loaded = false;

  constructor() {
    try {
      const saved = globalThis.localStorage.getItem(PROGRESS_KEY);
      if (saved) {
        try {
          const decoded: unknown = JSON.parse(saved);
          if (isCheckpoint(decoded)) {
            this.checkpoint = decoded;
            this.loaded = true;
            return;
          }
        } catch {
          // Try the legacy record if this checkpoint was damaged.
        }
      }
      const legacy = globalThis.localStorage.getItem(LEGACY_DRONE_KEY);
      if (legacy === 'maintenance' || legacy === 'vesper-scout') {
        this.checkpoint = {
          locationId: VESPER_LOCATION_ID,
          vesperRecovered: true,
          companions: [1],
        };
        this.loaded = true;
      }
    } catch {
      // A missing, malformed or inaccessible save must not prevent a fresh game.
    }
  }

  get snapshot(): Checkpoint {
    return this.checkpoint;
  }

  get canContinue(): boolean {
    return this.loaded;
  }

  dock(locationId: string): void {
    this.checkpoint = { ...this.checkpoint, locationId };
    this.save();
  }

  recoverVesper(allCells: boolean): number | null {
    const companions = this.checkpoint.companions;
    const recruit = allCells ? companions.length + 1 : null;
    this.checkpoint = {
      ...this.checkpoint,
      vesperRecovered: true,
      companions: recruit === null ? companions : [...companions, recruit],
    };
    this.save();
    return recruit;
  }

  private save(): void {
    try {
      globalThis.localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.checkpoint));
      this.loaded = true;
    } catch {
      // Progress still works for this session without browser storage.
    }
  }
}
