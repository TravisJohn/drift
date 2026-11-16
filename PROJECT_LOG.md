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

---

## 2026-11-15 - M5 complete: terminal, puzzles seam, ship AI voice

**Milestone M5 done - the full v0 loop is playable in grey boxes.**
190 tests passing; lint, types, production build clean. Verified in the
browser by stepping the simulation: greeting on start, terminal overlay
opens/completes/closes with its AI lines, departure/locked-helm/cruising
lines in order during travel, arrival line when docked at Aurelia.

- `learning/puzzleModule.ts` + `puzzleRegistry.ts` (D5): the plug-in seam
  for the AWS MLE side quest. The game only knows "mount a module into an
  overlay"; adding a real question bank later touches no movement, camera
  or travel code (PRD criterion 4). Registry is fail-loud.
- `learning/placeholderPuzzle.ts`: one canned drill card + "Log session",
  proving the seam end to end. Content deliberately placeholder (PRD).
- `ui/puzzleOverlay.ts`: terminal modal in the destination-menu family;
  owns Esc-to-close and always unmounts the module on close.
- `content/aiLines.ts` (D4): the ship AI's lines as data, grouped by
  trigger (started/departed/cruising/arrived/helmLocked/terminalOpened/
  terminalComplete), {destination} templating, delays, validation.
- `narrative/narrativeDirector.ts`: pure; queues lines per trigger with
  per-trigger cooldown (anti-nag), rotation for variety, duration from
  line length, a beat of silence between lines. update(dt) returns the
  current subtitle; HUD shows it lower-third, italic.
- game.ts: terminal interactable from the layout's 'terminal-lab' prop;
  trying the helm mid-flight now gets an AI line instead of silence.
- Note: the embedded preview pane fully pauses rAF while hidden, so this
  round was verified by stepping game.update() manually - worth keeping as
  a technique, it exercises the same code the loop runs.

Next: M6 - art and atmosphere: CC0 models (ASSETS.md credits), lighting
pass, cryo pod detail, audio manager wired to author-supplied files in
public/audio/ (silent with a console warning when files are missing).

---

## 2026-11-15 - M6 complete: procedural art, atmosphere, audio manager

**Milestone M6 done.** 211 tests passing; lint, types, production build
clean. Verified in the browser: cryo pods read as glass pods with a soft
breathing glow, stars through the window behind them, console screens lit,
and exactly one "running silent" console warning per missing audio file.

- Decision: art is procedural, not downloaded. The author chose code-built
  detail over pulling a CC0 pack; swapping in CC0 models stays possible
  later (ASSETS.md deferred until real third-party assets exist).
- `world/ship/propVisuals.ts`: each prop kind is now a small assembly
  (pods: frame + glass canopy + breathing sleeper light at ~10 breaths/min;
  consoles: angled glowing screens; reactor: core, glow band, containment
  rings; crates: lids + straps; seats). Everything stays inside the same
  box collider footprint, so collision is untouched.
- shipBuilder: ceiling light strips per room (visible glow sources), the
  cryo strip breathes with the pods, engineering's light flickers subtly
  (two incommensurate sines, deterministic). ShipWorld gained update(t).
- Drone got a forward headlight - a small pool of light it carries through
  dark rooms.
- `content/audioManifest.ts` (D4) + `audio/audioManager.ts`: 10 keys per
  the architecture. Loops fade in/out (2.5s), one-shots fire, per-loop
  gain lets hover volume follow drone speed and the cryo-bay room tone
  swell only inside the bay. Everything waits for the first click
  (autoplay rules). Missing files warn once each and stay silent (PRD).
  The element factory is injectable; tests run on fakes.
- `public/audio/README.txt` lists the exact filenames to drop in.
- Glow tuning pass after first screenshots: pod/console emissives halved -
  first version read as "lit aquariums".

Next: M7 - title/pause menus (AppState), favicon, 60fps performance pass,
playtest against the PRD success criteria.

---

## 2026-11-15 - M7 complete: title, pause, favicon, performance - v0 done

