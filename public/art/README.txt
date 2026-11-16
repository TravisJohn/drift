Drift art drop folder
=====================

The ship's surfaces are drawn by the game itself. Drop an image into one
of these folders and it replaces that built-in look, everywhere on the
ship. Empty folders are fine: the built-in look is used.

  wall      every wall. The picture runs floor to ceiling once and
            repeats sideways every 3.2 m. Bottom of the picture = floor.
            The ship's ribs and light strips are built in front of it,
            so the picture should not paint ribs of its own.
  floor     the deck. One picture covers 2 m x 2 m and repeats.
  ceiling   the ceiling. One picture covers 2.4 m x 2.4 m and repeats.

What to put in a folder

- One picture (.png, .jpg or .webp), under any file name. That is all
  that is needed.
- Optional relief map: a second image with "normal" in its name. Without
  one, relief is worked out from the picture (dark lines read as grooves).
- Optional glow map: an image with "glow" or "emissive" in its name,
  black everywhere except where the surface should shine (light strips,
  indicator lights).

Guidelines

- Seamless: the left edge must continue into the right edge (and top into
  bottom for floor and ceiling), or a line shows at every repeat.
- Flat-on, evenly lit, no perspective and no painted shadows: the game
  adds the lighting and shadows itself.
- Square, 1024 x 1024. Larger costs frame rate for little gain.

While "npm run dev" is running, adding or changing a file here reloads
the game so you see it straight away.

Prompts for making these with an AI image tool: ART_PROMPTS.md in the
project root.
