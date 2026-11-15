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

---

## 2026-11-15 - M2 complete: full ship interior from layout data

**Milestone M2 done.** 106 tests passing; lint, types clean; verified in
browser (spawn in cryo bay, drove through the cryo->corridor door, stopped
correctly at the corridor hull wall).

- `content/shipLayout.ts`: the whole floor plan as data - 6 rooms (bridge,
  corridor spine, lab, cargo, cryo, engineering), 5 doors, 6 windows,
  26 props (helm console, lab terminal, cryo pods, reactor, crates). Spawn
  is in the cryo bay, beside the pods the drone tends.
- `world/ship/layoutGeometry.ts`: pure helpers - shared-edge detection,
  interval subtraction, wall segmentation around door/window openings.
- `world/ship/validateLayout.ts`: rejects overlapping rooms, doors without
  a shared edge, unreachable rooms (BFS over doors), windows on non-exterior
  walls, props outside their room, bad spawn. buildShip() throws on invalid
  content - the game refuses to start with a broken layout.
- `world/ship/shipBuilder.ts`: layout -> meshes + colliders from the same
  box list (can't drift apart); shared walls built once; windows are real
  hull openings (space will show through them in M4); per-room mood lighting
  (cryo cool blue, engineering warm orange) + exp2 fog for depth.
- Deleted the temporary `world/greyRoom.ts`.
- Known cosmetic: favicon 404 in console; add an icon in M7.

Next: M3 - interaction system, helm, destination menu, ShipState machine.

---

## 2026-11-15 - M3 complete: helm, destinations, journey state

**Milestone M3 done.** 145 tests passing; verified live: travel:requested ->
departing -> cruising with the HUD percentage climbing, and the Set Course
menu rendering with keyboard/mouse selection.

- `content/destinations.ts`: 3 locations (Anchorage Point, Aurelia, Cinder)
  with blurbs, 60-120s cruise times (PRD), accent colors for M4 visuals,
  plus content validation.
- `state/shipState.ts`: docked -> departing -> cruising -> arriving ->
  docked, owning its own phase timing; update(dt) returns transition records
  the game emits as events; arrival rebinds the ship's location. Design note:
  the architecture table gave the travel timeline to TravelDirector - it
  lives in ShipState instead, and M4's TravelDirector will be purely visual,
  reading ship phase/progress. Logged as a deliberate deviation.
- `state/playerMode.ts`: roaming/atHelm/atTerminal/cinematic with guarded
  transitions (invalid ones throw).
- `interaction/`: Interactable interface + proximity-focus system
  (nearest-in-radius wins, returns focus changes, no event spam).
- `core/input.ts`: consumePress() edge detection (auto-repeat ignored).
- `ui/`: Hud (status line + prompt), DestinationMenu (W/S/arrows + Enter/E,
  Esc, mouse; owns its key listener while open), styles.css.
- game.ts: helm interactable built from the layout's 'helm' prop; while a
  menu is open the drone gets idle input and settles; E presses are consumed
  every frame so stale presses can't fire; menu keys never leak to gameplay.
- Travel runs during roaming (D3 payoff): status line shows live progress
  while you wander.

Next: M4 - space scene, layered rendering (D2), TravelDirector visuals,
cinematic exterior camera, arrival changing the view.

---

## 2026-11-15 - M4 complete: space outside the windows

**Milestone M4 done.** 166 tests passing; lint, types, production build
clean. Verified live in the browser: stars visible through the bridge window
while cruising (screenshot), star buffer confirmed drifting, V toggles the
exterior shot (hull + engine glow + receding station), and arrival at
Aurelia swapped the visible body and returned drift to zero.

- `world/space/starfield.ts`: deterministic starfield (seeded mulberry32) in
  a wrap-around cube; drift math is pure Float32Array functions, fully
  tested. The ship never moves - stars slide past it (D2).
- `world/space/celestialBodies.ts`: one grey-box body per location built
  from new `body` data on LocationSpec (station / ringed / sun). The current
  location's body recedes astern during departure; the destination grows in
  from dead ahead during arrival.
- `world/space/shipExterior.ts`: hull built from the same room rectangles
  as the interior (silhouettes can't drift apart), aft engines whose glow
  follows engine intensity. Only visible in the cinematic shot.
- `travel/travelDirector.ts`: pure `computeTravelView()` mapping ShipState's
  phase/phaseProgress to drift speed, engine glow and body presences
  (smoothstep ramps). Visuals-only, per the M3 logged deviation.
- `travel/cinematicCamera.ts`: slow exterior orbit with gentle height bob;
  V enters it during travel, V (or docking) returns inside.
- game.ts: layered render - space scene first from a rotation-matched
  camera at the origin, depth cleared, interior on top; so space shows only
  through the real window openings. autoClear off, manual clears.
- Hint line now mentions E and V.

Next: M5 - lab terminal + PuzzleModule interface/registry + placeholder
puzzle overlay; NarrativeDirector + AI lines + HUD subtitles. Full v0 loop.
