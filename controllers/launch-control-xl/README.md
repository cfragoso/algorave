# Novation Launch Control XL

- [mapping.json](mapping.json): portable export of all 48 verified controls and LED protocol metadata.
- [setup.js](setup.js): evaluate once before a live score; connects MIDI, initializes the mix and installs `liveStrip()`.
- [observations.md](observations.md): captured messages and how the mapping was verified.

The full Night Bus song already embeds this setup; do not run it separately for that song.

| Control | CCs, columns 1–8 | MIDI channel |
| --- | --- | --- |
| Volume fader | 77–84 | 2 |
| Cutoff, top knob | 13–20 | 1 |
| Resonance, middle knob | 29–36 | 1 |
| Reverb, bottom knob | 49–56 | 1 |
| Mute, upper button | 41, 42, 43, 44, 57, 58, 59, 60 | 1 |
| Solo, lower button | 73, 74, 75, 76, 89, 90, 91, 92 | 1 |

MIDI channels are 1-based; values are 0–127. The verified hardware template
uses toggle buttons, sending one alternating 0/127 CC per press. The application
toggles its own state on either value, allowing the next press to work after
reset. This behavior should not be reused with a momentary template unchanged.

Upper green = enabled by mute/solo; upper off = muted or excluded by another
solo. Lower amber = solo on. LED feedback uses physical SysEx indices 24–31
and 32–39; allow MIDI/SysEx access in Chrome. Until a template-change message
identifies the selected slot, LED colours are updated in all 16 slots. Control
assignments are not changed. There is no fader pickup or motor-fader feedback.

Keep the same controller template selected. Its slot number has not been
recorded. For a native hardware backup, retrieve it through Novation Components
and save it separately; this JSON is not a Components-importable template.
[Novation Components guide](https://support.novationmusic.com/hc/en-gb/articles/4411807214226-Launch-Control-XL-MK-1-and-2-Components-guide).
