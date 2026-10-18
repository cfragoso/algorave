# Algorave app and control API

A browser runs two independent Strudel decks, A and B, feeding one main stereo
mixer. A shared song browser loads either deck. One lighting gateway and an
HTTP/WebSocket API control the whole session. The Launch Control XL connects to
the audio browser and targets the selected deck. Other browsers act as remote controls.

## Start on your laptop

Requires Node.js 22 or later and npm. From the repository:

```sh
cd app
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:3000>. Click **Enable audio device** once to prepare both
decks. Select **Night Bus** in the shared browser and click **Load deck A ↗**.
Select **South African awakening** and click **Load deck B ↗**. Press **Play**
in either deck when ready. Each initially contains the kick-only live set.
Choose **Deck A** or **Deck B** beside **Connect MIDI** to target that deck;
audio works without MIDI. Retain the hardware template used during mapping.
On restart, `npm start` is enough unless dependencies or browser code changed.
Browser code changes require `npm run build` and a page reload.

Only one main studio tab owns the audio session at a time. The message below the buttons shows
whether this tab is the audio player or a remote controller. If Chrome shows
**Audio active elsewhere**, close the player in the other browser (including
the in-app browser panel), or click **Release audio device** in that player.
Then click **Enable audio device** in Chrome. Transport, song edits and the main
mixer work remotely; physical MIDI connects only in the audio browser.
Releasing stops playback and detaches MIDI without changing the server's song.

To recover a silent mixer, use **Reset mix**. Check the computer's selected
audio output, then press Play. Stop any old strudel.cc session to avoid two players.
Use Chrome for Web MIDI/SysEx. MIDI is optional if your browser lacks support.

## Performance console

The CDJ-inspired deck shares its player with the editor and API. **Play** switches
to **Pause** while running; pause retains the position. **CUE** and **Stop** return
to the start. Loading a song preserves the clock: cue it before playing if you
want its first bar. The jog wheel displays beat/rotation; scratching is not implemented.
The tempo fader changes the score's top-level tempo through `/api/tempo`;
its reset button restores the preset BPM. Invalid score updates retain the current song.

The coloured waveform is measured from Strudel's actual master output. It builds
a rolling history as sound plays, rather than predicting the rest of a generated
song. Zoom changes the history window; **Scope** shows the current waveform.
The meter reports RMS dBFS, with a peak clipping indicator. These measure the
browser audio graph, before the computer's output volume. The bar/beat display
uses Strudel's cycle clock, assuming four beats per cycle. Progress follows a
preset's optional `bars` metadata, or a repeating 16-bar phrase if unspecified.

The Launch Control XL view mirrors all 24 knobs, eight faders, mute and solo.
You can operate these controls on screen in the audio browser. Physical MIDI
movements update the same mix and button LEDs; remote browsers receive the mix,
waveform and activity over WebSocket at about 15 Hz. Initial knob/fader positions
are the software mix: the physical positions become known when a control sends
a MIDI message. Reset mix restores the audible defaults. Instrument activity is
derived from scheduled events; it is separate from the measured master level.

The central **Light array** is the single lighting controller. Start the updated
[bridge](../lights/README.md), then click **Connect bridge**. Its endpoint is
configured on the server with `ALGORAVE_LIGHT_URL` (default
`ws://127.0.0.1:8765`), and its optional secret with `ALGORAVE_LIGHT_TOKEN`.
The eight previews show successfully written DMX RGB values, scaled to the
bridge limit. They report output frames, not optical feedback. Simulation is
labelled; disconnected/stale colours are unconfirmed. **Send colour pulse**
queues the selected bar(s); the bridge's usual two-second watchdog expires it.
**BLACKOUT** clears output immediately. Monitoring alone does not reset the watchdog.

### Two-deck audio and main mixer

A and B each have a separate Strudel instance, scheduler, score, revision,
effects, waveform history, editor draft and eight-instrument mixer. They use
isolated same-origin frames so Strudel's global state cannot overwrite the other
deck. Each engine sends stereo audio through a local MediaStream into the parent
master AudioContext. The streams stay on this computer; the API carries no audio.
This adds browser stream buffering, so measure latency on your performance machine.
Normal Strudel WebAudio output is disconnected from its direct speaker path.

