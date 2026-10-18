# Tools

## Read-only MIDI monitor (macOS)

From the repository root:

```sh
swift tools/midi-monitor.swift
```

Requires Apple's Swift command-line tools and access to the macOS MIDI service.
It lists MIDI inputs, connects to Launch Control sources and prints incoming
message bytes for ten minutes. It sends no messages or configuration changes.
For reliable mapping, move one physical control at a time and note its name.
