/**
 * PlayerMode - what the player is currently doing (D3).
 *
 * Independent of ShipState by design: the drone can roam while the ship
 * cruises, which is the core idea of the game. Pure TypeScript; invalid
 * transitions throw (programming errors, not content errors).
 *
 * Modes: roaming (default), atHelm (destination menu open),
 * atTerminal (puzzle overlay, M5), cinematic (exterior travel view, M4),
 * atDashboard (the bridge holo-table's ship overview), inCombat (a
 * tactical fight on the hologram), onSalvage (the drone's away mission
 * on another station's deck, seen through its camera feed).
 */

export type PlayerModeId =
  'roaming' | 'atHelm' | 'atTerminal' | 'cinematic' | 'atDashboard' | 'inCombat' | 'onSalvage';

export interface PlayerModeChange {
  readonly from: PlayerModeId;
  readonly to: PlayerModeId;
}

export class PlayerMode {
  private _mode: PlayerModeId = 'roaming';

  get mode(): PlayerModeId {
    return this._mode;
  }

  get isRoaming(): boolean {
    return this._mode === 'roaming';
  }

  enterHelm(): PlayerModeChange {
    return this.transition('atHelm', ['roaming']);
  }

  enterTerminal(): PlayerModeChange {
    return this.transition('atTerminal', ['roaming']);
  }

  enterDashboard(): PlayerModeChange {
    return this.transition('atDashboard', ['roaming']);
  }

  enterCombat(): PlayerModeChange {
    return this.transition('inCombat', ['roaming']);
  }

  enterSalvage(): PlayerModeChange {
    return this.transition('onSalvage', ['roaming']);
  }

  enterCinematic(): PlayerModeChange {
    return this.transition('cinematic', ['roaming']);
  }

  exitToRoaming(): PlayerModeChange {
    if (this._mode === 'roaming') {
      throw new Error('PlayerMode: already roaming');
    }
    const from = this._mode;
    this._mode = 'roaming';
    return { from, to: 'roaming' };
  }

  private transition(to: PlayerModeId, allowedFrom: PlayerModeId[]): PlayerModeChange {
    if (!allowedFrom.includes(this._mode)) {
      throw new Error(`PlayerMode: cannot enter ${to} from ${this._mode}`);
    }
    const from = this._mode;
    this._mode = to;
    return { from, to };
  }
}
