# Drift: prompts for outside AI tools

Prompts you can paste into an AI image or sound generator to make art and
audio for Drift, plus exactly where to put each result. Nothing here is
required: with a folder empty, the game uses its built-in look or stays
silent for that sound.

## How it works

| You make | Put it in | What it changes |
|---|---|---|
| Wall picture | `public/art/wall/` | Every wall on the ship |
| Floor picture | `public/art/floor/` | The whole deck |
| Ceiling picture | `public/art/ceiling/` | Every ceiling |
| Sounds | `public/audio/<folder>/` | See the sound section below |

- File names are free. One image per art folder is enough.
- While `npm run dev` is running, dropping a file in reloads the game, so
  you see or hear the result within seconds.
- The game adds all lighting, shadows and glow itself. Pictures must be
  flat and evenly lit, or they will look double-lit.

## Rules every picture must follow

Add this block to the end of every image prompt. It is what makes the
result usable as a game surface rather than a nice illustration.

```
Seamless tileable texture, flat orthographic front view, no perspective,
no camera angle, no vanishing point. Even diffuse lighting, no cast
shadows, no highlights, no lens effects, no vignette. Fills the whole
frame edge to edge, no border, no background. No people, no text, no
letters, no numbers, no logos. Square, 1024x1024.
```

If the tool has a "tile" or "seamless" switch (Midjourney `--tile`, a
"tiling" checkbox in Stable Diffusion tools), turn it on.

## The style

Paste this at the start of every image prompt so all three surfaces match
each other and the game's colours.

```
Interior of a quiet deep-space research vessel. Dark gunmetal and deep
blue-grey hull plating, matte, slightly worn but clean. Thin recessed
light channels glowing soft cyan. Sparse warm amber accents. Calm,
functional, lived-in science fiction; restrained, not busy.
```

To try a different mood, swap that block for one of these:

- **Clean lab:** `Interior of a pristine research vessel. Smooth pale grey
  and off-white composite panels with fine seams, soft even light, thin
  cyan trim lines. Minimal, precise, clinical science fiction.`
- **Gritty industrial:** `Interior of an old working cargo vessel. Scuffed
  dark steel, exposed conduits and pipe runs, vent grilles, faded yellow
  hazard stripes, warm amber work lights. Heavy, mechanical science
  fiction.`

## Wall

One picture covers a wall from floor to ceiling (3.2 m) and repeats
sideways every 3.2 m. The bottom of the picture is the floor edge. Only
the left and right edges need to match each other.

The game stands a structural rib with a strip of coloured light against
the wall about every 2 m, and runs beams across the ceiling. These are
built, not painted, and stay in place over a supplied picture, so the
picture should not contain ribs of its own. Windows sit between 28% and
75% of the way up the wall; a picture whose horizontal bands change at
those heights lines up with them.

```
[STYLE BLOCK]

A straight-on view of one bay of a spaceship corridor wall, floor at the
bottom edge and ceiling at the top edge. From bottom to top: a dark
scuffed kick plate; a thin recessed horizontal light channel glowing
cyan just above it; two large flat hull panels side by side with fine
seams between them; a narrow horizontal service band at mid height with
small flush access hatches and a row of tiny indicator lights; two more
large panels above; a slim vent grille strip near the top. No vertical
ribs or pillars and no glowing strips: the game builds its own ribs and
light strips in front of the wall.

[RULES BLOCK]
```

## Floor

One picture covers 2 m by 2 m and repeats in both directions, so all four
edges must match.

```
[STYLE BLOCK]

A top-down view of spaceship deck plating: four square metal deck plates
in a two-by-two grid, each with a subtle anti-slip tread pattern and a
recessed bolt in each corner. Narrow dark seams between the plates. One
thin recessed floor-light channel glowing dim cyan running along one
seam. Slight even wear, no puddles, no debris.

[RULES BLOCK]
```

## Ceiling

One picture covers 2.4 m by 2.4 m and repeats in both directions.

```
[STYLE BLOCK]

A view straight up at a spaceship ceiling: a grid of matte dark acoustic
panels in a slim metal frame, with one long narrow cable tray and a small
round sensor dome. Quiet and plain; darker than the walls, and with no
lights of its own.

[RULES BLOCK]
```