Signal flow: deck engine → stereo stream → low/mid/high EQ → channel fader →
equal-power crossfader → master volume → dynamics limiter → selected output.
Channel meters are after EQ/fader and before crossfade. The measured master
waveform/meter is after the limiter. EQ ranges −24 to +12 dB at 200 Hz, 1 kHz and
4 kHz. The centre crossfade gives each channel −3 dB; endpoints exclude the other.
The limiter is a dynamics compressor, not a guarantee against every possible peak.
**Choose output…** uses browser audio-output selection where supported. Otherwise
use the output menu or the computer's audio settings. Both decks share that output.

Deck clocks and tempo are independent. Set matching BPM manually and start/cue
with care: automatic beat sync, headphone cue routing, scratch and quantized song
loading are not implemented. Pause/stop/load on A does not stop B. Song edits keep
the current deck clock. Stop/Cue resets only that deck.

MIDI controls and LEDs target exactly one selected deck at a time. Switching
A/B detaches the old listener and refreshes LEDs from the new deck's software
mix; it does not move physical faders. Knobs/faders jump to their physical values
when moved (no pickup/soft takeover yet). The central crossfader/channel/master
controls are on screen/API; the existing hardware mapping is unchanged.

## Build the music live

Each deck has a **full-song CodeMirror editor**, using Strudel's transpiler
and the same audio player as the API. Edit the whole score, then click **Update
song** or press **Ctrl+Enter / Cmd+Enter**. Updating preserves playback position
and MIDI mixer state; press Play separately if playback is stopped.

```js
setcpm(134 / 4)
const groove = "~ e2 ~ e2 ~ g2 ~ b1"

kick$: s("bd*4").bank('tr909').gain(0.6)
hats$: s("hh*8").bank('tr909').gain(0.08)
bass$: note(groove).s('sawtooth').decay(0.12).sustain(0).gain(0.12)
```

Top-level named parts map to the verified MIDI columns: `kick$`, `clap$`,
`closed_hats$` (or `hats$`), `percussion$` (or `open$`), `bass$`, `lead$` (or
`acid$`), `chords$`, `vocals$`. Each known role can appear once. The app applies
its mixer automatically; there is no need to paste the separate MIDI setup.
Additional labels and anonymous `$:` parts can play but have no MIDI column or
individual track API endpoint. An unlabeled final pattern also works.

Shared variables, functions, double-quoted mini notation, top-level await,
`samples(...)`, `all(...)` and `each(...)` are supported. Use single quotes for
ordinary JS text, as in strudel.cc. The app loads the drum/vocal maps and synths;
extra samples require your own loading code. This is a full-score editor, not an
iframe of strudel.cc: its sidebar tools, inline sliders and scopes are not
implemented. Tempo is staged with the new pattern
so an invalid update does not change the running tempo.

API song and track edits update this same score. Unapplied typing is kept as a
draft. If another client changes the live song, applying an old draft is rejected
rather than replacing the remote edit. **Download code** preserves your draft;
**Use current song · discard draft** replaces it with the current live score.
Drafts survive reload in this tab's session storage, but are not saved to GitHub.
Downloading saves musical code; this app's MIDI mixer setup is separate.

### Playback highlighting

During playback, **amber** marks show active mini-notation tokens, and **green**
marks show the corresponding named instrument labels. Use double quotes or
backticks for mini notation, as in strudel.cc. Shared variables also highlight
where their notes/rhythms are defined. Highlighting follows scheduled pattern
events and their durations; it is not an audio-level meter or a guarantee that a
sample loaded successfully. Muted/zero-gain events do not start new highlights.

The audio tab uses scheduled AudioContext timestamps. Remote controller tabs
receive activity frames over WebSocket at up to 15 Hz, with network/display
delay and possible browser background throttling. Stops, releases and disconnects clear the marks. An unapplied or conflicting
draft suppresses marks until its code matches the confirmed score again, so
live positions are never deliberately shown over different draft text.

**Individual track controls** remains available in the expandable panel below.
Load **Build it live**. Only channel 1 is initially in the set. Tick **In the set**
on closed hats, then click that track's **Apply track**. Add clap, bass, percussion,
lead, chords, and vocals over successive phrases. Edit each small pattern and
apply it while the other parts continue. Disable kick/bass for a breakdown,
then restore them for a drop. Loading a preset restores its original track code.

The eight columns keep their verified roles. Song/track changes retain mixer values,
mute/solo, MIDI listeners and LED feedback. The API's `enabled` flag controls
arrangement membership separately from the controller's mute/solo. LEDs continue
to indicate mixer mute/solo permission, as in the original setup.

**Sound override** changes the sound while keeping the pattern. Try `square`
on the bass; leave it blank to restore the sound defined in its code. For drum
tracks, the bank in the expression still applies. Change the expression to
change bank or switch between a drum and a synth.

