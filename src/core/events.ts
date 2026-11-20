/**
 * Typed event bus (architecture decision D6).
 *
 * Systems communicate through events instead of direct references: the helm
 * emits `travel:requested`, and the TravelDirector, NarrativeDirector and
 * AudioManager each react independently.
 *
 * EVENT CATALOG - every event in the game is declared in `GameEvents` below.
 * This file is the single place to look up what can happen and what each
 * event carries. Add new events here as milestones introduce them.
 */

/** All game events and their payloads. `void` means "no payload". */
export interface GameEvents {
  // --- App lifecycle (M0+) ---
  /** The player left the title screen and the session began (M7). */
  'app:started': void;
  /** The pause menu opened; the simulation is frozen (M7). */
  'app:paused': void;
  /** The pause menu closed; the simulation is running again (M7). */
  'app:resumed': void;

  // --- Travel (M3/M4) ---
  /** The player chose a destination at the helm. */
  'travel:requested': { destinationId: string };
  /** Autopilot has engaged; the departure sequence is starting. */
  'travel:departed': { destinationId: string };
  /** The ship has arrived at its destination. */
  'travel:arrived': { destinationId: string };
  /** Any ship phase transition (docked/departing/cruising/arriving). */
  'ship:phaseChanged': { from: string; to: string; destinationId: string | null };

  // --- Player mode (M3) ---
  /** The player switched mode (roaming/atHelm/atTerminal/cinematic/atDashboard). */
  'player:modeChanged': { from: string; to: string };

  // --- Interaction (M3+) ---
  /** The drone moved close enough to an interactable to focus it. */
  'interact:focused': { interactableId: string };
  /** Focus left the previously focused interactable. */
  'interact:blurred': { interactableId: string };

  // --- Learning terminals (M5) ---
  /** A terminal overlay was opened. */
  'terminal:opened': { terminalId: string };
  /** A terminal overlay was closed. */
  'terminal:closed': { terminalId: string };

  // --- Ship dashboard (bridge holo-table) ---
  /** The dashboard view was opened. */
  'dashboard:opened': void;
  /** The dashboard view was closed. */
  'dashboard:closed': void;

  // --- Tactical combat (on the hologram) ---
  /** A fight began from the tactical tab. */
  'combat:started': { difficulty: string };
  /** The player left a fight: won, lost or retreated, with the final score. */
  'combat:ended': { outcome: string; score: number };

  // --- Vesper Station blackout (the drone's away mission) ---
  /** The drone was sent aboard Vesper Station from the tactical tab. */
  'salvage:started': void;
  /** The player came back: cells recovered or abandoned, after this many runs. */
  'salvage:ended': { outcome: string; runs: number };
}

export type GameEventName = keyof GameEvents;

type Handler<E extends GameEventName> = (payload: GameEvents[E]) => void;

/** Returned by `on`/`once`; call to remove the subscription. */
export type Unsubscribe = () => void;

export class EventBus {
  private readonly handlers = new Map<GameEventName, Set<Handler<GameEventName>>>();

  on<E extends GameEventName>(event: E, handler: Handler<E>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<GameEventName>);
    return () => this.off(event, handler);
  }

  once<E extends GameEventName>(event: E, handler: Handler<E>): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off<E extends GameEventName>(event: E, handler: Handler<E>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as Handler<GameEventName>);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  /**
   * Emit an event to all current subscribers.
   *
   * A throwing handler is reported via console.error but does not prevent
   * the remaining handlers from running: one broken system must not silently
   * disable unrelated systems reacting to the same event.
   */
  emit<E extends GameEventName>(
    ...args: GameEvents[E] extends void ? [event: E] : [event: E, payload: GameEvents[E]]
  ): void {
    const [event, payload] = args;
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy before iterating so handlers may subscribe/unsubscribe mid-emit.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`EventBus: handler for "${event}" threw`, error);
      }
    }
  }

  /** Number of active subscriptions for an event (used by tests/debug). */
  listenerCount(event: GameEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
