# Learning layer - status and how to continue

DRIFT started as an experiment in whether a calm space game could be a way
to study (see [PRD.md](../PRD.md), section 1). The game side is playable.
**The learning side is not integrated yet.** Only the plug-in seam and one
placeholder module exist.

This note is the starting point for whoever picks the learning layer up next.

## What exists today

| Piece                | File                                                                | State                                                                                             |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Module contract      | `src/learning/puzzleModule.ts`                                      | Done. `PuzzleModule` (mount/unmount) and `PuzzleHost` (close/complete).                           |
| Registry             | `src/learning/puzzleRegistry.ts`                                    | Done. Throws on duplicate ids and unknown lookups.                                                |
| Placeholder module   | `src/learning/placeholderPuzzle.ts`                                 | Stand-in only. Shows one canned card and a "Log session" button. No questions, scoring or saving. |
| Overlay host         | `src/ui/puzzleOverlay.ts`                                           | Done. Owns the panel, title, Esc-to-close, and always unmounts the module.                        |
| Science lab terminal | `src/game.ts` (search `terminal-lab`)                               | Done. Walk up to it and press E. Always opens the `placeholder` module.                           |
| Command deck entry   | Dashboard Training tab (`src/ui/dashboardOverlay.ts`, `onTraining`) | Done. Lists every registered module, so a new module appears there automatically.                 |
| Ship AI reactions    | `src/content/aiLines.ts` (`terminalOpened`, `terminalComplete`)     | Done. Generic lines only.                                                                         |
| Tests                | `tests/learning/`, `tests/ui/puzzleOverlay.test.ts`                 | Cover the registry, placeholder and overlay.                                                      |

Events already emitted: `terminal:opened` and `terminal:closed` (with
`terminalId`). `puzzle:completed` is planned in ARCHITECTURE.md but not
emitted yet; completion currently goes through the overlay's `onComplete`
callback to the narrative director.

## Adding a real module (the smallest useful step)

1. Create `src/learning/<name>Puzzle.ts` implementing `PuzzleModule`.
   Build all DOM inside `mount(body, host)`. Remove listeners and timers in
   `unmount()`. Call `host.complete()` when the player finishes a session and
   `host.close()` to leave early.
2. Keep question content as data, not code. Suggested home:
   `src/content/training/<topic>.ts`, validated at load like the other
   content files (fail loud on a bad entry).
3. Register it next to the placeholder in `src/game.ts`
   (`this.puzzles.register(...)`). It will show up on the Training tab.
4. If the lab terminal should open it instead of the placeholder, change the
   default `moduleId` passed by the `terminal-lab` interactable.
5. Add `tests/learning/<name>Puzzle.test.ts` (jsdom). Test mount builds the
   UI, answering calls `complete`, and `unmount` leaves the body empty.

No movement, camera, travel or rendering code needs to change. That
isolation was a PRD success criterion and the tests guard it.

## Decisions still open (decide before building much)

- **Content and licensing.** The original target was AWS Machine Learning
  Engineer exam practice. Exam questions are copyrighted by their owners, so
  an open-source repo should ship only original questions written for DRIFT
  or content under a compatible license.
- **Format.** Flash cards, multiple choice, short scenario puzzles at ship
  consoles, or a mix.
- **Progress.** Whether to save scores and spaced-repetition state. If so,
  extend `src/state/gameProgress.ts` (browser localStorage, key
  `drift.checkpoint.v1`). Bump the key version or migrate when the shape
  changes so existing saves still load.
- **Game tie-in.** Whether finishing training should matter in the game (for
  example power, companions or new destinations) or stay a quiet side
  activity. Any tie-in should go through events, not direct calls, so the
  learning modules stay independent of game state.
- **Placement.** One terminal, or several terminals that each open a topic
  (ARCHITECTURE.md sketches a `content/terminals.ts` map for this).

## Out of scope until decided

Live AI or LLM tutoring, accounts, and any backend. DRIFT is a static site
with no server, and adding one changes how it deploys.
