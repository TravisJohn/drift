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

## 2026-11-16 - Drop-in art folders and prompts for outside AI tools

**Author request:** make the ship more sci-fi; the walls are "a bit sad".
Asked which direction to take, the author instead chose to have outside
AI tools make the art and asked for prompts. This **reopens the earlier
decision** "art is procedural, no downloaded asset packs": generated art
supplied by the author is now welcome for surfaces. The built-in
procedural look remains the fallback, so the game still needs no files.
406 tests passing; lint, format, types and build clean.

- `public/art/wall|floor|ceiling/`: drop one image in a folder (any file
  name; png, jpg or webp) and it replaces that surface everywhere on the
  ship. Optional second and third images are recognised by name: "normal"
  for relief, "glow" or "emissive" for parts that should shine.
- `content/artManifest.ts`: the surfaces, formats and the file-name rules
  (pure, tested). `art/surfaceArt.ts`: loads the textures; when no relief
  map is supplied, derives one from the picture's brightness (pure
  function, tested), so painted seams still catch light.
- `ShipWorld.applySurfaceArt`: swaps the maps on the existing material.
  Baked lighting is untouched, so supplied art is lit and shadowed exactly
  like the built-in panels. A wall picture runs floor to ceiling once and
  repeats every 3.2 m; sizes are in `gameConfig.art.tileSize`.
- `tools/artLibraryPlugin.ts` + `tools/mediaScan.ts`: the audio plugin's
  folder scan, made shared. Serves `/art/library.json`, creates the
  folders, reloads the page when art changes (dev), writes the listing
  into a build.
- `ART_PROMPTS.md` (project root): paste-ready prompts for the three
  surfaces with the rules that make an image usable as a game texture, a
  style block with two alternatives, how to make a glow map, sound prompts
  for the eight empty audio folders, and how to check a result.

Verified in-browser with two throwaway generated images (removed again):
the picture appeared on every wall floor-to-ceiling, its glow strip
bloomed, lighting and shadows were unchanged.

Trade-offs and limits (also listed in ART_PROMPTS.md):
- One picture per surface for the whole ship; per-room art would need the
  walls split by room.
- Not loadable yet: 3D models for props and the drone, the outer hull,
  console screen pictures.
- A supplied glow map adds one texture read per pixel on that surface
  (about 1 ms a frame on integrated graphics). Pictures over 2048 px log
  a warning.
- No procedural sci-fi pass on the walls was done in this session beyond
  the console readouts and the holo-table: the author's art decides the
  look. Structural additions (ribs, per-room accent lighting, which cost
  nothing per frame once baked) remain an option.

## 2026-11-16 - Performance: resolution chosen by measurement, cheaper glow, F2 readout

**Why:** on integrated graphics the game started at full sharpness, ran
slow, and only crept toward a workable resolution over many seconds, with
a hitch at every step. 428 tests passing; lint, format, types and build
clean.

- `rendering/renderScale.ts` (pure, tested): from two timed frames (the
  sharpest and the softest setting) it solves for the sharpest setting
  that fits a time budget. Cost is modelled as a fixed part plus a part
  per pixel; a pixels-only guess picks a setting that is too slow.
- `RenderPipeline.measureFrameMs`: draws real frames and waits for the
  graphics chip to finish each one. Blocking by design; runs once at
  startup and half a second after a window resize.
- `AdaptiveResolution.calibrate`: starts from the measured setting and
  treats it as the ceiling, so the game no longer tries sharper settings
  that were just measured to be too slow. It still lowers the resolution
  when a heavier view runs slow, and returns to the ceiling afterwards.
- Glow is worked out on a smaller image
  (`gameConfig.rendering.bloomResolutionScale`). At full size it was
  close to half the frame's cost on integrated graphics.
- The renderer now asks for the fast graphics chip on machines with two
  (`powerPreference`). It is a request; Windows and the browser decide.
- F2 shows a readout: frame rate, drawing resolution, graphics chip. The
  chip and the chosen setting are also written to the console once. F2 is
  listed in the pause menu.
- Tuning: `minScale` 0.6 to 0.5, `holdSeconds` 6 to 20, new `budgetMs` 11
  and `calibrationFrames` 8, all in `gameConfig.rendering.adaptive`.

Verified in the embedded preview (Intel UHD Graphics P630, 1024x768): a
full-sharpness frame measured 19.6 ms, the game chose 0.60x, and a frame
at that setting then measured 11.1 ms against the 11 ms budget. No
console errors; the readout shows and hides on F2.

Trade-offs and limits:
- Measuring blocks for roughly a third of a second at startup and after
  each resize.
- The measurement is of the view on screen at that moment. Heavier views
  are covered by the budget sitting below 16.7 ms and by the running
  adjustment, not by measuring them.
- The frame rate in the readout could not be checked in the embedded
  preview, which throttles animation while hidden. It needs a look in a
  normal browser.
- Not verified: whether a normal browser on the author's machine gets the
  dedicated graphics chip. The F2 readout answers that.

## 2026-11-16 - Sci-fi interior: frames, per-room light, bulkhead walls

**Author request:** make it more beautiful; "the walls should look sci-fi
and not sad". No art had been dropped into `public/art/`, so the built-in
look was still big blank plates. This pass rebuilds that built-in look.
Supplied art still replaces the wall picture if it is ever added.
454 tests passing; lint, format, types and build clean.

- `world/ship/frames.ts` (new, pure, tested): structural frames worked
  out from the floor plan. A rib stands against the wall about every 2 m
  with a strip of light set into its face; a beam crosses the ceiling at
  the same positions, so the corridor reads as a run of portal frames. A
  rib is left out wherever it would stand in or crowd a door or window.
- Every room now has its own colour of light (`ROOM_ACCENT` in
  `shipBuilder.ts`): bridge blue, corridor cyan, lab green, cargo amber,
  cryo ice, engineering orange. It colours the rib strips, the guide
  light along the foot of the walls (now one per wall face, so the two
  sides of a wall can differ), and a small baked glow around each rib.
  The cryo bay's strips breathe with the pods.
- `rendering/panelTextures.ts`: the wall is now a designed bulkhead
  instead of a 2 x 2 grid of plates. Dark kick band with louvred vents,
  tall panels with cut corners, service strips with hatches, bolts and a
  painted tag, header band with air grilles. The bands change at the
  window sill and head, taken from the layout, so panelling and windows
  line up. Because room light is baked and ignores the normal map, the
  colour map carries its own top-down shading on panel edges.
- Ceiling plates are larger with a framing groove (it read as office
  tiles before).
- New `gameConfig.interior` (frame spacing, light levels, glow strength
  and reach) and `gameConfig.rendering.wallTextureSize` (1024).
