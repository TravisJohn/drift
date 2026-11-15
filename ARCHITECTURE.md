# Drift - Architecture Proposal

Status: APPROVED v1.0 (2026-11-15). Building starts at milestone M0.
Scope: the v0 vibe prototype described in PRD.md.

---

## 1. Stack

| Concern         | Choice                          | Why |
|-----------------|---------------------------------|-----|
| Language        | TypeScript (strict mode)        | Type safety across many interacting systems |
| Rendering       | Three.js (used directly)        | Direct control of the game loop and render order (see D2) |
| Build / dev     | Vite                            | Instant reload; serves static assets from `public/` |
| Tests           | Vitest (+ jsdom for UI tests)   | Same config as Vite; fast |
| Lint / format   | ESLint + Prettier               | Consistent style across sessions and models |
| UI overlays     | Plain HTML/CSS layered over the canvas | Menus and text are easier and sharper in DOM than in WebGL |
| Collision       | Custom sphere-vs-box (see D1)   | The ship is built on a grid of boxes; no physics engine needed |

No backend and no secrets in v0. Tunable values (speeds, travel duration,
debug flags) go in `src/config/`. Vite `.env` files are used only for
debug toggles (`VITE_DEBUG=true`).

---

## 2. Key design decisions (please review)

**D1 - Custom collision instead of a physics engine.**
The drone is a sphere, and the ship is built from grid-aligned boxes (walls,
floors, props). Sphere-vs-box collision with sliding is about 100 lines,
predictable and fully unit-testable.
Trade-off: no physics on loose objects. If we later want crates the drone can
push, add Rapier then. That only touches the `physics/` module.

**D2 - Two scenes, rendered in layers. This is how the windows work.**
- `SpaceScene`: stars, planets, nebula, and the ship's exterior hull.
- `InteriorScene`: the inside of the ship.

Each frame renders SpaceScene first (with the camera rotated to match the
interior view), clears depth, then renders InteriorScene on top. Windows are
openings in the interior geometry, so space shows through them. During
autopilot the ship never actually moves: the SpaceScene content moves around
the ship, so the interior stays still and collision stays simple.
The cinematic "outside" view renders only SpaceScene from an orbiting camera.

**D3 - Three separate state machines, kept apart on purpose.**
- `AppState`: Title, Playing, Paused.
- `ShipState`: Docked → Departing → Cruising → Arriving → Docked, carrying
  the current destination and travel progress (0..1).
- `PlayerMode`: Roaming, AtHelm, AtTerminal, CinematicView.

Because these are independent, you can roam (PlayerMode) while cruising
(ShipState), which is the core idea of the PRD. All three are pure
TypeScript with no Three.js imports, so they can be tested exhaustively.

**D4 - Content is data, not code.**
Ship layout, destinations, AI voice lines, the audio list and terminal
placement live in `src/content/` as typed data. Tuning the vibe (new line,
longer trip, moved room) should not need logic changes.

**D5 - Puzzles plug in behind an interface.**
The AWS MLE side quest connects through a `PuzzleModule` interface and a
`PuzzleRegistry`. v0 ships one `PlaceholderPuzzle`. Adding a real puzzle
means adding a module and registering it, with no changes to movement,
camera or travel code (PRD success criterion 4).

**D6 - Systems talk through a typed event bus.**
Example: the helm emits `travel:requested`; the TravelDirector,
NarrativeDirector and AudioManager each react independently. This keeps
modules decoupled; the trade-off is that flows are harder to trace, so each
event type is documented in `core/events.ts`.

**D7 - Build in grey boxes first, swap in art second.**
The full loop is built with plain boxes and spheres first (milestones M1-M5),
then the CC0 models and lighting go in (M6). This lets us test the feel of
movement, pacing and travel early, before art time is spent.

**D8 - A fixed-timestep simulation.**
Game logic updates at a fixed 60 Hz, and rendering interpolates between
updates. Movement then behaves the same at any frame rate, and logic tests
are deterministic.

---

## 3. Folder structure