Keep the ceiling plain on purpose. The game already places a light strip
on every ceiling; a ceiling picture with its own lights will fight it.

## Optional: make the lights really glow

Light channels painted in a picture are only paint. To make them shine
and bloom in the game, add a second image to the same folder with `glow`
in its file name (for example `wall_glow.png`): the same picture, but
black everywhere except the parts that emit light.

With an image-editing AI, give it your finished picture and this:

```
Turn this image into an emission mask. Keep only the glowing light
channels and indicator lights, in their original colours and exact
positions. Make everything else pure black. Do not move, resize or add
anything.
```

Or do it by hand in any image editor: paint everything black except the
lights, and save as a copy.

## Optional: relief map

The game works out relief (grooves and raised ribs) from the picture
itself, treating dark lines as grooves. That is usually enough. If you
want exact control, add an image with `normal` in its file name: a normal
map made from your picture by any "normal map generator" tool.

## Sounds

These folders in `public/audio/` are empty today, so those sounds are
silent. Each takes any `.ogg`, `.mp3` or `.wav` file. For looping sounds
prefer `.ogg` or `.wav`: `.mp3` adds a tiny gap at each repeat.

Add this to every sound prompt:

```
No music, no melody, no voices, no sudden events. Clean recording, no
reverb tail cut off at the end.
```

| Folder | Length | Prompt |
|---|---|---|
| `amb_ship_hum` | 30 s seamless loop | `Constant low interior hum of a spaceship at rest: deep steady drone, soft air circulation, faint electrical buzz. Perfectly even, nothing changes.` |
| `amb_engine_cruise` | 30 s seamless loop | `Deep steady rumble of a large spaceship engine at full cruise, heard from inside the hull: heavy low-frequency thrust, slight shimmer on top. Perfectly even power, no ramp up or down.` |
| `amb_cryo_bay` | 30 s seamless loop | `Cold room tone of a cryogenic sleep bay: soft hiss of coolant, slow rhythmic breath of life-support pumps, faint high electronic tone.` |
| `sfx_drone_hover` | 8 s seamless loop | `Small electric maintenance drone hovering: smooth quiet whirr of rotors or anti-gravity, steady pitch.` |
| `sfx_ui_blip` | 0.2 s | `Short soft interface blip, single gentle tone, futuristic but warm.` |
| `sfx_depart` | 4 s | `Spaceship autopilot engaging: low power-up sweep rising into a steady hum, with a soft confirmation tone at the start.` |
| `sfx_arrive` | 3 s | `Spaceship arriving: engines winding down, then a calm two-note arrival chime.` |
| `sfx_terminal` | 0.6 s | `Computer terminal waking: quick soft electronic chirp and a faint screen hum.` |

Two things the game does for you, so do not bake them into the files:

- **Engine:** the game makes `amb_engine_cruise` quieter and lower-pitched
  at a standstill and brings it up to full as the ship gathers speed.
  Supply the steady full-power sound.
- **Music:** tracks in `public/audio/music/` are played through an
  "intercom" effect (narrow, slightly crackly, like a ship's speaker).
  Supply normal full-quality music. The effect is tuned, or switched off,
  under `audio.intercom` in `src/config/gameConfig.ts`.

## Checking a result

1. Drop the file in its folder with the game running.
2. Walls: stand in the long corridor and look along it. A vertical line
   repeating every few metres means the left and right edges do not
   match; regenerate with the tile option on, or ask for "seamless".
3. If a surface looks washed out or has shadows going the wrong way, the
   picture has lighting painted into it; ask again for "flat even
   lighting, no shadows".
4. If the pattern is too big or too small, change the metres per repeat
   under `art.tileSize` in `src/config/gameConfig.ts`.

## Not possible yet

These need more work in the game before outside art can be dropped in.
Ask for them when you want them:

- 3D models for props (consoles, cryo pods, crates, reactor, the drone).
- Different wall art per room; today one wall picture covers the ship.
- The ship's outer hull, seen in the exterior view.
- Pictures for the console screens.