- `ART_PROMPTS.md` and `public/art/README.txt`: the wall prompt no longer
  asks for painted ribs, since built ribs now stand in front of the wall.

Cost, measured in the embedded preview (Intel UHD Graphics P630,
1341x845):
- Per frame: about 0.2 ms. Switching back and forth in one session
  between the new look and an approximation of the old one (ribs and
  strips hidden, 256 px wall texture), six rounds over four views:
  13.81 ms against 13.55 ms. Single readings on this machine wander by
  more than a millisecond, so this is within the noise. A first
  before/after taken across two page loads read 3 to 4 ms worse and was
  wrong for that reason.
- Startup: building the ship takes about 550 ms, up from about 200 ms.
  Half is the larger wall texture. Texture generation and the light bake
  were tightened in this pass (no per-pixel allocations; lights out of
  range are rejected before the square root); before that it was 820 ms.

Verified by eye in every room from fixed viewpoints, before and after.

Trade-offs and limits:
- Ribs and beams are visual only, like the rest of the trim. They stand
  6 to 10 cm proud of the wall and 8 cm below the ceiling, so the drone
  can brush into them slightly.
- Where a door or window takes a rib's place, the ceiling beam above
  still runs, without a leg under it.
- One wall design serves the whole ship and is mirrored on facing walls,
  so it carries no lettering. Per-room wall designs would need the walls
  split by room.
- Engineering reads darker than before: its walls are mostly window, and
  the kick and header bands are darker than the old plates.
- Not checked: the look in motion at full frame rate in a normal browser.
  The preview pane was hidden, so pictures were taken as still frames.

## 2026-11-16 - Mouse look: hold the right button and drag

**Author request:** look around by holding the right mouse button and
dragging, while WASD keeps moving the drone. Drag left-to-right to see
what is on the left, right-to-left for the right, top-to-bottom for the
ceiling, bottom-to-top for the floor. 468 tests passing; lint, format,
types and build clean.

- This **replaces** click-to-capture. The game no longer takes the mouse
  pointer away: it stays free, so menus and panels can be clicked at any
  time.
- `core/input.ts`: a look drag starts with a right-button press on the
  game view and ends on release, on losing focus, or when a movement
  arrives with the button no longer held (released outside the browser
  window). The left button does nothing here. The browser's right-click
  menu is suppressed over the view.
- `player/followCamera.ts`: a look style decides which way the view turns
  for a drag. `grab` (the default, as requested) moves the scene with the
  mouse; `turn` is the opposite, the view following the mouse. Set in
  `gameConfig.camera.lookStyle`.
- Tuning in `gameConfig.camera`: `lookSensitivity` 0.0023 to 0.005 (half
  a turn in about 600 px of drag; a drag cannot run past the screen edge
  the way a captured mouse could) and `pitchMin` -0.5 to -1.1, so the
  view can tip far enough up to see the ceiling overhead.
- The pointer shows a closed hand while dragging. The controls hint and
  the pause menu name the new control; the hint hides after the first
  look instead of after the first click.

Verified in the embedded preview by sending the game right-button press,
drag and release events: the view turned left, right, up and down as
described, stopped on release, ignored movement without the button, and
a real right click opened no browser menu.

Trade-offs and limits:
- The view stays where it is left, and WASD stays relative to the view
  (unchanged): after looking behind, W flies that way. A look that
  springs back on release was not built.
- Looking straight up puts the camera under the drone, so the drone sits
  in the middle of the picture. That is the third-person camera, not a
  fault of the drag.
- Not checked: a real right-button drag by hand. The preview tooling can
  only left-drag, so the drag was driven by synthetic events. It needs a
  try in a normal browser, including on a laptop trackpad, where a
  right-button drag is awkward.

**2026-11-18 - Approved.** The author tried the right-button drag by hand
in a normal browser and confirmed it works as described. Committed as it
stands; `lookStyle` and `lookSensitivity` unchanged. Handover note: work
continues on Claude Opus from here, following the same PRD, architecture
and log.

## 2026-11-18 - Branching: checkpoints and experiment branches

**Author request:** keep what works safe, and try other looks as
experiments that can be thrown away.

- `main` holds only work the author has seen and approved. Every
  milestone and polish pass still ends with passing tests and a commit.
- **Checkpoints** are git tags on `main`, named `checkpoint-YYYY-MM-DD`
  (a `-b`, `-c` suffix for a second one the same day). Each is a fixed
  point the game can always be put back to. First one:
  `checkpoint-2026-11-18`, right after the mouse look was approved.
- **Experiments** live on branches named `experiment/<short-name>`, cut
  from `main`. Kept: merged into `main`, then a new checkpoint. Dropped:
  the branch is deleted (or kept unmerged for reference); `main` never
  sees it.
- Untracked files (the author's music, any art dropped into
  `public/art`) are not part of any branch and stay in place when
  switching.
- Backup: a private GitHub repository, TravisJohn/drift (origin),
  holds `main` and every checkpoint tag. Pushed after each commit to
  `main`; experiment branches are pushed only when worth keeping.

## 2026-11-18 - Experiment: new drone model (branch `experiment/new-drone`)

**Author request:** branch from the checkpoint and change the drone, as
a test of what the new model (Claude Opus) can do. Cut from
`checkpoint-2026-11-18`. 492 tests passing (24 new); lint, format,
types and build clean. Not merged into `main`.

The old drone was a grey squashed sphere with a ring and a dot of light.
The new one is a small "surveyor" maintenance drone with some character,
in keeping with the PRD's lonely, quiet tone:

- **Hull:** a squat two-tone body, painted off-white over a gunmetal
  belly, with an amber service stripe, a top hatch and side vents.
- **Face:** a dark glass visor across the nose with one glowing eye. It
  blinks at irregular moments (sometimes a quick double), slides into
  turns so the drone looks where it is going, and wanders slowly when
  the drone is still, as if looking around the empty room.
- **Thrusters:** four ducted fans on struts at the diagonals, glowing
  inside. They tilt so their exhaust points away from the direction of
  travel and glow brighter with speed; a hover ring under the belly
  shares the glow.
- **Antenna** with a red beacon that flashes once every 2.8 s, and a
  tool arm folded under the chin.

Code: `player/droneModel.ts` builds the geometry, `player/droneAnimation.ts`
holds the motion rules as pure functions (tested without a renderer),
`player/droneVisual.ts` applies them each frame. All colours and timings
are in a new `droneLook` section of `gameConfig.ts`. `game.ts` now passes
the frame clock to the drone.

Constraints kept:
- Looks never change collision: a test checks every vertex stays inside
  the 0.35 m collision sphere, including with the thrusters at full tilt.
