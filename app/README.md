# Algorave app and control API

A browser plays Strudel locally and connects to an HTTP/WebSocket control server.
The Launch Control XL connects to the **audio browser**, alongside the audio output.
Another browser or program can load songs and edit tracks through the server.

## Start on your laptop

Requires Node.js 22 or later and npm. From the repository:

```sh
cd app
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:3000>. Click **Enable audio device**, then **Play**.
The initial set is just the kick. Select **Night Bus** and click **Load song**
for the full arrangement. Connect MIDI separately with **Connect Launch Control XL**;
audio works without MIDI. Retain the hardware template used during mapping.
On restart, `npm start` is enough unless dependencies or browser code changed.
Browser code changes require `npm run build` and a page reload.

Only one browser tab owns audio at a time. The message below the buttons shows
whether this tab is the audio player or a remote controller. If Chrome shows
**Audio active elsewhere**, close the player in the other browser (including
the in-app browser panel), or click **Release audio device** in that player.
Then click **Enable audio device** in Chrome. Play, Stop, MIDI and Reset mix
are available only in the audio player; song and track edits also work remotely.
Releasing stops playback and detaches MIDI without changing the server's song.

To recover a silent mixer, use **Reset mix**. Check the computer's selected
audio output, then press Play. Stop any old strudel.cc session to avoid two players.
Use Chrome for Web MIDI/SysEx. MIDI is optional if your browser lacks support.

## Build the music live

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

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/songs` | Available structured songs |
| GET | `/api/state` | Confirmed song, revision, player/playback status and pending job |
| POST | `/api/songs/load` | Load `{ "id": "night-bus" }` or `live-set` |
| PATCH | `/api/tracks/:id` | Change `code`, `sound` and/or `enabled` |
| GET | `/api/jobs/:id` | Inspect `pending`, `applied` or `failed` |

Track IDs: `kick`, `clap`, `closed_hats`, `percussion`, `bass`, `lead`, `chords`, `vocals`.

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
Expressions use ordinary JavaScript; there are no REPL `$:` labels or top-level
setup statements. Both single and double quotes work for mini notation here.

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
Visuals and the existing lighting bridge are still separate; shared lighting-clock
integration is a subsequent step.

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
