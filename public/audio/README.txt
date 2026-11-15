Drift audio drop folder
=======================

Place your music and ambience files here with these exact names
(.ogg preferred; see src/content/audioManifest.ts):

  music_roaming.ogg      calm bed while docked / roaming
  music_cruise.ogg       bed during autopilot travel
  amb_ship_hum.ogg       constant low ship hum (loop)
  amb_engine_cruise.ogg  engine wash during travel (loop)
  amb_cryo_bay.ogg       cryo bay room tone (loop, swells inside the bay)
  sfx_drone_hover.ogg    drone hover loop (volume follows speed)
  sfx_ui_blip.ogg        menu open blip
  sfx_depart.ogg         autopilot engage / departure
  sfx_arrive.ogg         arrival chime
  sfx_terminal.ogg       terminal open

Any missing file is fine: the game runs silent for that sound and logs
one console warning naming it.