- Still exactly two lights on the drone (hover glow, now under the belly,
  and the headlight, now at the eye). Lights cost every lit surface.
- Static parts sharing a material are merged: 16 meshes, about 6,000
  triangles. Measured in one page on the integrated-graphics target by
  hiding and showing the drone six times: 14.18 ms against 14.00 ms a
  frame, about 0.2 ms, within the noise.

Not checked: the drone in motion at full frame rate in a normal browser.
Movement and thruster tilt were checked with synthetic key presses and
the numbers read back; pictures are still frames from the hidden pane.

## 2026-11-18 - Experiment: Star Wars-style exterior and a real ship hum (branch `experiment/star-hull`)

**Author request:** after approving the new drone, change the ship's
outside to a "Star Wars vibe" (outside only, not the interior), and make
the humming louder and more realistic. Branched from
`experiment/new-drone`, so it carries the new drone too. 525 tests
passing (33 new); lint, format, types and build clean. Not merged.

### Exterior

The cinematic view (V during a journey) showed the ship as plain dark
boxes. It is now an original ship in the weathered "used universe" style
those films are known for. It does not copy any real film ship.

- **Shape from the layout** (`exterior/hullPlan.ts`, pure): rooms that
  cross the centre line form a lofted, chamfered spine, wide at the
  bridge and engine room and sloping in at the corridor, with a tapered
  prow and an engine face. Side rooms become bolted-on modules. Added on
  top: a raised bridge canopy, a dorsal ridge, a keel, radiator housings
  on the stern flanks and a comms dish on the starboard module. A test
  checks every room corner lies inside the hull.
- **Surface:** a generated plating texture (many plate sizes from
  repeated random cuts, a few darker service panels and faded
  replacement plates, seams with a lit edge, grime and streaks), and
  about 180 pieces of surface detail (plates, stacked boxes, pipe runs)
  scattered over the hull tops.
- **Lights:** the real windows glow on the outside in their room's light,
  split into panes; rows of small portholes (about half lit) give scale;
  the canopy has glazing; red port and green starboard lights swell
  slowly and white strobes double-flash.
- **Engines:** three main nozzles and two small ones with ion-blue cores
  and soft additive plumes; brightness follows the journey's engine
  output, as before.
- A faint cool fill light, part of the exterior only, keeps the shadowed
  flank readable. The cinematic orbit pulled back from 30 m to 46 m (and
  9 m to 12 m high) so the larger ship fits the frame.
- Cost, measured in one page by showing and hiding the ship six times:
  3.51 ms against 2.64 ms a frame, about 0.9 ms, in a view that skips the
  interior (about 14 ms) entirely. Building it adds about 50 ms at
  startup. Seven meshes plus five light bulbs.

### Hum

`public/audio/amb_ship_hum` is empty, so the ship hum has been silent all
along; turning it up would have changed nothing. `audio/shipHum.ts` now
synthesizes one live with Web Audio, no file involved:
- electrical: a 55 Hz hum with harmonics, two detuned copies beating
  slowly so it never sounds like a test tone;
- air: deep filtered brown noise with a slow breathing swell
  (ventilation);
- rumble: sub-bass tone plus very low noise, quiet when docked and rising
  with the engines during a journey.
It grows louder toward the engine room. Levels in
`gameConfig.audio.shipHum`; `enabled: false` turns it off.

Flagged against the hard constraints: the game used to be fully silent
with no audio files. It now always hums. The rule itself still holds -
a missing file still logs one warning and plays nothing - and the hum is
code, not a committed audio file. If the author wants silence without
files, set `shipHum.enabled` to false.

Also: `mulberry32` moved to `core/random.ts` (starfield re-exports it)
and the blink shape to `rendering/pulse.ts`, shared by the drone beacon
and the running lights.

Not checked: the hum by ear (the Web Audio graph was confirmed running
in the page with the expected levels, but nobody has listened to it),
and the exterior in motion at full frame rate in a normal browser.

## 2026-11-18 - Going outside shows the same ship (branch `experiment/star-hull`)

**Author report:** the new exterior only appeared with V. The author
also flies the drone out of the ship and likes doing so, but out there
the ship looked like the old open-topped rooms. Inside and outside must
agree.

How the drone gets out: window openings have glass for looks but no
collider, so the drone can fly through any window. Kept as a feature.

- `rendering/viewMode.ts` (pure): each frame is 'cinematic', 'dashboard',
  'interior' or 'exterior'. The follow camera's position decides: inside
  the hull (`ShipExterior.contains`, from the hull plan) is 'interior',
  beyond it is 'exterior'. Between a room's wall and the hull skin still
  counts as inside, so the switch happens in open space, not inside the
  hull's thickness.
- Exterior view: the space scene is drawn from the follow camera's real
  position with the hull shown and the interior not drawn at all. The
  drone moves into the space scene while outside, so it is drawn and lit
  with the hull (its headlight falls on the plating); its deck shadow is
  hidden. It moves back on re-entry. The V shot also shows the drone when
  it is outside.
- Hull visibility is now one rule in game.ts: shown during the cinematic
  shot or while the drone's camera is outside.
- Hum: outside, in vacuum, the synthesized hum drops to 20 %
  (`shipHum.outsideLevel`): only a faint thrum through the drone's frame.
- 531 tests passing (6 new); lint, format, types and build clean.

Checked in the page by placing the drone: inside the cargo bay and just
through its window (interior view), beside the ship and above it
(exterior view, drone in the space scene). Not checked: flying out and
back in by hand at full frame rate.

Open question for the author: the drone can fly away from the ship
without limit. A soft tether (a limit on how far it can drift) would be
a small follow-up if wanted.

## 2026-11-18 - Experiment: drone tether with a red warning glow (branch experiment/star-hull)

Answers the open question above: the drone can no longer drift off
forever. Approved by the author ("a soft limit ... a red warning glow").

- `physics/tether.ts` (pure): distance is measured from the hull's
  bounding box (`hullBounds` in hullPlan), so the margin is the same off
  the nose, the sides and the stern. Config `drone.tether`:
  warn at 5 m (strain starts rising from 0), soft spring pull from 8 m
  (felt, not hit), hard stop at 12 m (held there, outward speed removed;
  sideways drift kept). Inside the ship nothing changes.
- `DroneController` takes the tether box and reports `tetherStrain` 0..1.
- Red warning (`droneVisual`, timing in `droneAnimation.warningLevel`):
  eye, stripe, beacon, thruster glow and hover light shift toward
  `droneLook.warningColor`, pulsing faster as strain grows, inside a soft
  additive red halo (hidden, so free, when there is no strain). First try
  only recoloured the eye and lights; from behind in open space that did
  not read, so the halo and stripe were added.
