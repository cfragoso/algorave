# Maltegians Anthem

Original deep house, **120 BPM · D minor · 128 bars · about 4:16**.
A warm four-on-the-floor kick, shuffled hats, syncopated bass, minor ninth / major
ninth key voicings and a restrained call-and-response melody. A sparse chopped
vocal texture sits around the groove; it is not a sung verse.

| Section | Bars | Character |
| --- | --- | --- |
| Harbour | 16 | Kick, light hats and soft harmony |
| Pocket | 16 | Bass, clap and offbeat percussion enter |
| Gathering | 24 | Melody, bass replies and vocal texture |
| Dusk | 16 | Kick/bass drop out; pads and echoes remain |
| Lift | 8 | Snare build; kick returns in the last two bars |
| Anthem | 32 | Full groove, brighter hats and melodic replies |
| Home | 16 | Melody/vocals leave space for mixing out |

Load **Maltegians Anthem** into A or B in the app. The eight MIDI columns remain
kick, clap, closed hats, percussion, bass, lead, chords and vocals. The app loads
the existing TR-909 and `nightvox` sample maps; no new sample downloads are bundled.

[score.js](score.js) is the editable app score; [session.json](session.json) is its
preset. [song.js](song.js) runs in strudel.cc using its usual TR-909 bank and loads
the vocal manifest. For MIDI there, evaluate the shared controller setup first
and set `USE_MIDI = true`. The musical score is original.

To reshape the song, edit `roots` and `voicings` together, then the `call` and
`response` phrases. Keep the named instrument labels for controller/API routing.