## HTTP API

All musical controls have explicit deck routes. Use uppercase `A` or `B`.
Legacy `/api/state`, `/api/code`, `/api/tempo`, `/api/tracks/:id` and
`/api/songs/load` remain aliases for **A**. Jobs are acknowledged by the audio
browser; HTTP 202 means queued, not applied. Deck jobs are independent; only one
job per deck and one master-mixer job can be pending at a time.

| Method | Endpoint | Payload / result |
| --- | --- | --- |
| GET | `/api/session/state` | Both decks, main mixer, fresh master telemetry, lights |
| GET | `/api/decks/A/state` | Deck A song, revision, playback and telemetry |
| POST | `/api/decks/B/songs/load` | `{ "id": "south-african-awakening" }` |
| POST | `/api/decks/A/code` | `{ "code": "…", "revision": 0 }` |
| PATCH | `/api/decks/B/tracks/bass` | `{ "sound": "square" }` or code/enabled |
| PATCH | `/api/decks/A/tempo` | `{ "bpm": 122 }` |
| POST | `/api/decks/B/transport` | `{ "action": "play" }`; also pause, cue, stop |
| PATCH | `/api/decks/A/mixer` | `{ "column": 1, "parameter": "volume", "value": 0.65 }` or `{ "reset": true }` |
| GET/PATCH | `/api/mixer` | Main mixer; partial patches shown below |
| GET | `/api/lights/state` | Bridge connection, freshness and last written frame |
| POST | `/api/lights/connect` | `{}`; connects to server-configured endpoint |
| POST | `/api/lights/disconnect` | `{}`; disconnects the shared gateway |
| POST | `/api/lights/bar` | `{ "bar": 1, "rgb": [32, 12, 0], "exclusive": false }` |
| POST | `/api/lights/blackout` | `{}` |

```sh
curl -X PATCH http://127.0.0.1:3000/api/mixer \
  -H 'Content-Type: application/json' \
  -d '{"crossfader":0.25,"master":0.7,"channels":{"A":{"volume":0.8,"low":-6},"B":{"volume":0.6}}}'
```

Master/crossfader/channel volume use 0–1; channel low/mid/high EQ use −24…12 dB.
Optional `sinkId` selects a device already authorized in the audio browser.
Lights return bridge acknowledgements (queued colour, immediate blackout), not
song jobs or proof of light emission. Starting another light command client may
conflict with gateway ownership; blackout always remains available to authenticated
clients. Network auth/origin protections apply to every endpoint.

WebSocket `/ws?scope=session` reports session state, tagged deck telemetry and
`masterTelemetry`. `/ws?deck=A` and `/ws?deck=B` carry the respective deck protocol;
`/ws` remains A. The main player holds an exclusive session lease, and its child
decks claim using the lease's `ownerId`. Releasing/disconnecting the main player
stops both children. An observer cannot publish player acknowledgements or meters.

The following legacy examples target A:

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/songs` | Available structured songs |
| GET | `/api/state` | Confirmed song, revision, player/playback status and pending job |
| POST | `/api/songs/load` | Load `{ "id": "night-bus" }` or `live-set` |
| POST | `/api/code` | Update the full score with `{ "code": "…", "revision": 3 }` |
| PATCH | `/api/tracks/:id` | Change `code`, `sound` and/or `enabled` |
| PATCH | `/api/tempo` | Change BPM with `{ "bpm": 124 }` (40–250) |
| GET | `/api/jobs/:id` | Inspect `pending`, `applied` or `failed` |

Track IDs: `kick`, `clap`, `closed_hats`, `percussion`, `bass`, `lead`, `chords`, `vocals`.

State responses include fresh player `telemetry` when available (at most two
seconds old): cycle, elapsed seconds, playing state, waveform samples, peak/RMS,
frequency bands and mixer state. WebSocket observers receive `telemetry` messages
with `frame` and `revision`. Audio samples are downsampled for display, not an
audio stream. Only the claimed audio player can publish telemetry.

```sh
curl http://127.0.0.1:3000/api/state

curl http://127.0.0.1:3000/api/songs/load \
  -H 'Content-Type: application/json' -d '{"id":"night-bus"}'

curl -X PATCH http://127.0.0.1:3000/api/tracks/bass \
  -H 'Content-Type: application/json' -d '{"sound":"square"}'

