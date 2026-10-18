# Night Bus — eight-channel techno sketch

134 BPM, E minor, 96 bars (about 2:52), looping. Original patterns with
TR-909 drum samples, synthesized bass/lead/chords, and spoken Dirt-Samples
vocal chops. The vocals are short spoken samples, rather than a sung verse.

## Listen first

1. Open https://strudel.cc in Chrome and paste all of
   `songs/night-bus/song.js` into the editor.
2. Set `USE_MIDI = false` to hear the preset mix.
3. Click Play/evaluate. Allow the vocal samples to load; the first playback
   can miss a sample while it downloads. Stop and restart playback from the
   beginning to hear the full arrangement.
4. Start at a low speaker/headphone volume and adjust to taste.

## Play with the Launch Control XL

Keep the hardware template selected during our live capture on 2026-10-16.
This assumes the original Launch Control XL / Mk2, not the XL 3.
The song now uses that template's observed assignments for all eight columns, verified through physical movements.
You do not need to load the earlier proposed custom template.
Set `USE_MIDI = true`, correct `MIDI_INPUT` to your browser's exact port
name, evaluate again, and allow MIDI access when the browser asks.
Move each fader and knob after evaluation so Strudel receives its position.
On a fresh page, the software mix starts with faders at 65%, cutoff at 75%,
resonance low, a little reverb, and mute/solo off. MIDI messages take over
when you move each control. Re-evaluating preserves the software mix.

If the controls leave everything silent, set `RESET_MIX = true`, click
Update, then set it back to `false` before your next update. This resets
software levels and mute/solo and refreshes the button LEDs. It does not
move hardware controls. The verified toggle buttons flip software state
on each incoming 0/127 message, so the next press works after reset.

| Physical column | Instrument |
| --- | --- |
| 1 | Kick |
| 2 | Clap / snare |
| 3 | Closed hats |
| 4 | Open hats / rim percussion |
| 5 | Bass |
| 6 | Acid lead |
| 7 | Chord stabs / pad |
| 8 | Vocal chops |

On every column:

| Control | CCs for columns 1–8 | MIDI channel | Function |
| --- | --- | --- | --- |
| Fader | 77–84 | 2 | Volume |
| Top knob | 13–20 | 1 | Low-pass filter cutoff |
| Middle knob | 29–36 | 1 | Filter resonance |
| Bottom knob | 49–56 | 1 | Reverb |
| Upper button | 41, 42, 43, 44, 57, 58, 59, 60 | 1 | Mute, toggle 0/127 |
| Lower button | 73, 74, 75, 76, 89, 90, 91, 92 | 1 | Solo, toggle 0/127 |

All eight assignments in each row have been captured and identified on hardware.
The eight channels control Strudel patterns; the browser produces a stereo
mix, rather than eight separate audio-device outputs. Mute/solo operate on
newly scheduled events; sustained sounds and effect tails can continue.
LED feedback is enabled. Upper green means enabled by mute/solo; upper
off means muted or excluded by another solo. Lower amber means solo on.
These indicate mixer permissions, not actual sound activity: a part can be
silent because its fader is down, it has rests, or its arrangement has not
entered. Existing notes/effect tails can still ring out after mute.
There is no fader pickup.
The song uses a small Web MIDI listener and Strudel `ref()` signals rather
than Strudel's persisted `midin()` values. Listener replacement prevents
duplicates on re-evaluation. Mix state persists within this page until
reset or reload, not across browser sessions.

## Arrangement

| Bars | Section | What changes |
| --- | --- | --- |
| 1–8 | Intro | Kick and closed hats |
| 9–24 | Groove | Bass, clap and open hats enter |
| 25–40 | Main | Acid, chord stabs and vocals enter |
| 41–48 | Breakdown | Drums/bass stop; pad and spoken count remain |
| 49–56 | Build | Hats, acid and a growing snare roll |
| 57–80 | Drop | Full groove, bass/kick variations |
| 81–96 | Outro | Strip back to drums and bass |

Edit each named pattern to change its instrument. The `song(...)` helper
uses the same seven section lengths for every channel so everything stays
aligned. In MIDI mode the knobs replace each part's preset cutoff,
resonance and reverb values; note rhythms and envelopes remain intact.

For a live transition, mute columns 1 and 5, gradually open column 6's
filter, then unmute the kick and bass together. Some lanes are deliberately
silent in the intro: soloing the vocals there will produce silence.

## References and validation

- Strudel arrangement and tempo: https://strudel.cc/learn/faq/
- Sample loading: https://strudel.cc/learn/samples/
- MIDI input: https://strudel.cc/learn/input-devices/
- Vocal source: https://github.com/tidalcycles/Dirt-Samples

JavaScript syntax and the shared 96-bar section lengths were checked.
On 2026-10-16, the browser console revealed that single-quoted pattern
strings were treated as literal sound names/notes. These were changed to
double quotes and the corrected song was applied in the user's Strudel
REPL. Initial playback showed no further scheduling errors. The user confirmed audible playback and first-column control. All eight
columns were subsequently identified through live MIDI capture; a complete
performance with every musical part still needs auditioning.

Silent MIDI startup was subsequently resolved with explicit initial mix
values and a software reset option. The user confirmed audible playback
with MIDI enabled after this change. Simulated MIDI messages verified
zero fader values, channel routing, the split button map, listener cleanup,
mix preservation on re-evaluation and reset behavior.

When editing, use double quotes for mini-notation, such as `s("bd*4")`.
Single quotes are appropriate for literal values such as the MIDI port
name and sample URLs.

LED feedback uses the official Launch Control XL SysEx physical-button
indices (upper 24–31, lower 32–39), independent of CC assignments. Permit
MIDI/SysEx access if the browser asks. Until the selected template is known
from a template-change message, LED colours are written to all 16 template
slots; no control assignments are written. It refreshes on button presses,
reset and every second. Re-evaluation removes the previous timer/listener.
The user confirmed first-column mute and LED feedback agree on hardware.
Reference: https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/launch-control-xl-programmers-reference-guide.pdf
