# German Renaissance

Original 140 BPM E-minor trance arrangement, 144 bars (about 4:07), looping.
Rolling offbeat bass, a bright supersaw arpeggio, long minor chords, spoken
vocal texture and a 16-bar snare build lead into the main return.

Load **German Renaissance** into A or B in the app. The named parts in
[score.js](score.js) map to columns 1–8: kick, clap, closed hats, percussion,
bass, lead, chords and vocals. Start with the kick, bring in bass/hats, and open
the lead's cutoff during the build. The middle break removes kick and bass.

The [session manifest](session.json) is the app preset. [song.js](song.js) runs
in strudel.cc with its usual TR-909 samples and loads the existing `nightvox`
Dirt-Samples manifest. For hardware control there, evaluate the shared controller
setup first and set `USE_MIDI = true`. In the app the controller setup is automatic.
All musical code is original; external samples are referenced, not bundled.