curl -X PATCH http://127.0.0.1:3000/api/tracks/closed_hats \
  -H 'Content-Type: application/json' \
  -d '{"code":"s(\"hh*16\").bank(\"tr909\").gain(0.08)","enabled":true}'
```

A write returns **202 Accepted** and a job ID. It is successful only when the
job becomes `applied`. A missing audio device or another pending write returns
409. The player checks every expression and queries the candidate pattern before
replacing the mix. Errors retain the previous confirmed song. This detects syntax
and representative query errors; it cannot prove arbitrary code is safe or detect
every error at later cycles. Unknown/unavailable samples may still be silent.

Changes apply to upcoming scheduler events, preserving the shared clock. There is
**no next-bar quantization yet**. Song loading retains current cycle position;
Stop then Play restarts the arrangement from its beginning. Sound tails may ring
out after changes. The API reports applied patterns, not a guarantee of audible output.

## Song files

The app loads `songs/*/session.json` at server startup. Each file contains a BPM and
eight tracks with fixed IDs/columns, JavaScript pattern expressions, an optional
sound override and an enabled flag. The existing `song.js` and `score.js` remain
standalone strudel.cc versions. These JSON files are an additional editable format.
The optional `code` field contains the full Strudel score. For older manifests,
the app generates a score from the eight tracks. Named expressions can reference
shared variables defined in that score. Track API edits rewrite their named part
without removing shared setup or other instruments. Commenting out/removing a
named part disables that role; enabling it through the API appends its saved
expression. API sound overrides appear as `.s(...)` in the score. Applying a
manual full-score edit makes that code the new baseline for future API overrides.

Live edits and mixer values are held **in memory**. Restarting the server restores
the kick-only set; reloading the audio browser resets its mixer. To preserve a
song edit, copy the `song` object from `/api/state` into a `session.json` file,
then restart the server. A reconnect receives the server's last confirmed song.
Only one audio browser can claim the player role. On connection loss it stops
playback (including a 15-second heartbeat watchdog, subject to browser timer
throttling); reconnect with Connect, Enable audio device, Play, and reconnect MIDI.

## Separate control and audio devices

The server schedules no notes and opens no audio/MIDI device. It can run in a
container on a Pi/NUC while the browser handles timing and audio on another device.
The physical audio interface remains connected to the audio computer and selected
in its system/browser audio settings. Audio is not streamed over the WebSocket.
The lighting bridge remains a separate USB endpoint, reached through the API
gateway. Shared beat-clock integration is a subsequent step.

For a LAN server set `HOST=0.0.0.0` and `ALGORAVE_TOKEN` to a random secret of at
least 24 characters. Browser clients enter that token in Connect; other clients
send `Authorization: Bearer …`. Do not commit the token. Cookies are HttpOnly and
SameSite Strict; browser WebSocket connections require the same origin.

Web MIDI requires a secure context. An ordinary remote HTTP address may work for
the control UI but will not provide Web MIDI. For the audio computer, use HTTPS
with a trusted certificate, or forward the server to localhost:

```sh
ssh -L 3000:127.0.0.1:3000 user@control-device
```

Then open `http://127.0.0.1:3000` on the audio computer. Use a trusted private
network or HTTPS for token-bearing LAN access. Pattern editing deliberately
executes JavaScript in the player: only give the API token to trusted performers.
The server binds only to localhost by default and rejects other browser origins.

## Docker

From the repository root:

```sh
docker build -f app/Dockerfile -t algorave-control .
docker run --rm -p 127.0.0.1:3000:3000 \
  -e ALGORAVE_TOKEN algorave-control
```

Set `ALGORAVE_TOKEN` in your environment before running. The token requirement also
applies inside Docker because the process binds to `0.0.0.0`. Publish to a LAN
interface only when intentionally enabling remote access. No USB/audio passthrough
is needed for this server. Browser audio and MIDI remain outside Docker.

## Checks and license

`npm test` checks API acknowledgement, concurrent writes, failed edits, player
ownership, authentication, sessions, origins, timeouts and disconnects.
`npm run build` builds the browser and audio worklet code. Browser playback and
physical MIDI/LED behavior require a real device check.

The new app is AGPL-3.0-or-later, matching its Strudel dependency; see [COPYING](COPYING)
and the [official integration guide](https://strudel.cc/technical-manual/project-start/).
Dependencies are pinned in `package-lock.json`. Samples load from the public
tidal-drum-machines and Dirt-Samples repositories; no sample audio is bundled.
Internet access is required for uncached samples. Sample rights remain with their
respective owners. This app license does not relicense unrelated existing repo files.
