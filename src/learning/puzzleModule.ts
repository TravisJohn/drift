/**
 * PuzzleModule - the plug-in seam for the AWS MLE side quest (D5).
 *
 * The game knows nothing about puzzle content: a terminal opens an overlay,
 * asks the registry for a module, and mounts it into the overlay's body.
 * Adding a real training puzzle later means writing a new module and
 * registering it - no changes to movement, camera or travel code
 * (PRD success criterion 4).
 */

/** What a mounted puzzle may ask of its host overlay. */
export interface PuzzleHost {
  /** Close the overlay; the player is done for now. */
  close(): void;
  /** Report the puzzle finished (v0: logged and closed with a nod). */
  complete(): void;
}

export interface PuzzleModule {
  readonly id: string;
  /** Shown as the overlay's heading. */
  readonly title: string;
  /** Build the puzzle's DOM inside `body`. Called once per open. */
  mount(body: HTMLElement, host: PuzzleHost): void;
  /** Tear down anything mount created (listeners, timers). */
  unmount(): void;
}