**Milestone M7 done - v0 is complete.** 223 tests passing; lint, types,
production build clean; zero console errors on a fresh load (favicon 404
fixed with an SVG icon).

- `state/appState.ts` (D3): Title -> Playing <-> Paused, pure and guarded
  like the other machines. The loop always renders; the simulation only
  advances while playing - on title/pause, time stands still but the pods
  keep breathing and audio fades keep moving so nothing pops.
- `ui/titleScreen.ts`: DRIFT over the dim, already-rendered ship, one line
  of fiction, Begin. The Begin click is the user gesture: it unlocks
  audio, starts the session (app:started) and captures the pointer.
- `ui/pauseMenu.ts`: Esc pauses while roaming; panel shows a controls
  reminder; Esc or Resume returns. A one-step "overlay just closed" guard
  stops the Esc that closes any overlay from immediately re-pausing.
- New events: app:paused / app:resumed (documented in the catalog).
- Performance: structural meshes now share one unit BoxGeometry (scaled
  per box) instead of ~150 geometries; a rolling fps probe is exposed at
  window.__drift.debugSnapshot.fps. Measured 60.0 fps in the embedded
  pane while displayed, full scene. Criterion 3 still needs the author's
  machine for the final word.
- Verified in-browser: title -> Begin -> greeting; Esc opened the pause
  menu with the sim provably frozen (star drift unchanged over 120 steps);
  Esc resumed without re-pausing; journey continued to cruising after.
- Synthetic-event note: the pause menu listens on document; keyboard
  events dispatched on window never reach it. Real keys hit both.

### PRD success criteria at v0

1. Feel (author judges, ~10 min session at localhost:5173): OPEN - the
   only remaining line item, and the whole point.
2. Loop works end to end, no dead ends: PASS (verified repeatedly).
3. Steady 60 fps: PASS in the embedded pane; confirm on target laptop.
4. Extensible puzzles without touching movement/camera/travel: PASS by
   construction (M5 seam; PlaceholderPuzzle proves it).
5. Core logic tested: PASS - 223 tests across loop, events, input,
   physics, drone, camera, layout, builder, travel, states, interaction,
   narrative, puzzles, audio, UI.

v0 complete. Remaining for the author: supply audio files (public/audio/
README.txt), playtest the vibe, then decide what Drift becomes next.

## 2026-11-16 - Audio accepts ogg, mp3 or wav

**Change after v0, at the author's request** (their files are MP3/WAV,
the loader only looked for .ogg). 230 tests passing; lint, format, types
and production build clean.

- `content/audioManifest.ts`: each sound now lists candidate files, one
  per format in `AUDIO_EXTENSIONS` (ogg, mp3, wav - that order is the
  preference when several formats of one key exist). `AudioSpec.file`
  became `AudioSpec.files`; validation also rejects an empty candidate
  list.
- `audio/audioManager.ts`: when a candidate fails to load the manager
  moves to the next one; the single "running silent" warning is logged
  only after every format failed, and now names all files tried. A loop
  that should be sounding resumes on the fallback file; a one-shot is not
  replayed late. A stale failure report (one bad file can report twice:
  error event plus rejected play()) cannot skip a format.
- Trade-off: with no files present the browser makes three requests per
  sound instead of one (30 at startup). Harmless at this scale; the
  alternative, a build-time file listing, was not worth the machinery.
- Risk noted in the README: mp3 padding can make loops gap slightly;
  ogg or wav is the fix for any loop that clicks.
- Verified in-browser against the dev server with a temporary silent
  probe wav (removed afterwards): ogg and mp3 failed, wav loaded with no
  warning; a key with no files warned exactly once.
- Docs: public/audio/README.txt and ARCHITECTURE.md section 6 updated.

## 2026-11-16 - Audio: a folder per moment, changeable while the game runs

**Author request:** "freely upload and delete files without stopping the
game". Their four tracks also had their own names (Deep Field.mp3 ...), so
the fixed-filename scheme from earlier today could not find them. This
replaces it. 285 tests passing; lint, format, types and build clean.