- Ship AI: a new `tetherWarning` line, spoken once when strain reaches
  `speakAtStrain` (0.5), re-armed after the drone comes back within reach.
- 548 tests passing (17 new); lint, format, types and build clean.

Checked in the page by placing the drone 11.5 m off the starboard side:
the spring drew it back, the drone glowed red and the AI line fired.
Not checked: flying out to the limit by hand at full frame rate.

## 2026-11-18 - Tether warning moves to the antenna, with a beep (branch experiment/star-hull)

Author feedback on the first version: the red glow was too big. Wanted
instead: the glow on the antenna, and a beeping warning sound.

- The warning now lives on the antenna only. While the drone strains at
  its tether the beacon turns red and flashes on each alarm beat inside a
  small red glow (7 cm, centred on the beacon). The eye, stripe,
  thrusters and hover light keep their normal colours; the body-sized
  halo is gone.
- `player/warningBeat.ts` (pure): one rhythm drives both the flash and
  the beep, so they land together. First beat the moment strain begins;
  then every 0.9 s at first strain down to 0.18 s at the limit, like a
  parking sensor (`droneLook.warningBeat`).
- `audio/warningBeep.ts`: a short synthesized chirp (two sines a fifth
  apart, 80 ms), rising from 1250 to 1650 Hz with strain
  (`audio.warningBeep`; `enabled: false` silences it). It is the drone's
  own alarm, so it plays outside in vacuum too. No audio file; without
  Web Audio it warns once and stays silent.
- `droneAnimation.warningLevel` removed (replaced by WarningBeat).
- 555 tests passing; lint, format, types and build clean.

Checked in the page: beeps fire and slow as the tether pulls the drone
back in; the antenna glows red. Not checked by ear: the beep's sound.

## 2026-11-18 - Command deck: the dashboard becomes the hub (branch experiment/holo-dashboard)

Author report: "I cannot set course or look at the outside view" from the
dashboard. Not a bug: set course lived only at the helm, and V only
worked in flight. The author wants the dashboard to be the entry point
for everything, holographic and polished. Plan approved before building.
Branched from experiment/star-hull, so it carries today's other work.

- Tabs: Navigation, Cameras, Ship, Training (keys 1-4, A/D or arrows,
  or click). Live journey and systems stay in a status column beside
  them; the ship hologram floats in the middle as before.
- Navigation: a star chart (SVG) of the known places with the route to
  the chosen destination; pick one and Engage (Enter, double-click or
  the button). It sends the same `travel:requested` as the helm, and the
  dashboard stays open to show the departure. Underway the course is
  locked, the route turns amber and the ship moves along it. Places gain
  a `chart` position in content/destinations.ts (validated 0..1).
- Cameras: "Exterior orbit" closes the dashboard and opens the outside
  view. V now works while docked too; the exterior shot ends itself on
  arrival (was: whenever docked). Hint text no longer says "in flight".
- Ship: compartments light up on the hologram, as before, but only while
  that tab shows. Training: as before; T still starts it from any tab.
- Look: cyan glass with scanlines, corner brackets, a slow scan sweep,
  flicker-in, monospaced readouts; motion off under reduced-motion.
- Structure: the overlay is a shell; each tab is a panel behind one small
  interface (ui/dashboard/panel.ts); data stays in the pure model.
- Helm (E) and the V key remain as shortcuts.
- 570 tests passing (dashboard tests rewritten for the tabs); lint,
  format, types and build clean.

Checked in the page with real key presses: opened the dashboard, chose
Cinder, Enter set the course (cruising, route locked), Cameras > Enter
opened the outside view in flight, V in and out while docked. No console
errors. Not checked: a full-size window by the author.

Also found today: the "background noise" was a copy of the game left
running in the app's hidden browser pane during testing. The pane is
closed after each check now.

## 2026-11-18 - Kept: today's experiments merged into `main`

**Author decision:** "our experiment (today) works so make it main."
`experiment/holo-dashboard` (which carries `experiment/new-drone` and
`experiment/star-hull`) was merged into `main` and tagged
`checkpoint-2026-11-18-b`. Next experiment: ship combat, on a new branch
cut from that checkpoint.

## 2026-11-18 - Experiment: tactical combat (branch `experiment/combat`)

**Author request:** let the ship fight enemy ships, as a 2D game, reusing
what we can from STARFALL (an earlier Codex cockpit shooter in
Documents/Codex). Cut from `checkpoint-2026-11-18-b`. 628 tests passing
(58 new); lint, types and build clean. Not merged into `main`.

**PRD:** section 10 added. "Combat" left the out-of-scope list; flying
the 3D ship by hand stays out of scope.

**What was reused from STARFALL:** the rules and numbers, rewritten in
TypeScript as 2D: aim-ahead (intercept) maths, swept hit tests, laser
heat and overheat, missile lock (about a second on the nose) and homing,
shields before hull with a 4.5 s recharge delay, boost energy, waves of
5/7/9 with a commander last, Rookie/Ace numbers, the sound recipes and
the shape of its tests. Not reused: its 3D projection and cockpit
drawing, its one-big-function structure, its input and loop.

**What was built:**
- A fifth dashboard tab, Tactical, offering a Rookie and an Ace raider
  patrol. Engaging opens the fight; leaving (retreat, win or loss)
  returns to the deck on the Tactical tab. Nothing carries over.
- The fight: a top-down hologram in the deck's cyan, raiders in warm
  orange. Mouse aims (the ship turns toward the pointer), W/S thrust and
  brake, A/D turn, click or Space fires, right click or R fires a missile
  once locked, Shift boosts, Esc or P pauses (Q retreats). Radar, arrows
  to off-screen raiders, lock brackets, readouts, drifting rocks that
  block shots, and the ship AI's calm combat lines.
- Design: `src/combat/` is pure rules (fixed step in, events out) plus a
  renderer and sounds that only react to events; `ui/combatOverlay.ts`
  owns the screen. The 3D view is not drawn while the fight is open, so
  the fight costs about 0.4 ms of drawing a frame.

**Checked in the browser** (pane hidden, so the loop was stepped by
hand): tab, engage, lasers kill raiders, overheat line, lock and missile
kill, pause and retreat to the deck, all three waves to a win, results,
back to the deck, and mouse aim. No console errors. Not yet played by a
person with real input, so feel and difficulty are untested.

## 2026-11-18 - Combat: a cockpit view as well (branch `experiment/combat`)

**Author request:** after seeing STARFALL's first-person cockpit again: "i
also love this format, wondering if we can have both?" 645 tests passing
(17 new); lint, types and build clean.

