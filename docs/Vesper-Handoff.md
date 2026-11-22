# DRIFT · Vesper Station handoff

20 November 2026 · Local workspace `D:\WEB PROJECTS\game_app_poc` · Branch `experiment/graphics`

**Resume at the standalone 2D playtest.** Travis approved the one-minute warp trip and the Vesper deck plan. His first playtest surfaced two issues, awkward diagonal corridors and excessive alert speed, and he requested temporary light seeds. The revised mechanics are ready for another playtest. Integrating the side quest into the 3D game comes after approval.

## Open the right build

| File | Purpose |
| --- | --- |
| `prototypes/Vesper-Blackout.html` | Current 2D game. Open this file directly in Chrome or Edge and click **Deploy drone**. All game code and art are embedded. |
| `prototypes/vesper-blackout.test.mjs` | Standalone Node tests. Run the command below from the workspace root. |
| `docs/maps/Vesper-Station.png` | Approved reference layout with 16 rooms, 26 corridors, six patrol circuits and a breach in the north ring. |
| `Play-DRIFT.cmd` | Launcher for the separate 3D ship game. The earlier `DRIFT-Vesper.html` download also belongs to that warp build. |

```powershell
Set-Location 'D:\WEB PROJECTS\game_app_poc'
Start-Process '.\prototypes\Vesper-Blackout.html'
node --test prototypes/vesper-blackout.test.mjs
```

## What the player should experience

Start in the western airlock and head east into Receiving. Use **WASD or arrows** to move, **mouse** to aim the lamp, **E** to interact, **Q** to plant a light seed and **Esc** to pause. In a slanted corridor, hold a direction that points along the passage to follow it with one key.

- **Salvage.** Bring back any two distinct energy cells from Hydroponics, Capacitor Bank and Reserve Stores. Press E beside a socket and stay in range for ten uninterrupted seconds. Leaving range cancels partial progress. Press E in the airlock to unload and win.
- **Detection.** The shaded triangle is the guard’s forward field of view. Contact between the drone’s hull and that visible area triggers capture. Bulkheads clip the triangle. The renderer and detector use the same polygon.
- **Socket patrols.** Guards visit the actual extraction sockets as part of their loops. Each socket has both a dangerous interval and a long enough gap to finish an extraction.
- **Light seeds.** Each seed lights nearby floor in the camera view and on the top-right map for 15 seconds. The map only shows areas covered by active seeds. Any number of seeds can be planted over a run, with up to five active at once. A patroller extinguishes a seed on contact and frees its slot.
- **Alarm and reset.** Capture takes priority even on the last extraction tick. RED ALERT appears, guards move at 1.2× their normal speed for 2.2 seconds, then the drone returns to the airlock. Cargo, extraction progress, seeds and patrol phases reset.

- **Sound.** Deploy starts a quiet synth score. The thruster hum follows actual movement, the extraction tone rises during a tap, and a pulse quickens as a patroller gets closer. The **Sound** button mutes the score and effects together.

Start in `simulation` for layout, routes, detection, timers and reset. Use `renderer` for lighting and patrol visibility, `audio` for the synth score and effects, and `controls` for input, HUD and pause.

## Verification and next playtest

All **nine standalone tests passed**. They cover room and patrol geometry, steering in slanted passages, seed capacity and expiry, guard contact with a seed, detection and wall blocking, socket extraction, capture and reset, and two-cell unloading. The automated extraction tests place the drone at sockets.

1. Open the standalone HTML and try a slanted corridor by holding one movement key once inside it.
2. Plant seeds along a guard route. Check the top-right map and watch a patroller extinguish a seed. Let another seed expire and check that its patch goes dark.
3. Try a capture and a two-cell recovery with the revised movement and alert speed.

## Workspace state

The working tree contains the earlier warp work and the standalone additions. HEAD was `b497f26` at handoff. The prototype, its tests and the map are untracked, so open the **same local workspace** in the next session. A fresh clone of HEAD alone will omit them. Preserve the existing edits and keep the author's `public/audio/music/` and nested `drift/` folder out of any prototype commit.

The earlier **717 passing tests**, lint and production build were for the main 3D warp milestone. The current prototype has its own six-test command above.
