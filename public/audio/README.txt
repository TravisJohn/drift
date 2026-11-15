Drift audio drop folder
=======================

Place your music and ambience files here with these exact names, as
.ogg, .mp3 or .wav (see src/content/audioManifest.ts). For example
music_roaming.mp3 or sfx_ui_blip.wav:

  music_roaming      calm bed while docked / roaming
  music_cruise       bed during autopilot travel
  amb_ship_hum       constant low ship hum (loop)
  amb_engine_cruise  engine wash during travel (loop)
  amb_cryo_bay       cryo bay room tone (loop, swells inside the bay)
  sfx_drone_hover    drone hover loop (volume follows speed)
  sfx_ui_blip        menu open blip
  sfx_depart         autopilot engage / departure
  sfx_arrive         arrival chime
  sfx_terminal       terminal open

If the same sound exists in more than one format, .ogg wins, then .mp3,
then .wav. Reload the page after adding files.

Any missing file is fine: the game runs silent for that sound and logs
one console warning naming it.

Note for loops: .mp3 files carry a few milliseconds of silence at the
start and end, which can be heard as a tiny gap each time a loop
repeats. If a loop clicks or hiccups, use .ogg or .wav for that one.
