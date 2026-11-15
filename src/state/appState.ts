/**
 * AppState - what the application as a whole is doing (D3).
 *
 * Title -> Playing <-> Paused. Pure TypeScript like the other state
 * machines; invalid transitions throw (programming errors). The game loop
 * always runs - rendering continues on the title and pause screens - but
 * game.ts only advances the simulation while `isPlaying`.
 */

export type AppStateId = 'title' | 'playing' | 'paused';

export interface AppStateChange {
  readonly from: AppStateId;
  readonly to: AppStateId;
}

export class AppState {
  private _state: AppStateId = 'title';

  get state(): AppStateId {
    return this._state;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  /** Leave the title screen and begin the session. */
  start(): AppStateChange {
    return this.transition('playing', ['title']);
  }

  pause(): AppStateChange {
    return this.transition('paused', ['playing']);
  }

  resume(): AppStateChange {
    return this.transition('playing', ['paused']);
  }

  private transition(to: AppStateId, allowedFrom: AppStateId[]): AppStateChange {
    if (!allowedFrom.includes(this._state)) {
      throw new Error(`AppState: cannot go to ${to} from ${this._state}`);
    }
    const from = this._state;
    this._state = to;
    return { from, to };
  }
}
