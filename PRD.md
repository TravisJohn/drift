# PRD - Drift (space travel game)

Status: AGREED v1.0 (2026-11-15). Decisions are recorded in section 9.
Builder: Claude Fable model, following ARCHITECTURE.md once it is approved.

## 1. Goal

Find out whether a calm, atmospheric space game can be a new way to learn.
The first question is about feel, not learning: can a browser game make
travelling through space, and walking through an empty ship alone, feel
lonely, quiet and worth staying in?

The AWS Machine Learning Engineer (MLE) training is a side quest that sits
inside that world. In this prototype it is a placeholder only.

## 2. Users

- Primary: the author, as a personal experiment and a possible study tool.
- Not targeting the public, other exam candidates, or a portfolio audience yet.

## 3. Core experience (the vibe)

- **Loneliness.** You are a small hovering maintenance drone on a large
  research vessel. The crew is in cryosleep: you can see them in their pods,
  but no one is awake. You keep the ship running while they sleep. Corridors
  hum, lights flicker, windows show slow-moving stars.
- **Travel as atmosphere, not skill.** Flight is cinematic autopilot: choose a
  destination at the helm and the ship travels there while the camera pulls
  out for a wide view of the ship moving through space.
- **Walk while you travel.** Once autopilot is engaged you can leave the helm
  and wander the ship during the trip, watching space pass by the windows. This
  is the main way the walking and flying modes connect.
- **A quiet voice.** The ship's degraded onboard AI is the only "other" on the
  ship. In the prototype it speaks through short scripted text lines, with no
  live AI.

## 4. Core features - vibe prototype (v0)

1. **Third-person drone controller.** A small hovering drone floats through
   the ship with keyboard and mouse. It drifts slightly, bobs gently, and tilts
   into turns. An orbit camera follows it and avoids walls.
2. **Ship interior with 4 rooms plus a cryo bay**, connected by corridors:
   - Bridge (helm seat, main viewport)
   - Cargo bay
   - Science lab
   - Engineering / reactor
   - Cryo bay (sleeping crew in pods; atmosphere only, no puzzle)
3. **Helm interaction.** Approach the helm, press a key, choose from 2-3
   destinations, engage autopilot.
4. **Cinematic travel sequence.** An exterior camera follows the ship through
   a small star system (planet, star, asteroid field or nebula), then you can
   switch back to the interior. The trip lasts about 60-120 seconds.
5. **Arrival.** A visible change on arrival: different planet or skybox seen
   through the windows, and a line from the ship AI.
6. **One placeholder learning terminal.** Interacting with it opens an overlay
   that says "Puzzle offline - [exam domain]". It is built behind a clean
   interface so real puzzles can be plugged in later.
7. **Atmosphere pass.** Music and ambience supplied by the author (see
   ARCHITECTURE.md for the list of tracks needed), drone hover sounds, moody
   lighting, and a few scripted AI lines. The game must run silently, with a
   logged warning, if an audio file is missing.
8. **Basic menu.** Start screen, pause, and a volume control.

## 5. AWS MLE side quest (design intent, not built in v0)

Each room maps to an exam domain and holds terminals with puzzles:

| Room        | Exam domain                         |
|-------------|-------------------------------------|
| Cargo bay   | Data preparation / engineering      |
| Science lab | Model development                   |
| Bridge      | Deployment and orchestration        |
| Engineering | Monitoring, maintenance, security   |

Solving puzzles "repairs" the ship AI, which gives the story a sense of
progress. v0 only defines the hook (interface plus one placeholder terminal).

## 6. Out of scope for v0

- Real puzzles or exam content
- Live AI or LLM features, backend, accounts, saving progress
- Manual or physics-based flying of the 3D ship, multiplayer
  (2D combat on the tactical hologram was added later; see section 10)
- Procedural galaxy, more than one star system
- Mobile or touch controls, gamepad (desktop keyboard and mouse only)
- Character customization

## 7. Success criteria

The experiment succeeds if:

1. **Feel:** after a 10-minute session, the author says it "feels lonely and
   atmospheric" and wants to keep wandering. This is the main criterion and is
   judged subjectively.
2. **Loop works:** walk → helm → autopilot → walk during travel → arrive →
   terminal, with no dead ends or soft-locks.
3. **Performance:** steady 60 fps on a mid-range laptop in Chrome or Edge.
4. **Extensible:** a new puzzle terminal can be added without touching the
   movement, camera or travel code.
5. **Tested:** core logic (state machine, interaction, travel timing, terminal
   registry) has passing automated tests.

## 8. Constraints and tech direction

Details will be confirmed in the architecture phase.

- Browser, Three.js, TypeScript, Vite; unit tests with Vitest.
- 3D assets: free low-poly sci-fi packs with a CC0 license (e.g. Kenney,
  Quaternius). Record each asset's source and license in the repo.
- Art direction: stylized low-poly with soft but moody lighting.
- No secrets are needed for v0. If they are later, use environment variables.

## 9. Decisions (2026-11-15)

- **Story premise:** the crew is in cryosleep, and the drone keeps the ship
  running while they sleep.
- **Player:** a hovering maintenance drone.
- **Walking during autopilot:** yes. This is the core link between walking
  and flying.
- **Audio:** the author supplies music and ambience. CC0 packs are used only
  for small sound effects if needed.
- **Title:** "Drift".
- **Session length:** about 10 minutes. This is a default because the author
  didn't answer; revisit after the first playtest.

## 10. Addition: tactical combat (2026-11-18)

**Author request:** let the ship fight enemy ships, built as a 2D game,
reusing what we can from STARFALL (an earlier cockpit shooter prototype).

- **Where:** a new Tactical tab on the command deck. The drone runs the
  ship's defences from the hologram; the 3D game stays calm, and combat
  lives inside a top-down holographic view.
- **Play (forward flight, revised 2026-11-18 on the author's playtest):**
  the ship always faces forward and never rotates, and it is always
  moving forward. W and S step the forward speed through notches (slow,
  cruise, fast) that stay set; S never stops the ship. A and D step a
  sideways drift (two notches each way) that stays until changed, so the
  pilot keeps navigating. Shift boosts. The twin lasers swivel to the
  mouse, so raiders on any side can be shot; they overheat. Seeker
  missiles fly after holding the aim on a raider for about a second.
  Raiders come from all sides and also launch slow homing missiles that
  can be dodged by drifting, outrun, or shot down, with a warning sound,
  an AI line and a flashing mark. Space is endless (no arena edge).
  Shields recharge after a quiet spell, then hull. Three waves of
  raiders (5, 7, 9) with a commander in the last; Rookie and Ace.
- **Two views of the same fight** (added the same day, author: "i also
  love this format, can we have both?"): the top-down tactical hologram,
  and STARFALL's first-person cockpit. C switches at any time. The
  cockpit always looks forward with a wide view (about 120 degrees); the
  mouse moves the aim ring, and a small 2D holographic map on the
  console shows everything around the ship, incoming missiles flashing.
  Raiders behind are seen on that map and are dealt with by changing
  speed, by missile, or from the tactical view. The rules stay 2D, so in the
  cockpit raiders fly on one level near the horizon rather than above
  and below; a full 3D fight would be a separate, larger piece of work.
- **Consequences:** none that last in this version. Losing or retreating
  returns to the deck; try again any time.
- **Out of scope for now:** surprise attacks during travel, damage that
  carries into the 3D ship, upgrades, saved progress.
- **Success:** the author finds a 5-minute fight fun, and leaving it puts
  them back on a calm ship with nothing broken.
