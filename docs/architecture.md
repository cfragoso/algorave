# Architecture

## Implemented

The browser runs Strudel patterns and audio. The Launch Control XL connects
to that browser through Web MIDI and receives SysEx LED feedback. Musical
roles are independent of MIDI channel numbers: eight columns control eight
tracks, while the verified device uses MIDI channels 1 and 2.

The separate Python lighting bridge receives WebSocket commands and writes
ENTTEC DMX USB PRO frames. It can run on the laptop now or on a Linux device
next to the fixtures later. Lighting examples use localhost by default; change
their WebSocket URL when moving the bridge to another device.

The [app](../app/README.md) adds an HTTP API and one designated browser audio player
connected over WebSocket. Structured song presets live in `songs/*/session.json`.
It loads songs, replaces track expressions or sounds, and preserves the local MIDI
mix. Writes are acknowledged by the player; failed evaluations retain the previous
confirmed song. Authentication is required for a server bound to a network interface.

## Still planned

- Next-bar quantization; current changes affect upcoming scheduler events.
- Shared timing/latency compensation for visuals and lighting.
- Persistent live edits and remote audio-output selection.

The audio device should schedule notes locally. Visuals and lighting should
use the same musical timeline with measured latency compensation. Existing
lighting clock estimation is an initial LAN test, not a complete distributed
synchronization solution. Browser audio still requires an initial user gesture.
