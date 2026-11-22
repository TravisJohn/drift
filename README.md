# DRIFT

DRIFT is a quiet browser space game. You are a maintenance drone aboard a research vessel whose crew is in cryosleep. Explore the ship, fly tactical combat drills, and warp to Vesper Station to recover energy cells from a station under blackout.

Built with Three.js, TypeScript and Vite. No backend, no accounts, no environment variables.

## Project status

Version 0.1.0 is a playable prototype.

| Area                                                        | State                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ship exploration, helm travel, cinematic flight             | Playable                                                                                                                 |
| Command deck (navigation, power, tactical, ship tabs)       | Playable                                                                                                                 |
| Tactical and cockpit combat drills                          | Playable                                                                                                                 |
| Vesper Station blackout away mission and companions         | Playable                                                                                                                 |
| Browser save (docked location, Vesper progress, companions) | Playable                                                                                                                 |
| **Learning layer (study puzzles at ship terminals)**        | **Not integrated.** Only the plug-in seam and a placeholder exist. See [docs/LEARNING-LAYER.md](docs/LEARNING-LAYER.md). |
| Touch and mobile controls                                   | Not supported                                                                                                            |

## Play

Use a desktop browser with WebGL, a keyboard and a mouse. Select **Begin**. Hold the right mouse button to look around, move with **WASD**, use **Space** and **Shift** to change altitude, and press **E** to interact. Press **V** to switch to the exterior view.

At the bridge command deck, set a course for **Vesper Station**. After docking, open **Tactical** and deploy on the **Vesper Station blackout** mission. The game saves docked progress and recovered companions in your browser.

## Run locally

Install [Node.js 24 LTS](https://nodejs.org/) and run these commands from the project folder.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. On Windows, `Play-DRIFT.cmd` installs dependencies when needed and opens the local game.

## Develop

```sh
npm test          # Vitest, about 770 tests
npm run lint      # ESLint
npm run build     # TypeScript check and production build into dist/
npm run preview   # serve the built dist/ locally
```

Run Prettier on the files you change rather than the whole tree, for example `npx prettier --write src/learning/myPuzzle.ts`.

Where things live:

| Folder                                         | What it holds                                                |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `src/core`                                     | Game loop, input, event bus                                  |
| `src/state`                                    | Pure state machines and the browser save (`gameProgress.ts`) |
| `src/world`, `src/rendering`                   | Ship geometry, space scene, renderer                         |
| `src/player`, `src/physics`, `src/interaction` | Drone, collisions, press-E interactions, companions          |
| `src/travel`                                   | Helm destinations, warp, cinematic camera                    |
| `src/combat`                                   | Tactical and cockpit combat drills                           |
| `src/salvage`                                  | Vesper Station blackout (pure rules, 2D renderer, sounds)    |
| `src/learning`                                 | Learning-layer plug-in seam (placeholder only)               |
| `src/narrative`, `src/content`                 | Ship AI lines and all game content as data                   |
| `src/audio`, `src/ui`                          | Sound, overlays, menus, command deck                         |
| `src/config/gameConfig.ts`                     | Every tuning number in one place                             |
| `tests/`                                       | Mirrors `src/`                                               |

More background:

- [PRD.md](PRD.md) - the original goal and scope
- [ARCHITECTURE.md](ARCHITECTURE.md) - module structure and contracts
- [PROJECT_LOG.md](PROJECT_LOG.md) - every decision and milestone, newest at the bottom
- [docs/LEARNING-LAYER.md](docs/LEARNING-LAYER.md) - how to continue the learning side
- [docs/Vesper-Handoff.md](docs/Vesper-Handoff.md) - Vesper mission design notes

## Deploy

The build is a static site in `dist/`.

**Vercel (recommended).** Import this GitHub repository at [vercel.com/new](https://vercel.com/new). `vercel.json` already sets the Vite framework preset, `npm ci`, `npm run build` and the `dist` output folder, and `package.json` pins Node.js 24. Every push to `main` then redeploys.

**Any static host.** Run `npm run build` and upload the contents of `dist/`.

### Keep local media private

Vite copies everything in `public/` into the build. Optional soundtrack files you drop into `public/audio/` are git-ignored, so Git-connected deploys never include them. A build made on your own machine does include them, so deploy from GitHub (or a clean clone) rather than uploading a local `dist/`. `.vercelignore` keeps them out of Vercel CLI uploads too. See [the audio folder guide](public/audio/README.txt). The public build uses the built-in ship ambience and Vesper synth score.

## Contributing

Issues and pull requests are welcome. Keep tuning values in `gameConfig.ts`, keep game rules pure and tested, and add tests with every change. CI runs tests, lint and the build on each push and pull request.

## License

DRIFT's project code and documentation are available under the [MIT License](LICENSE). Third-party dependencies retain their own licenses. The included artwork and cabin voice recordings are supplied for running DRIFT and are excluded from the MIT grant. Optional drop-in soundtrack recordings are distributed separately by their respective rights holders.
