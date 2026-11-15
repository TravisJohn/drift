# Drift - Project Log

Chronological record of major decisions, milestones and changes. Newest at the bottom.

---

## 2026-11-15 - Concept and PRD agreed

**Milestone:** PRD v1.0 agreed (see PRD.md).

Decisions:
- Purpose: a personal experiment to see whether a calm, atmospheric space game
  can become a new way to learn. Gameplay feel comes first; AWS MLE training
  is a side quest and only a placeholder in v0.
- Platform: browser, built with Three.js and TypeScript.
- Art: stylized low-poly using free CC0 asset packs.
- Player: a hovering maintenance drone on a research vessel whose crew is in
  cryosleep.
- Flight: cinematic autopilot, not manual piloting.
- Core loop link: the player can roam the ship during autopilot travel.
- First prototype: the full walk + fly loop at basic quality, about 10 minutes
  long (length was defaulted, not chosen; revisit after the first playtest).
- Audio: the author supplies music and ambience.
- Builder: the Claude Fable model will implement the game once the
  architecture is approved.

Next: architecture proposal (ARCHITECTURE.md), waiting for approval.

---

## 2026-11-15 - Architecture approved

**Milestone:** ARCHITECTURE.md v1.0 approved as proposed, with no changes.

Key decisions:
- Vite + TypeScript + Three.js, tested with Vitest; plain HTML/CSS for menus.
- Custom sphere-vs-box collision; no physics engine.
- Space and interior are separate scenes drawn in layers. The ship stays
  still and space moves around it.
- App state, the ship's journey and the player's mode are tracked by three
  separate state machines.
- Game content (layout, destinations, AI lines, audio list) lives in data
  files.
- Puzzles plug in through an interface and a registry.
- Grey-box build first (M1-M5), then art (M6).
- Each milestone ends with passing tests, a log entry and a git commit.

Next: M0 scaffold, built by the Fable model in a new session started by the
author.

---

## 2026-11-15 - M0 complete: scaffold, loop, event bus

**Milestone M0 done.** `npm run dev` shows a rendering canvas (placeholder
wireframe cube); `npm test` passes (19 tests); lint and production build pass.

- Author chose to continue in this session with the Fable model instead of
  starting a new session.
- The folder contained an old, unrelated "retro maze game" starter from May;
  author chose to delete it. Drift now owns the root.
- Stack installed: Vite 8, TypeScript 6 (strict), Three.js 0.187, Vitest 5,
  ESLint 10 (type-checked rules), Prettier.
- Built `core/loop.ts` (fixed 60 Hz timestep, interpolated render, capped
  catch-up after stalls) and `core/events.ts` (typed event bus with a
  documented event catalog; a throwing handler is logged and does not block
  other handlers).
- `game.ts` is a minimal placeholder scene; real ship interior starts M1.
- Fixed a float-precision bug found by tests: frame times a few ULPs short of
  a step boundary dropped an update; the loop now counts steps with an
  epsilon.
- Folders `src/<module>/` beyond config/core are created as their milestones
  arrive, to avoid empty-dir noise. `public/{audio,models,textures}` exist.

Next: M1 - drone controller in a grey-box room (input, hover movement,
sphere collision, follow camera).

---

## 2026-11-15 - M1 complete: drone in a grey-box room

**Milestone M1 done.** 69 tests passing; lint, types and build clean.

- Pure-math modules (no Three.js imports, fully unit-tested):
  `physics/vec3`, `physics/colliders` (AABB + slab segment test),
  `physics/sphereCollision` (resolve-and-slide, inside-box pushout),
  `player/droneController`, `player/followCamera`.
- Movement feel: velocity chases input exponentially (soft floaty starts and
  stops), drone faces its travel direction, leans into motion, banks into
  turns, and bobs gently when idle. All rates live in `config/gameConfig.ts`.
- Follow camera orbits with mouse (pointer lock), clamps pitch, and pulls in
  front of occluding walls via segment-vs-AABB (snaps in, eases out).
- Grey room: floor/ceiling/4 walls/4 crates; meshes and colliders built from
  the same box specs so they cannot drift apart. Mood lighting first pass.
- Render interpolation: visuals lerp between fixed steps (prevPosition).
- Dev-only `window.__drift` handle exposes a read-only snapshot for tooling.
- Verified in the embedded browser: renders correctly, input drives the
  drone, damping settles it, no console errors. NOTE: the embedded pane
  reports visibility:hidden and throttles rAF to ~2fps, so real-time feel
  cannot be judged there - playtest in a normal browser at localhost:5173.
- Decision: when the tab is hidden the game effectively pauses (capped
  catch-up drops time). Acceptable; a real pause menu lands in M7.

Next: M2 - full ship interior in grey boxes from `shipLayout.ts` data
(5 rooms, corridors, windows), plus content validation tests.
