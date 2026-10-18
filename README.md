# Algorave

Live-coded music, vocals, MIDI control and lighting for an algorave setup.
Start on one laptop; the lighting endpoint can later run on another device.

## Project folders

| Folder | Contents |
| --- | --- |
| [app/](app/README.md) | Two Strudel decks, main mixer, unified music/lights API and Docker setup |
| [songs/](songs/README.md) | Complete songs and small scores for live coding |
| [vocals/](vocals/README.md) | Vocal sample manifest and a folder for your recordings |
| [lights/](lights/README.md) | ENTTEC DMX USB PRO bridge, light tests, Strudel lighting patterns and Dockerfile |
| [controllers/](controllers/README.md) | Verified MIDI mappings, controller setup and LED feedback |
| [tools/](tools/README.md) | Read-only macOS MIDI monitor |
| [docs/](docs/README.md) | Restart instructions, performance plan and architecture notes |
| [examples/](examples/README.md) | Small tests and clearly marked legacy examples |

## Play in the two-deck app

Follow [app/README.md](app/README.md) to start the local studio. Enable audio once,
load songs into A and B, and blend them with the main mixer and crossfader. Each
deck has its own live editor. The Launch Control XL targets a selected deck;
one light controller connects to the ENTTEC bridge through the shared API.

## Play the complete song in strudel.cc

1. Connect the Launch Control XL and select the same template used during mapping.
2. Check your Mac's selected audio output and open [Strudel](https://strudel.cc) in Chrome.
3. Paste the whole [Night Bus song](songs/night-bus/song.js) and click Play.
4. Set `USE_MIDI = false` to listen without a controller. With MIDI enabled,
   permit MIDI/SysEx access so the buttons can show mute and solo state.
5. If the software mix is silent, set `RESET_MIX = true`, click Update, then
   restore `false` so future updates preserve your mix.

The song includes its own setup. It does not require a separate setup step.

## Build a set live

1. Evaluate [controller setup](controllers/launch-control-xl/setup.js) once in your Strudel tab.
2. Replace the editor with the [live score](songs/live-set/score.js).
3. Begin with the kick and add the short commented parts one at a time.

Setup remains in memory while the projected score stays small. After reloading
Strudel, evaluate setup again. See the [restart and performance guide](docs/restart-and-perform.txt).

## Controller layout

Columns: **1 kick · 2 clap · 3 closed hats · 4 percussion · 5 bass · 6 lead · 7 chords · 8 vocals**.

Each column has volume, cutoff, resonance, reverb, mute and solo. Upper button
green means enabled by mute/solo, off means muted/excluded; lower amber means
solo. The LEDs show mixer state, not note activity or fader level.

The [mapping JSON](controllers/launch-control-xl/mapping.json) records all 48
verified controls and LED metadata. It is an application mapping, not a Novation
Components hardware-template export. The selected hardware template slot is
still unknown; retain the current selection or back it up through Components.

## Lighting

The lighting bridge is a separate Python process. Follow [lights/README.md](lights/README.md)
for a dry run, USB setup and network deployment. On macOS the USB endpoint runs
natively; its Dockerfile is intended for native Linux device passthrough.

## Current status

- Song playback, all 48 MIDI assignments and first-column mute/LED behavior were checked on the user's setup.
- MIDI state handling and LED messages were checked with simulated events.
- The lighting endpoint has opened the ENTTEC and written frames; physical RGB order and bar boundaries still need visual confirmation.
- The [app/API](app/README.md) loads structured songs and replaces individual patterns or sounds, preserving MIDI mix controls. Next-bar quantization and shared lighting synchronization remain planned.
- Vocal audio is loaded from TidalCycles Dirt-Samples; no third-party audio files are bundled.

This repository uses Strudel but does not bundle its engine. See [Strudel](https://strudel.cc)
and [its source/license](https://codeberg.org/uzu/strudel) when building an embedded player.