- One fight, two views, C switches at any time (the choice is kept
  between fights). The tactical hologram is unchanged. The new cockpit
  view is STARFALL's, ported to TypeScript: nebula, stars, ringed
  planet, sun, raiders as small 3D fighters from its vertex model,
  faceted rocks, converging laser bolts, the canopy frame and console,
  a heading-up radar, heading tape, the targeting ring that fills as a
  lock builds, target readout, and arrows to raiders out of view. The
  view banks into turns and shakes on a hit.
- In the cockpit the mouse is a flight stick (STARFALL's steering): the
  further right or left of centre, the harder the turn, with a small
  dead zone. Keys work the same in both views. No change to the rules.
- Trade-off, flagged to the author: the rules are 2D, so in the cockpit
  raiders fly on one level near the horizon. Depth comes from debris
  drifting above and below, the sky and the bank. A full 3D fight would
  mean 3D rules, a larger separate piece of work.
- Cost: about 2 ms of drawing a frame in the cockpit (the 3D ship view
  is not drawn during a fight).
- Test runner: the slow ship-building tests passed alone but timed out
  at vitest's 5 s default when the whole suite ran on a busy machine;
  `testTimeout` is now 15 s in vite.config.ts, with a comment.
- Checked in the browser by stepping the game by hand: switching both
  ways, the cockpit drawing a fight with a lock building, no errors.

## 2026-11-18 - Combat: heavier, more realistic flight (branch `experiment/combat`)

**Author feedback** after first trying the fight: "the sensitivity is too
fast. In real space i dont think a ship can move like that". 655 tests
passing (10 new); lint, types and build clean.

- Turning has inertia: the hull spins up and spins down (about half a
  second each way) and tops out at about 75 degrees a second, down from
  about 195. Mouse aim eases the nose onto the pointer and never
  overshoots (it only asks for a spin the ship can still stop from).
- Momentum carries: thrust pushes along the nose and turning no longer
  redirects the motion, so the ship drifts the old way until thrust
  changes it. A light flight computer damping bleeds drift slowly
  (about 6 s half-life). S is now retro thrusters that slow the drift to
  a stop and never push backwards. After a boost, the extra speed eases
  off instead of vanishing in one step.
- Raiders turn slower and their motion lags their nose, so they swing
  wide through turns; the commander is heavier still.
- Cockpit stick: a wider dead zone, full spin further out, and a squared
  response, so small mouse moves give gentle turns. The drawn stick now
  tilts in step with what the ship does.
- All of it is tunable in `gameConfig.combat.ship` and `.enemy`
  (turnRate, turnAccel, aimGain, thrust, drag, retroThrust, grip...).
- Trade-off: heavier flight makes the fight harder, since aiming takes
  longer and dodging needs planning. Raider difficulty was not retuned;
  the author's next playtest decides whether it needs to be.
- Checked in the browser by stepping the fight by hand: turn build-up and
  settling, drift holding its direction through a 110 degree swing,
  retros stopping the ship in about a second, stick response, raiders
  sliding, both views drawing.

## 2026-11-18 - Combat: real-space flight, no drag (branch `experiment/combat`)

**Author feedback** on the heavier flight: "the ship shouldnt hover - it
wont stop in actual life ... if you want to go back you should circle
around or look around." 658 tests passing; lint, types and build clean.

- No drag and no magic braking: nothing changes the ship's velocity but
  its own engine. Coasting keeps the speed forever.
- S is now a flip: the nose swings round to face against the drift (a
  half turn takes about 3.5 s), and W then slows the ship. Burn too long
  and it starts moving the other way. Below 5 units a second S holds.
- The engine limit is a limit on the engine, not the ship: thrust can't
  push past top speed (or boost speed), but never takes speed away, so
  the extra speed from a boost is kept until the pilot burns against it.
- The fight opens with the ship already cruising forward (120), so it
  never sits parked.
- With the nose and the motion parting ways, both views show the drift:
  a dashed line ahead of the ship in tactical; in the cockpit, a drift
  speed and "N degrees LEFT/RIGHT" readout under the heading tape, plus
  horizon markers for the drift ahead (ring with wings) and the way back
  (crossed ring; S puts the nose on it).
- Kept as game concessions, flagged to the author: the attitude
  thrusters still settle the spin when the turn keys are released; the
  arena edge is a spring-like pull, so with no drag a ship that drifts
  out is bounced back in; raiders keep their simpler grip model.
- Checked in the browser pane by stepping the fight (the pane gave the
  page 1 animation frame a second this time, a pane throttle; the fight
  itself costs 0.04 ms a step and 0.2 ms to draw).

## 2026-11-18 - Combat: forward flight redesign (branch `experiment/combat`)

**Author feedback** on real-space flight: the fight paused at random on
engage, and the ship turned far too fast. Asked for: always flying
forward, up the screen; W/S and A/D that set a speed and a drift that
stay until changed (S slows but never stops); enemies that come from
behind and the sides; a wider cockpit view with a small 2D holographic
map that shows missiles coming from the sides and the rear. Choices
made with the author: guns swivel to the mouse, speed notches, a 120
degree cockpit view plus hologram, raiders fire slow homing missiles.
684 tests passing; lint, types and build clean.

- Pause fix (committed on its own first): losing focus only clears the
  held keys; the fight pauses only when the page is actually hidden.
- The hull never turns: it always points up the map (FORWARD). The
  rotation complaint goes away with the rotation.
- Speed notches: W/S step Slow 90 / Cruise 160 / Fast 240 and never
  reach zero. A/D step a sideways drift (two notches each way, 70 each)
  that stays set. Shift boost adds 150 forward. The ship eases toward
  the set velocity at a limited acceleration. New module
  `src/combat/flight.ts` holds this as pure functions.
- Guns swivel to the mouse in both views. Aim assist, missile lock and
  missile launch follow the aim, not the hull.
- Endless space: no arena edge. Rocks left behind are recycled ahead.
- Raider missiles: slow homing (230 speed, limited turn rate, 7 s
  life). Raiders launch from 300 to 950 range. Rookie: one in flight at
  a time, every 10 to 18 s. Ace: up to three, every 6 to 11 s. They can
  be dodged with drift, outrun at Fast, or shot down with the lasers.
  The wingman calls the side ("Missile from port").
- Holographic map (`src/combat/holoMap.ts`): a ship-centred, nose-up
  disc shared by both views (bottom-left). Things out of range sit on
  the rim, missiles flash red, and a "MISSILE - PORT/STARBOARD/AFT/
  AHEAD" label calls the nearest. The cockpit's map also shows the
  view's wedge.
- Cockpit: 120 degree view, always forward. The aim ring moves along
  the horizon with the mouse, and the view banks with the drift. Red
  arrows round the edge point at missiles out of sight. The old drift
  markers and radar are gone (the hologram replaces them).
- Trade-offs flagged to the author: in the cockpit you can only aim
  inside the 120 degree view; threats behind are fought from the
  tactical view (C) or dodged. Speeds, drift and missile numbers are
  first guesses for the next playtest.
- Checked in the browser pane by stepping the fight: notches and drift
  reach the set velocities, the aim follows the mouse in both views, a
  25 s rookie fight with continuous fire reached wave 2 with two raider
  missiles launched, and both views draw the hologram and missile
  warnings.

## 2026-11-18 - Combat: raiders fly in front (branch `experiment/combat`)

**Author feedback** on forward flight: "i love it though i notice there
are no enemy ships in front". 693 tests passing; lint, types and build
clean.

- Cause, measured: raiders spent 75 to 80% of their time behind the ship
  and only about 15% inside the cockpit's 120 degree view. They chased a
  point on a ring that turned round the ship and slid forward with it,
  so they always arrived late; and a wave spawned from any side, parked
  and facing in, so the ship flew straight past the ones ahead.
- Stations: each raider holds a bearing from the nose. Most of a wave is
  spread across the arc ahead (inside the view), and a quarter sit
  behind so the tail still needs watching (rookie wave 1: four ahead,
  one behind). Stations sway and weave in and out.
- Station keeping: a raider matches the ship's velocity plus a pull
  toward its station, so it holds position instead of trailing.
- Attack runs: holding station ahead, a raider points the way the ship
  flies (away from it), so every 8 to 14 s it turns in on the ship
  (head-on from ahead), fires, and breaks off at 420 range back to its
  station.
- A wave now flies in from its stations, already moving with the ship.
- Raider top speed 300 to 360, so they get back in front after a run;
  boost (390) still outruns them.
- Result: about 70% of raider time ahead of the ship in tests, about 80%
  inside the cockpit view in a 20 s browser run. The ceiling is 75%
  ahead by design (the rear share).
- Tunable in `gameConfig.combat.enemy`: stationRange, stationSway,
  aheadArc, rearShare, paceGain, attack.

## 2026-11-18 - Combat: boost follows the drift, a hard dodge (branch `experiment/combat`)

**Author request:** a boost that speeds up a bit, not unlimited, "perfect
for hard left or right to dodge the rocks". Chosen with the author: boost
follows the drift. 697 tests passing; lint, types and build clean.

- Shift with a drift set adds 220 sideways speed toward the drift (drift
  1 goes from 70 to 290); forward speed is unchanged. With no drift it
  adds 150 forward, as before.
- The engines answer a boost at 700 (against 240 for notch changes), so
  the dodge bites within about a third of a second; after it, the ship
  eases back to its set drift at the normal rate.
- Limited: the boost bar lasts about 3.5 s and refills in about 8. Once
  empty, a new boost needs 25 energy (about 2 s), so holding Shift on an
  empty bar no longer trickle-boosts (it used to flicker back on).
- Status bar shows "+ boost" on whichever it is adding to ("Cruise ·
  Drift left 1 + boost"). The hint reads "Shift boost (toward drift)".
- Tunable: `ship.boostSide`, `ship.boostAccel`, `defence.boostMinStart`.

## 2026-11-18 - Combat: cockpit view - big console map, INCOMING, hold to drift (branch `experiment/combat`)

**Author feedback:** "THE 2D WORKS PERFECTLY!" The cockpit needed work:
the map was too small to see a missile from behind, no jets were seen
approaching, and the set drift made it hard to navigate. Choices made
with the author: a big map on the centre console; keep 120 degrees but
make raiders stand out; hold-to-drift in the cockpit. The tactical view
is unchanged.

- Cause of "no jets approaching": the 120 degree view halved how big
  everything looks; a raider on a head-on run at 400 to 800 range was a
  few pixels across.
- Big holographic map: centred on the instrument console, about a third
  of the screen's height across (shrinks on narrow screens). Blips, ship
  and label scale with it, and raiders on an attack run are ringed in
  red. It sits above the wingman's line; the "CANNONS COOLING" warning
  moved above the aim ring to make room at small window sizes.
- Raiders are drawn 1.6x their real size in the cockpit (hits still use
  the real size; the lock and aim assist cover the difference). A raider
  on an attack run gets pulsing red brackets with "INCOMING - 529 M"; out
  of view, its edge arrow flashes red.
- Hold to drift: in the cockpit A/D drift (two notches) only while held,
  and the ship glides back to straight on release. The sim takes this as
  `strafeHold` on the input (null means the tactical view's taps).
  Switching from the cockpit to tactical keeps whatever drift was held
  at that moment; from tactical to the cockpit, a set drift ends.
- 707 tests passing; lint, types and build clean.
- Tunable: `ship.holdDriftNotches`, and in the cockpit renderer
  RAIDER_LOOK and consoleMapFrame.

## 2026-11-19 - Merged: ship combat into `main` (`checkpoint-2026-11-19`)

**Author request:** "yup lets merge this, the test passed" - the author
approved the combat experiment (the 2D view after playtesting; the
cockpit rework as it stands, to be tuned on `main` or a new branch).

`experiment/combat` was merged into `main` (no conflicts; `main` had not
moved since `checkpoint-2026-11-18-b`) and tagged
`checkpoint-2026-11-19`. On the merged `main`: 707 tests passing, lint,
types and build clean. Next: the author is trying Codex for a graphics
refinement pass, on its own experiment branch cut from this checkpoint.

## 2026-11-19 - Cockpit interior (branch `experiment/graphics`)

The author chose the pilot's seat for the first graphics pass. The canopy
now has bevelled pillars and open side windows. Recessed switch panels sit
under the dashboard lip, and the centre map has a projector with a cyan
reflection across the metal. The existing flight meters sit in a recessed
display. The cockpit caches the metalwork at the current viewport size
and moves it with the existing seat sway.

All 707 tests passed. Lint, TypeScript and the production build passed.
The author playtested and approved the cockpit interior before the scenery pass.

## 2026-11-19 - Space scenery through the canopy (branch `experiment/graphics`)

A blue-violet nebula crosses the port sky. A banded gas giant sits above
the starboard horizon, with a lit limb, a night side and shadows across
its rings. Fine background stars sit behind the brighter stars that streak
during boost. The centre of the sky stays dark for tracking incoming ships.

The cockpit loads two local WebP textures (195 kB total). The clouds and
planet are pre-rendered, including the ring shadows. The planet keeps its
aspect ratio as the viewport changes. Checked the sky composition at
1280 × 720 and 400 × 900. The author playtested and approved the space scenery.
All 707 tests passed, along with lint, TypeScript and the production build.

## 2026-11-19 - Cockpit asteroids (branch `experiment/graphics`)

The cockpit rocks now show impact bowls, chipped edges and fractured strata.
Each rock keeps its simulation outline corners and spin. Small cuts between
those corners give the close-up silhouette more detail. A local WebP atlas
supplies three rock surfaces lit from eight directions. The renderer blends
adjacent directions as the rock turns, keeping the sun on the port side.
Decorative debris uses the same surfaces at its existing lower opacity.

Reviewed the materials at close and distant sizes and checked the cockpit
draw calls through the rotation wrap in both directions. The author
playtested and approved the asteroid pass before moving on to the raiders.
All 707 tests passed, along with lint, TypeScript and the production build.

## 2026-11-19 - Raider fighter silhouette (branch `experiment/graphics`)

The cockpit raider has swept wings, a glazed canopy, paired intakes and
canted tail fins. Orange intake lights face an approaching pilot. The
engine cores and their glow are visible from the rear. Regular raiders
carry oxide-red markings. Commanders have taller, gold-tipped fins.

The mesh banks into turns using the difference between heading and
velocity. It uses the existing visual span and listens to the same 2D
flight state. Reviewed front, banking and rear projections at three
distances. The author playtested and approved the fighter graphics.
All 709 tests passed, including the two new exhaust visibility and
near-plane tests. Lint, TypeScript and the production build passed.

## 2026-11-19 - Bridge instrument displays (branch `experiment/graphics`)

The three consoles under the bridge window now have dedicated 768 × 192
readouts. Port shows power bars, the helm shows a course diagram and
starboard shows a signal waveform. These are static instrument illustrations.
The screens tilt toward the approaching drone, with a dark casing and a
gentler glow so the lettering stays distinct.

Checked the original and updated displays in the running game from near the
helm. The preview HUD showed 60 fps in both samples, at 0.70× render scale
before and 0.55× after. All three labels were legible on the approach at
0.61×. All 709 tests, lint, TypeScript and the production build passed.
The author playtested and approved the bridge displays.

## 2026-11-19 - Cabin power conservation (branch `experiment/graphics`)

Every two minutes of active play the ceiling strips and wall ribs ease down
over four seconds. Baked room light and reflections fall with the fixtures.
Low light lasts fourteen seconds, then normal lighting returns over six.
Floor guides and doorway lights stay on. Screens and cryo pods keep a muted
glow, and the drone can still light its path. Pausing holds the cycle.

This is a visual experiment. The timing and minimum brightness are grouped
in `gameConfig.interior.powerSave` for playtest tuning.

Observed the first scheduled dip and recovery from the bridge. The helm
readout, hologram and floor guides were visible at the darkest point.
All 711 tests passed, along with lint, TypeScript and the production build.
The author playtested and approved the cabin lighting cycle.

## 2026-11-19 - Command deck power controls and voice (branch `experiment/graphics`)

The Ship tab now shows the time until cooldown, the low-power state and
the recovery. Cabin power controls can toggle the automatic schedule,
run a single cycle immediately or mute its voice. A new session starts
with the two-minute schedule and the voice enabled. A cycle already
announced completes even if the automatic schedule is switched off.

A bundled seven-second recording uses Flite's synthetic female SLT voice
with a filtered intercom sound. The lead-in occupies the first two seconds.
Five through one land on one-second beats before the existing lighting fade.
The voice follows the play clock when pausing or resuming.

Tested a manual cycle through countdown, conservation and full lighting
with auto off on the command deck. Verified the timing of the five recorded
beats. All 714 tests, lint, TypeScript and the production build passed.
The author's listening and dashboard playtest is pending.

## 2026-11-20 - Vesper Station blackout prototype filed for integration (standalone, not wired in)

A standalone 2D side quest for the Vesper Station destination is kept as a
reference build for later integration into the 3D game. Nothing in `src/`
uses it yet.

- `prototypes/Vesper-Blackout.html` - the whole prototype in one file, with
  four scripts: `simulation` (deck layout, patrols, detection, timers,
  reset), `renderer` (2D canvas lamp, light seeds, guard sight), `audio`
  (synth score and effects) and `controls` (input, HUD, pause).
- `prototypes/vesper-blackout.test.mjs` - 9 Node tests, run with
  `node --test prototypes/vesper-blackout.test.mjs`. All 9 passed today.
- `docs/maps/Vesper-Station.png` - approved deck plan: 16 rooms,
  26 corridors, six patrol circuits.
- `docs/Vesper-Handoff.md` - how to play it and what to check in the
  next playtest.

Gameplay: fly the drone from the western airlock and pull two of three
energy cells. Each cell needs ten uninterrupted seconds at its socket.
Then unload both cells at the airlock. If a guard's sight cone touches
the drone, the run resets. Light seeds (up to five at once, 15 seconds
each) light the deck and the seed map.

Status: the author has approved the deck plan. The revised movement,
alert speed and light seeds are waiting on another playtest.

Integration notes, to settle before any porting:
- Vesper Station already exists as a `derelict` destination in
  `src/content/destinations.ts`. Arriving there is the natural entry point.
- The `simulation` script has no DOM dependencies, so it can become a
  typed module with its tests moved to vitest. The renderer is the real
  decision. One option keeps it as a 2D "drone camera" feed inside the
  existing UI. The other rebuilds it in three.js. This choice drives most
  of the work.
- The prototype creates its own AudioContext. It should route through
  the game's audio modules rather than run a second context.
- All four files are untracked. A fresh clone of HEAD will not include
  them until they are committed.

## 2026-11-21 - Vesper Station blackout playable in the game (branch `experiment/vesper`)

The standalone Vesper prototype now runs inside DRIFT. Warp to Vesper
Station, and once docked the ship AI points at the distress beacon. The
command deck's Tactical tab (renamed "Operations" inside) then leads with
"Away mission - Vesper Station blackout". Deploying opens the drone camera
feed full-screen, the same pattern as combat. Unloading both cells or
leaving from the pause menu returns to the bridge on the Tactical tab with
an AI line. The mission stays on offer, marked recovered, after a win.

Decisions:
- Renderer: kept as a 2D drone-camera overlay rather than rebuilt in
  three.js (author's choice: playable now). The 3D view is not drawn
  while the feed is open.
- Entry: an airlock-style action on the command deck, available only while
  docked at Vesper. No automatic drop-in on arrival.
- Git: the earlier warp work was committed on `experiment/graphics`; this
  work is on `experiment/vesper`, cut from that commit.
- Audio: the blackout synth keeps its own AudioContext, like the combat
  sounds, warning beep and ship hum. This differs from the earlier
  integration note, which suggested routing through the game's audio
  modules. The game has no shared context to route into yet. The ship's
  music and ambience keep playing under the score, as they do in combat.

Modules:
- `src/content/vesperDeckPlan.ts` - rooms, corridors, sockets, patrols as data.
- `src/salvage/vesperDeck.ts` - occupancy grid, steering, sight, patrols
  (pure; built lazily on first use).
- `src/salvage/vesperRun.ts` - the rules; `step(dt, input)` returns events.
- `src/salvage/vesperRenderer.ts` - 2D lamp, seeds, guard cones, seed map.
- `src/salvage/vesperSounds.ts` - score and effects.
- `src/ui/vesperOverlay.ts` - feed, rail, keys, pause, results.
- Tuning lives in `gameConfig.salvage` and `gameConfig.audio.salvageSounds`.

Controls are unchanged from the prototype, plus M to mute. From the pause, Q
returns to DRIFT. Before deploying and after a win, Enter/Esc work as in
the dialogs. Touch controls were not carried over.

Verified: all 9 prototype tests were ported to vitest alongside new deck,
run, overlay, dashboard and player-mode tests. 752 tests, lint, TypeScript
and the production build passed. In the running game, warped to Vesper,
heard the beacon line, deployed from the Tactical tab, flew, planted a
seed, got caught (RED ALERT, reset to run 02), unloaded two cells and
returned to the bridge with the recovery line. No console errors. Moving
the drone into position for the capture and adding the two cells were set
up by script in that check, not flown by hand.

Pending: the author's hands-on playtest of the integrated mission. The
standalone mechanics playtest from the handoff is still open as well.

### 2026-11-21 — Vesper playtest fixes

- All three cells are collectible. Bring at least two back to the airlock to complete the mission.
- Opening the drone feed fades out ship music and ambience, silences cabin announcements and fades in the Vesper playlist. The ship soundscape returns when the drone comes back. The Vesper synth provides the score if no recording can play and still handles movement, extraction and patrol effects.
- The author's local copies of Deep Space Dread and Glassy Tension go in `public/audio/music_vesper/`.

### 2026-11-21 — Vesper reinforcement patrols

- Two hunter drones join the six regular patrols. One sweeps the Relay Hub, Med Bay and Switchyard. The other loops through Sorting Hall, Coolant Plant, Machine Shop and Receiving.
- Hunters have larger hooked chassis, pulsing red sensors and crimson sight cones. Their sight still follows the same wall and capture rules. The new routes keep the airlock clear and leave socket inspections with the existing patrols.
- A scripted run recovered all three cells and unloaded them at the airlock with all eight patrols active. All 756 tests, lint and the production build passed.

### 2026-11-21 — Vesper containment breach

- The third extraction triggers a siren and releases three aliens. They pursue through the corridors at 31.2 units per second, 20% above the fastest normal patrol. Contact resets the run.
- Aim with the mouse and use Space or click to fire the freeze laser. A hit stops an alien for five seconds, and bulkheads block the beam.
- The return portal starts in a random room and shifts to another every 30 seconds unless the drone is approaching in sight. The HUD shows the room, direction and countdown. Flying into the portal returns the player to the bridge with all three cells. A two-cell run can still finish at the airlock.

### 2026-11-21 — Vesper Scout and temporary deck scans

- Returning aboard with all three cells unlocks and equips the Vesper Scout. The Drone Bay on the Ship tab lets the player switch frames. The unlock and selected frame persist locally in the browser.
- The upper-right map sometimes shows the full corridor network for three seconds, including the drone and the current exit. Scans recur during the breach and can also appear when a red alert starts. The seed map returns when the scan ends.

### 2026-11-21 — Autonomous companions and docked checkpoints

- Each full three-cell return recruits another differently coloured Vesper Scout. Scouts fly their own bridge and corridor route and pause to scan the power and communications consoles. The Ship tab shows the companion roster.
- DRIFT saves the last docked location, Vesper recovery and the companion roster in the browser. Continue starts aboard at the bridge. A previous scout-frame unlock becomes the first companion.

## 2026-11-22 - Open-source release setup (0.1.0)

The author wants DRIFT public on GitHub and deployed on Vercel, with the
learning layer clearly marked as not integrated and easy to resume.

- README now has a project status table (learning layer: not integrated),
  a folder map, links to the design docs, Git-connected Vercel deploy steps
  and a contributing note.
- New `docs/LEARNING-LAYER.md`: what the learning seam already provides,
  the five steps to add a real module, and the open decisions (content and
  licensing, format, progress saving, game tie-in, terminal placement).
- `.vercelignore` keeps local soundtrack files, old copies and build output
  out of Vercel CLI uploads. Git-connected deploys already skip them because
  they are git-ignored.
- GitHub Actions CI runs tests, lint and the build on pushes to `main` and
  on pull requests (Node.js 24).
- `package.json` gained repository, bugs and homepage links.

Decisions:
- Deploy from GitHub through Vercel's Git integration, not by uploading a
  locally built `dist/`, because a local build copies the author's private
  soundtrack from `public/audio/` into the output.
- Exam question banks are copyrighted. Any learning content shipped in the
  public repo must be original or compatibly licensed.

Verified: 771 tests across 66 files, lint, TypeScript and the production
build passed. History was scanned for secrets before publishing; none found.
Existing Prettier drift in 48 older files was left alone.

### 2026-11-22 - Published on GitHub

- `experiment/vesper` merged into `main` and tagged `checkpoint-2026-11-22`
  (DRIFT 0.1.0). `main` and the tag are pushed.
- github.com/TravisJohn/drift is now public, with a description and topics.
  The first CI run on `main` passed.
- Commits carry the author's existing email; the author chose to publish
  without rewriting history.
- Pending: the author imports the repo into Vercel (needs their sign-in) and
  smoke-tests the live URL.

### 2026-11-22 - Live on Vercel

- Vercel project `drift` (Travis team) imported from GitHub `main` through
  the Git integration; Vercel's GitHub app was given access to this repo
  only. Every push to `main` now redeploys production.
- Production URL: https://drift-psi-swart.vercel.app (linked from the README
  and the GitHub repo page).
- Verified signed out: page and assets load, the bundle matches the clean
  local build, the private soundtrack paths return 404. In Chrome the title
  screen, Begin, flight and the AI line worked with no console errors, and
  Continue appeared after a reload.
- Not yet checked on the live site by hand: the warp to Vesper and the
  blackout mission.