```
drift/  (project root: D:\WEB PROJECTS\game_app_poc)
  PRD.md
  ARCHITECTURE.md
  PROJECT_LOG.md
  ASSETS.md                  credits + license for every third-party asset
  index.html
  package.json, tsconfig.json, vite.config.ts, .eslintrc, .prettierrc
  public/
    models/                  CC0 .glb files
    audio/                   author-supplied music and ambience (see section 6)
    textures/
  src/
    main.ts                  bootstraps Game
    game.ts                  wires systems together; owns the loop
    config/
      gameConfig.ts          speeds, durations, camera tuning, debug flags
    core/
      loop.ts                fixed-timestep loop
      events.ts              typed event bus + event catalog
      input.ts               keyboard/mouse, pointer lock, action mapping
      assets.ts              GLTF/texture loading with progress + error reporting
    state/
      appState.ts
      shipState.ts
      playerMode.ts
    physics/
      colliders.ts           box colliders built from the ship layout
      sphereCollision.ts     sphere-vs-box resolve-and-slide
    rendering/
      renderer.ts            layered render: SpaceScene then InteriorScene
      lighting.ts            interior mood lighting, flicker effects
    world/
      ship/
        shipBuilder.ts       layout data -> meshes + colliders
        cryoPods.ts          sleeping crew props, breathing glow
      space/
        spaceScene.ts
        starfield.ts         parallax stars, speed streaks during cruise
        celestialBodies.ts   planets/star/nebula for destinations
    player/
      droneController.ts     hover movement: acceleration, damping, bob, tilt
      droneVisual.ts         model + hover light + thruster glow
      followCamera.ts        orbit camera with wall-avoidance
    interaction/
      interactable.ts        Interactable interface
      interactionSystem.ts   proximity, focus, "Press E" prompt
      helm.ts                opens destination menu, starts autopilot
      terminal.ts            opens puzzle overlay via PuzzleRegistry
    travel/
      travelDirector.ts      departure -> cruise -> arrival timeline
      cinematicCamera.ts     exterior orbit shots during travel
    learning/
      puzzleModule.ts        PuzzleModule interface
      puzzleRegistry.ts
      puzzles/placeholderPuzzle.ts
    narrative/
      narrativeDirector.ts   event -> AI line triggers, cooldowns, no repeats
    audio/
      audioManager.ts        music/ambience layers, crossfades, volume, missing-file warnings
    ui/
      hud.ts                 interaction prompt, subtitle line for AI voice
      destinationMenu.ts
      terminalOverlay.ts
      titleScreen.ts
      pauseMenu.ts
      styles.css
    content/
      shipLayout.ts          room grid, doors, windows, prop placement
      destinations.ts
      aiLines.ts
      audioManifest.ts
      terminals.ts           which terminal sits where, and which puzzle it opens
  tests/                     mirrors src/; e.g. tests/state/shipState.test.ts
```

---

## 4. Module responsibilities and contracts (summary)

| Module | Input | Output | Notes |
|---|---|---|---|
| `core/loop` | requestAnimationFrame | `update(dt)` at fixed 60 Hz, `render(alpha)` | Caps catch-up steps to avoid a spiral after a tab switch |
| `core/input` | DOM events | Action state (`move`, `look`, `interact`, `pause`, `toggleView`) | Gameplay never reads raw key codes |
| `state/*` | Events | New state + emitted transition events | Pure, no Three.js; invalid transitions throw in dev |
| `physics/*` | Sphere position/velocity, colliders | Corrected position/velocity | Pure math, heavily tested |
| `player/droneController` | Actions, dt, colliders | Drone transform | Movement disabled outside Roaming mode |
| `interaction/*` | Drone position, Interactables | Focused target, `interact:*` events | |
| `travel/travelDirector` | `travel:requested` | ShipState progress, SpaceScene motion, arrival event | Duration from config (60-120 s) |
| `learning/*` | Terminal id | Overlay content; `puzzle:completed` (future) | v0: placeholder only |
| `narrative/narrativeDirector` | Game events | Subtitle lines + optional voice audio | Data-driven from `content/aiLines.ts` |
| `audio/audioManager` | Events, manifest | Playback | A missing file logs a warning and stays silent; never crashes or fails without a log |
| `rendering/renderer` | Both scenes, active camera | Frame | Owns the layered render order (D2) |