Decisions (author-approved via questions in session):
- **Folder per moment.** Each manifest key is a folder under public/audio;
  any ogg/mp3/wav dropped in, under any name, plays for that key. This
  supersedes the per-key filename candidates added this morning.
- **"All four everywhere".** A shared `music/` folder feeds every music key
  without files of its own; the author's four tracks were moved there.

How it works:
- `tools/audioLibraryPlugin.ts` (new, Vite plugin): scans the folders,
  serves the listing at /audio/library.json, creates missing moment
  folders at dev start, and pushes a fresh listing over Vite's HMR channel
  when files change (300 ms settle so a burst of copies sends once). At
  build it writes the listing into the bundle. Each URL carries a version
  (mtime + size), so a file replaced in place reads as a new track.
- `audio/audioLibrary.ts` (pure, shared by plugin and game): build, parse
  and resolve the listing. `audio/audioLibrarySource.ts`: startup fetch
  plus pushed updates; a slow fetch never overwrites a newer push.
- `audio/trackRotation.ts` (pure): play order within a folder; survives
  the list changing under it; skips files that failed.
- `audio/audioManager.ts` rewritten around `setLibrary()`: only folders
  that changed are touched; a track still present keeps playing; deleting
  the playing track cuts it and fades the next in. Several files in a loop
  folder form a playlist; one file loops natively.
- Keys that resolve to the same folder share one voice and their volumes
  sum, so the shared playlist carries straight through roaming -> cruise
  at a level volume instead of restarting.

Trade-offs and risks:
- Live changes are a dev-server feature. A production build is static: it
  plays what was in the folders at build time.
- Two keys on one voice must both be loops or both one-shots; the manifest
  validator enforces it.
- A play() rejected because pause() interrupted it (AbortError) is no
  longer treated as a broken file; any other rejection still is.
- Missing-sound warnings are now per sound with an empty folder (once,
  and again if its files are later all deleted), since "missing file" has
  no meaning when file names are free.
