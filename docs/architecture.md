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

## Planned, not implemented

A control server will provide an HTTP API and route commands to a Strudel
player over WebSocket. Proposed operations:

- Load a song from `songs/` at the next bar.
- Replace one track's pattern, preserving its mix controls.
- Replace an instrument while retaining the note pattern.
- Report playback state and reject invalid code without replacing good music.

The audio device should schedule notes locally. Visuals and lighting should
use the same musical timeline with measured latency compensation. Existing
lighting clock estimation is an initial LAN test, not a complete distributed
synchronization solution. Browser audio still requires an initial user gesture.
