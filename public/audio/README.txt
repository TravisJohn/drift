Drift audio drop folder
=======================

Each folder here is one moment in the game. Drop any .ogg, .mp3 or .wav
file into a folder, under any file name, and it plays for that moment.

  music              shared playlist: plays for every music moment below
                     that has no files of its own
  music_roaming      music while docked / roaming (overrides "music")
  music_cruise       music during autopilot travel (overrides "music")
  amb_ship_hum       constant low ship hum
  amb_engine_cruise  engine wash during travel
  amb_cryo_bay       cryo bay room tone (swells inside the bay)
  sfx_drone_hover    drone hover (volume follows speed)
  sfx_ui_blip        menu open blip
  sfx_depart         autopilot engage / departure
  sfx_arrive         arrival chime
  sfx_terminal       terminal open

How it behaves

- Several files in one folder take turns: music and ambience play one
  after another and start over; a sound effect picks the next file each
  time it fires.
- One file alone in a music or ambience folder loops forever.
- While "npm run dev" is running you can add, replace and delete files
  at any time. The game picks the change up within a second, without a
  reload. Delete the track that is playing and the next one fades in.
- An empty folder is fine: the game runs silent for that moment and logs
  one console warning naming it.
- Files left directly in this folder, outside the folders above, are not
  played; the dev server prints a note naming them.
- A production build ("npm run build") includes the files that are here
  at build time.

Note for single-file loops: .mp3 files carry a few milliseconds of
silence at the start and end, which can be heard as a tiny gap each time
the loop repeats. If a loop clicks or hiccups, use .ogg or .wav for it.
