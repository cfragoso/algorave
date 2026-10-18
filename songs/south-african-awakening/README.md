# South African awakening

An original deep house sketch inspired by the warmth and percussion-led movement
of South African house: **122 BPM**, **F# minor**, extended chords, a syncopated
bassline and a restrained, shuffled groove. The title describes an imagined
dawn-to-daylight journey; the track uses programmed drums and synths.

## Play

In the app, select **South African awakening** and click **Load song**, then Play.
The eight MIDI columns retain their existing roles. Edit the complete score with
Ctrl/Cmd+Enter. The [score](score.js) is also easy to copy into the full editor.

[song.js](song.js) is the strudel.cc version: it loads its vocal sample map and
plays without a controller setup. For MIDI on strudel.cc, evaluate the shared
controller setup first, set `USE_MIDI = true` in that file, then evaluate it.

## Arrangement

| Section | Bars | Feel |
| --- | --- | --- |
| Dawn | 8 | Warm sustained chords, light rim/hats; kick enters halfway |
| Settle | 16 | Bass, clap and offbeat percussion establish the pocket |
| Awakening | 24 | Mallet-like melodic call/response and vocal fragments |
| Breathe | 16 | Kick and bass fall away; chords and melody leave space |
| Lift | 8 | Hats build, then a two-bar kick gap |
| Sunlight | 32 | Full groove with bass embellishment and vocal replies |
| Afterglow | 16 | Melody and percussion ease back |
| Horizon | 8 | Chords and quiet hats dissolve into the next loop |

128 bars, approximately **4 minutes 12 seconds**, looping at 122 BPM.
Harmony changes every two bars: **F#m9 → Dmaj9 → Amaj9 → E6/9**.

## Controller columns

1. Rounded kick.
2. Clap and ghost snare.
3. Shuffled closed hats.
4. Rim, open hats and low tuned percussion pulses.
5. Rolling bass.
6. Mallet-like lead and melodic response.
7. Warm chord stabs and sustained pad.
8. Sparse chopped/pitched vocal texture.

Raise the chord/lead reverb gently for the breakdown. Keep bass/kick reverb low.
Change `harmony` and `roots` together when trying another progression. Most parts
have a short definition followed by a section arrangement, so you can change the
sound or rhythm without rewriting the structure.

## Sounds

Uses only the app's existing TR-909 sample map, triangle/sine synths and
`nightvox:4`, a chopped "yeah" from TidalCycles Dirt-Samples. No new audio files
are bundled. This is a vocal texture, not a sung or translated lyric. Internet
access is required for uncached samples. Bring your own recording for a more
personal vocal; keep the `vocals$` label for its MIDI/API mapping.