---

## 5. Testing strategy

- **Unit (most tests):** the state machines, collision math, the travel
  timeline (progress at time t, phase changes), the interaction focus rules,
  the puzzle registry, narrative trigger rules (cooldowns, no repeats), the
  input mapping, and audio manifest checks.
- **Content validation tests:** every destination has a body and arrival
  line, every terminal points to a registered puzzle, the ship layout has no
  unreachable rooms, and every audio entry has a path. These catch broken
  data before playtesting.
- **UI (jsdom):** menus open and close and send the correct events.
- **Manual playtest checklist** in `PROJECT_LOG.md` for each milestone: feel,
  pacing, no soft-locks, and frame rate (shown on a debug overlay).
- Rule: every milestone adds tests alongside the feature, and the suite must
  pass before moving on.

---

## 6. Audio you'll supply

Put files in `public/audio/` as `.ogg` (preferred), `.mp3` or `.wav`; the
loader tries them in that order per key. Loops should be seamless (`.mp3`
adds a few ms of padding, so prefer `.ogg` or `.wav` for loops that click).
Until a file exists the game runs silently and logs a warning.

| Key                 | Type   | Use |
|---------------------|--------|-----|
| `music_roaming`     | loop   | Quiet music while docked or wandering |
| `music_cruise`      | loop   | Music during autopilot travel (crossfades in) |
| `amb_ship_hum`      | loop   | Constant interior hum |
| `amb_engine_cruise` | loop   | Engine rumble layered on during travel |
| `amb_cryo_bay`      | loop   | Pod hum / breathing machines (cryo bay only) |
| `sfx_drone_hover`   | loop   | Drone hover; pitch follows speed |
| `sfx_ui_blip`       | one-shot | Menu and prompt sounds |
| `sfx_depart`        | one-shot | Autopilot engage |
| `sfx_arrive`        | one-shot | Arrival sting |
| `sfx_terminal`      | one-shot | Terminal on/off |

Optional: short AI voice clips per line. Subtitles work without them.

---

## 7. Build milestones (for Fable)

Each milestone ends with: tests passing, a playable build, a PROJECT_LOG.md
entry, and a git commit.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: Vite + TS + Vitest + ESLint, git init, folder skeleton, loop + event bus | `npm run dev` shows a canvas; `npm test` passes |
| M1 | Drone in a grey box room: input, hover controller, collision, follow camera | Moving around feels good; no clipping through walls |
| M2 | Full ship in grey boxes from `shipLayout.ts`: 5 rooms, corridors, windows | Every room reachable; content validation tests pass |
| M3 | Interaction + helm + destination menu + ShipState | Can pick a destination and engage autopilot |
| M4 | SpaceScene, layered render, TravelDirector, cinematic camera, arrival | Stars visible through windows; can roam during cruise; arrival changes the view |
| M5 | Terminal + PuzzleRegistry + placeholder overlay; NarrativeDirector + subtitles | Full v0 loop playable start to finish in grey boxes |
| M6 | Art + atmosphere: CC0 models, lighting, cryo pods, audio manager wired to your files | Ready for the vibe test |
| M7 | Title/pause menus, performance pass (60 fps), playtest against PRD success criteria | v0 complete |

M5 is the first point where the whole loop can be judged. If the feel isn't
working there, we adjust before spending time on art.

---

## 8. Risks

- **The vibe is subjective.** Mitigation: grey-box playtests from M1 onward,
  with tuning values kept in config so changes are quick.
- **Mixing CC0 packs** from different authors can look inconsistent.
  Mitigation: pick one main kit for the interior, keep the rest minimal, and
  unify the look with lighting and color.
- **Layered rendering (D2)** can show seams at window edges or a camera
  mismatch. Mitigation: prototype it early in M4 and fall back to a cubemap
  skybox if needed.
- **Browser audio autoplay rules:** audio can only start after a user click.
  The title screen "Start" button unlocks it.