- New dev dependency: @types/node (the plugin uses the file system).
- Audio files in public/audio are untracked and were not committed; there
  is no .gitignore rule for them yet (author's call).

Verified in-browser on the dev server: with the four tracks in music/,
Begin started "Deep Field (1).mp3" and faded to 0.5; moving that file out
of the folder switched to "Deep Field.mp3" with a fade-in and no page
reload; moving it back raised the playlist to four tracks without
disturbing the track playing.

## 2026-11-16 - Visual pass 1 of 2: space, bloom and tone mapping

**Author feedback after first look:** "very plain, the stars do not look
like stars, the shapes are literally very plain". Scope agreed in session:
full pass, still procedural. This entry is the space half. 302 tests
passing; lint, format, types and build clean.

- **Why the stars looked wrong:** they were square, untextured points, all
  one colour and one size, and near ones grew to 30 px blocks.
- `world/space/starLook.ts` (new): one star look shared by both star
  layers. Pure generator for size (steep power law: mostly faint, a few
  bright), tint (blue-white to red, weighted) and twinkle phase; a point
  shader draws each as a soft round glow, sized in true perspective and
  faded rather than shrunk below 3 px so it does not shimmer.
- `world/space/skyDome.ts` (new): the distant sky. 4200 stars on a far
  sphere (no parallax, so they read as far away), 45% gathered into a
  tilted galactic band, over a shader nebula (teal/violet/amber clouds,
  band glow, dust lanes, dithered against banding).
- `world/space/starfield.ts`: the old layer stays as the near stars that
  slide past in travel, now fewer (900) and smaller, using the new look.
- `world/space/bodyMaterials.ts` (new) + `celestialBodies.ts`: per-pixel
  procedural bodies. Aurelia is a banded ice giant with an atmosphere rim
  and ringlets that carry the planet's shadow; Cinder is a boiling red
  sun with limb darkening and a corona; Anchorage is a station with a
  turning habitat wheel, lit windows, solar wings and a blinking beacon.
  One shared light direction and clock for all of them.
- `rendering/renderPipeline.ts` (new): the layered draw (space, clear
  depth, interior) now happens in an offscreen HDR frame with 4x MSAA,
  followed by bloom and ACES tone mapping. D2 is unchanged: space still
  shows only through real window openings.
- `rendering/glslNoise.ts` (new): the one noise chunk every shader uses.
- Tuning lives in gameConfig: `space.sky.*`, `space.star*`, `rendering.*`.

Trade-offs and risks:
- Bloom plus an HDR offscreen frame costs GPU time. Still to be confirmed
  on the author's laptop against the 60 fps criterion; `rendering.
  msaaSamples` and `bloomStrength` are the levers if it dips.
- ACES tone mapping changes every colour in the game, interior included;
  interior lighting is retuned in pass 2.
- Shader code is not unit-testable in jsdom. Tests cover the generators
  and the wiring (sizes, colour spread, band density, ring shadow
  tracking, shared clock); the look itself was checked by eye in-browser.
- Anchorage station radius went 10 -> 15 so it reads from the windows.

## 2026-11-16 - Visual pass 2 of 2: ship interior, baked lighting, performance

The interior half of the beauty pass, and a performance rework it forced.
341 tests passing; lint, format, types and build clean.

What the ship gained:
- `rendering/panelTextures.ts` (new): hull-plate surfaces generated from
  pure pixel functions (no canvas, no image files): plates, seams, rivets,
  brushed grain, as a colour map and a normal map per surface kind.
- `world/ship/boxesGeometry.ts` (new): structure merged into one mesh per
  surface kind with world-space texture coordinates, so plates never
  stretch and seams line up across wall pieces. Faces can be split into
  small cells for lighting detail.
- `world/ship/trim.ts` (new, pure): baseboards with an ankle-height guide
  light, ceiling coves, frames round every window and door, a light bar
  over each doorway, and glass in the windows. Visual only, no colliders.
- `rendering/environment.ts` (new): a small baked reflection map so metal
  has something to mirror.
- Drone: a soft ground shadow that fades with height.

The performance finding (measured, not guessed):
- The embedded pane on this machine renders on integrated Intel UHD P630
  graphics. The first interior build (live shadows from 8 room lights,
  4x MSAA, live nebula shader) took about 50 ms a frame at 1024x768;
  60 fps needs under 16.7.
- Costs found by switching features off one at a time, in ms per frame:
  4x MSAA on the HDR frame ~10; live nebula noise ~9; soft shadows ~9;
  drawing hidden walls before visible ones (overdraw) ~6; the 8 room
  lights ~6; a roughness/metalness texture ~2.

Decisions that came out of it:
- **Room lighting is baked** (`world/ship/bakedLighting.ts`, new). Light
  and shadow from every room light are computed once at startup for each
  vertex (ray against the ship's own collider boxes) and added in the
  shader as diffuse light. Zero cost per frame, real shadows from props
  and walls, and light no longer leaks through walls. The engineering
  flicker survives as a multiplier on that room's baked share.
  `ShipWorld.lightWaver` replaces the old flickering PointLight.
- **Depth pre-pass** (`rendering/interiorPass.ts`, new): solid surfaces
  write depth first, so hidden pixels are never lit.
- **Nebula baked** to a background texture at startup (`SkyDome.
  bakeNebula`).
- **FXAA replaces MSAA**; canvas anti-aliasing off.
- **Adaptive resolution** (`rendering/adaptiveResolution.ts`, new, pure):
  lowers the drawn pixel count when frames run slow and raises it again
  after holding steady, so weak hardware gets a softer picture instead of
  a slow one. Pixel ratio is also capped at 1.25.
- Result here: about 13-16 ms a frame at 1024x768, down from ~50.

Trade-offs and risks:
- Baked light is per vertex on 0.25 m cells: shadow edges are soft and
  slightly blocky up close. `rendering.lightCellSize` tunes it.
- Baked light is diffuse only; room lights give no specular highlight.
  The reflection map and the drone's own (live) lights cover that.
- The bake hooks into Three.js shader include names. A Three upgrade that
  renames them throws at material compile rather than failing silently
  (covered by a test).
- Anything added later that should cast a shadow must be in the collider
  list; anything see-through must have `transparent` or no depth write, or
  the pre-pass will let it hide what is behind it.
- Frame times were measured in a hidden embedded pane with a forced GPU
  sync; treat them as relative. PRD criterion 3 (steady 60 fps) still
  needs the author's eyes in a normal browser window, where a larger
  window will make adaptive resolution do more work.
- The exterior hull (cinematic shot) was not touched in this pass.

## 2026-11-16 - Music over the intercom, engine that follows speed

**Author request:** music should sound like a radio/intercom; the engine
should make travel feel real. Author chose to supply engine and hum files
themselves, so nothing is synthesised and the silent-when-missing rule is
unchanged.

- `audio/intercomEffect.ts` (new): Web Audio chain for music only -
  band-limit (280 Hz to 3.4 kHz), a nasal presence peak, gentle speaker
  overdrive, a little dry signal mixed back, and a static bed that follows
  the music level. Other sounds stay full-range so the ship feels close
  and the music feels piped in. Tuning in `gameConfig.audio.intercom`
  (`enabled: false` turns it off).
- `AudioManager` gained an element hook (called once per element with its
  category - how music is routed without the manager knowing about
  effects), `setLoopRate` (speed and pitch) and `categoryLevel`.
- The engine loop (`amb_engine_cruise`) now follows the ship's speed:
  quieter and lower-pitched at a standstill, rising to full at cruise
  (`engineIdleGain`, `engineIdleRate`). It needs a file in its folder to
  be heard.
- Where Web Audio is missing the music plays unprocessed and says so once.

Verified in-browser: audio context running, music playing through the
chain, static level tracking the music fade. Not verified by ear - the
effect's character is the author's call; all values are in the config.

## 2026-11-16 - Ship dashboard: bridge holo-table, forward view, hologram

**Author request:** a dashboard the drone can use, showing travel through
space with holographic detail about the ship, to become the entry point
for AWS training later. Choices made by the author in session: a new
holo-table on the bridge (helm and lab terminal unchanged), and a forward
view from the bridge rather than an outside view. 389 tests passing.

- New prop kind `holotable`, placed behind the helm seat (`id:
  'dashboard'`), with its own interactable and prompt.
- New player mode `atDashboard`; events `dashboard:opened` / `:closed`;
  two new ship-AI lines.
- `travel/dashboardCamera.ts` (pure): a fixed view from the bridge looking
  ahead through the main viewport, with a few centimetres of sway. Stars
  come toward the viewer during travel. The interior is still drawn, so it
  is a view *from* the ship.
- `world/ship/shipHologram.ts`: the ship as glowing outlines, built from
  the layout so it cannot disagree with the real ship. It floats small
  over the table, and large in front of the view while the dashboard is
  open. The selected compartment lights up; a marker shows the drone.
- `ui/dashboardModel.ts` (pure) + `ui/dashboardOverlay.ts`: holographic
  panels - journey and systems (live), compartments (W/S or arrows), and
  training. `content/shipSystems.ts` holds the words.
- **Training entry point:** the dashboard lists every module in the
  PuzzleRegistry and launches it in the existing overlay (T, Enter or
  click). Registering a real AWS module makes it appear here with no
  other change. `openTerminal` now takes the module id.
- `rendering/screenTextures.ts`: generated display content. Every console
  screen now shows a readout (rows, bar chart, trace) instead of a flat
  glowing slab; the holo-table shows a projector grid.
- The controls hint now hides whenever an overlay is open.

Trade-offs:
- Vessel name "RV Drift" and the compartment readouts are invented
  content; they live in `content/shipSystems.ts` for the author to edit.
- Systems rows other than journey, autopilot, reactor and pod count are
  fixed text; there is no simulation behind them yet.
- While docked the stars are still (D2: the ship never moves). The view
  comes alive during a journey.
