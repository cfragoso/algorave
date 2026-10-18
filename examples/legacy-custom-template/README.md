> Legacy proposal: this is NOT the template verified on the connected controller. Use [the current mapping](../../controllers/launch-control-xl/mapping.json).

# Launch Control XL / Mk2 → Strudel

This is a proposed custom user template, not the factory MIDI layout.
It maps physical columns 1–8 to musical parts and MIDI channels 1–8.
For the XL 3, configure the equivalent Custom Mode with absolute CC values;
the hardware UI and factory mappings differ from Mk1/Mk2.

## Configure the controller

Connect it over USB. Open https://components.novationmusic.com/ in Chrome,
select your exact model, and allow its MIDI access. Read and save your
existing user template before changing a slot. Set these controls on each
column, using that column's number as the MIDI channel for all six controls:

| Control | Message | Meaning |
| --- | --- | --- |
| Fader | CC 7 | Volume |
| Top knob | CC 74 | Low-pass cutoff, 100–12,000 Hz |
| Middle knob | CC 71 | Filter resonance, 0.5–5 |
| Bottom knob | CC 91 | Reverb amount, 0–0.6 |
| Top button | CC 20 | Mute |
| Bottom button | CC 21 | Solo |

Use absolute values 0–127 for faders and knobs. Set buttons to **CC**
(not Note), **Toggle**, off value **0**, on value **127**. Send the completed
template to a user slot and select that user template on the controller.
There are eight physical columns; they don't have to use distinct MIDI
channels in general, but this custom mapping deliberately does.

## Run the example

Open Strudel in Chrome, permit MIDI access, and paste
`examples/legacy-custom-template/example.js`. Change the `midin` input name if needed.
To list input names, run the following in Chrome's developer console:

```javascript
const midi = await navigator.requestMIDIAccess();
console.table([...midi.inputs.values()].map(input => ({name: input.name, state: input.state})));
```

Evaluate with Ctrl+Enter, then move fader 1 and turn its top knob up to hear
the kick. Repeat for the other strips. MIDI controllers do not necessarily
report all physical positions when an application first connects. Mute/solo
also start from the values last received by Strudel, which may differ from
the controller's remembered toggle states; press twice if needed to align.

The top button toggles mute; the bottom toggles solo. Several parts can be
soloed together. With no solos, all unmuted parts play. Mute takes priority
over solo. Changes affect subsequently scheduled events, not an immediate
bus-level cut of sustained sound or reverb. These ordinary pattern parameters
also do not continuously reshape a note that is already sounding.

This example uses direct browser MIDI input, independent of the DMX bridge.
It does not update the controller's LEDs from Strudel or provide motor-fader
pickup. A later distributed MIDI gateway can expose the same logical controls.

## Using your own musical parts

Wrap each part in `strip(column, pattern)`, for example:

```javascript
$: strip(5, note("c2 eb2 g2 bb1").s("sawtooth"))
```

To preserve a pattern's existing gain accents, replace `.gain(0.35)` in the
helper with an appropriate per-part level strategy. The example deliberately
uses a modest common gain while eight parts may play together.

## Verification

JavaScript syntax has been checked. The custom template has not been sent
to your controller, and physical mappings need testing after configuration.

Sources:
- https://support.novationmusic.com/hc/en-gb/articles/4411807214226-Launch-Control-XL-MK-1-and-2-Components-guide
- https://strudel.cc/learn/input-output/
