# Direct garageCube lighting bridge

WebSocket → ENTTEC DMX USB PRO → eight chained RGB 0.5 m bars.
No QLC+ or MIDI connection is required.

## Local start

From this directory:

```sh
.venv/bin/python bridge.py --device /dev/cu.usbserial-YOUR_ENTTEC
```

For a fresh installation, from `lights/`:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Replace `YOUR_ENTTEC` with the serial device name on your computer.
The bridge defaults to eight bars, ten RGB pixels / 30 DMX slots per bar,
starting at DMX channel 1. This interprets the manufacturer's 30-address
specification as ten RGB triplets. RGB order and boundaries require visual
confirmation on the connected hardware; use `--order GRB` or another order
if the colour test differs, and `--pixels` / `--start` if the layout differs.

| Bar | Expected channels |
| --- | --- |
| 1 | 1–30 |
| 2 | 31–60 |
| 3 | 61–90 |
| 4 | 91–120 |
| 5 | 121–150 |
| 6 | 151–180 |
| 7 | 181–210 |
| 8 | 211–240 |

## Test

```sh
.venv/bin/python check_lights.py
.venv/bin/python check_lights.py --chase
```

The first check sends red, green, blue to bar 1 for one second each, then
blackout. The second lights one bar at a time in dim red, then blackout.
The bridge caps each component at 32/255 unless `--limit` is changed.

Paste `patterns/chase.js` into Strudel in Chrome and evaluate it.
Allow MIDI-independent local network access if Chrome asks. The example
uses Strudel's `onTrigger` callback with dominant output, so the chase itself
does not create sound. Add separate sound patterns if desired.
If the browser blocks the connection from HTTPS, use a locally served
Strudel instance or configure WSS with a trusted certificate.

Stop Strudel to stop the chase. The bridge blacks out after two seconds
without a lighting command, when the controlling client disconnects, and
on a normal bridge shutdown. If the process or USB connection fails abruptly,
the USB PRO can retain its last output; the software watchdog cannot cover
that failure. The bridge sends full DMX frames at approximately 30 Hz.

## Network deployment

Run the same bridge next to the ENTTEC and change the WebSocket URL in
the Strudel example. Bind beyond localhost with `--host 0.0.0.0 --token ...`.
The client must first send `{"type":"auth","token":"..."}` and await
`authenticated`. Use WSS for authenticated connections over untrusted networks.
The lightweight round-trip clock estimate is adequate for initial LAN tests;
long-running distributed playback needs periodic clock recalibration and
measurement of output latency. This is an initial endpoint, not the complete
distributed performance runtime discussed in the chat.

On native Linux Docker, build this Dockerfile and pass the host's serial
device with `--device`, its required group permissions, and network settings.
The device name may be `/dev/ttyUSB0`; configure `--device` accordingly.
On macOS run this USB endpoint natively; other services can still run in Docker.

## Protocol

- `ping` / `pong`: echoes `id` and supplies server monotonic seconds.
- `status`: reports layout, output limit, and simulation mode.
- `subscribe` / `unsubscribe`: read-only live monitoring. After authentication,
  subscribers receive `state` frames at up to 10 Hz, including `colours` (RGB per
  bar), `framesWritten`, `outputConnected`, layout, limit and `dryRun`. Colours
  come from the last successful serial write (or simulated write), not a lamp
  sensor. Subscribers do not claim command ownership, reset the watchdog, or
  blackout when they disconnect. Use this from the app's Lighting connection panel.
- `bar`: `bar` is 1-based, `rgb` is three values 0–255, `exclusive` clears
  other bars, optional `executeAt` is server monotonic seconds (up to 1 s ahead).
- `blackout`: clears all channels and scheduled events immediately.

One client owns lighting commands at a time. Any authenticated client can
blackout. Colour events receive a `queued` acknowledgement; it confirms
acceptance, not that the physical LEDs emitted light. Errors leave the
current frame untouched. `--dry-run` runs without opening a USB device.

Sources: [garageCube specifications](https://shop.garagecube.com/products/4-led-bars-0-5-meter),
[ENTTEC protocol](https://cdn.enttec.com/pdf/assets/70304/70304_DMX_USB_PRO_API.pdf),
[Strudel callbacks](https://codeberg.org/uzu/strudel/src/branch/main/packages/core/pattern.mjs).

For a USB-free connection test, run `.venv/bin/python bridge.py --dry-run`.
The beat-synchronized example is [patterns/beat-pulse.js](patterns/beat-pulse.js).

USB-free regression checks: `.venv/bin/python -m unittest discover -s . -v`.
These verify frame layout, observer behaviour and watchdog expiry in simulation.
