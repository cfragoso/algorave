// Launch Control XL / Mk2: custom USER template, not a factory mapping.
// Configure each physical column on its own MIDI channel (columns 1..8).
// On every column: fader CC7, top knob CC74, middle knob CC71,
// bottom knob CC91, top button CC20, bottom button CC21.
// Knobs/faders: absolute CC, min 0 / max 127.
// Both buttons: CC, Toggle, off 0 / on 127.
// Save your existing user template before replacing it in Novation Components.

// Replace this with the exact MIDI INPUT name reported by your browser.
const cc = await midin('Launch Control XL');
setcpm(120 / 4);

// midin exposes CC input as values normalized to 0..1.
// Its second argument selects the MIDI channel, numbered 1..16.
const channels = [1, 2, 3, 4, 5, 6, 7, 8];
const anySolo = channels.map(ch => cc(21, ch))
  .reduce((total, value) => total.add(value));

function strip(channel, pattern) {
  const volume = cc(7, channel);
  const notMuted = cc(20, channel).lt(0.5);
  const soloAllowed = anySolo.lt(0.5)
    .add(cc(21, channel).gt(0.5)).gt(0);
  return pattern
    .gain(0.35)
    .lpf(cc(74, channel).range(100, 12000))
    .lpq(cc(71, channel).range(0.5, 5))
    .room(cc(91, channel).mul(0.6))
    .postgain(volume.mul(notMuted).mul(soloAllowed));
}

// Eight independently controlled parts. Replace these with your own patterns.
// Built-in drum samples must be loaded by the Strudel REPL.
$: strip(1, s("bd*4"))
$: strip(2, s("~ sd ~ sd"))
$: strip(3, s("hh*8"))
$: strip(4, s("~ oh ~ oh"))
$: strip(5, note("c2 ~ c2 eb2").s("sawtooth").decay(0.15).sustain(0))
$: strip(6, note("<c3 eb3 g3 bb3>").s("triangle").decay(0.3).sustain(0))
$: strip(7, note("c4 eb4 g4 bb4").s("sine").decay(0.12).sustain(0))
$: strip(8, note("<c3 g3 eb3 bb3>").s("sine").attack(0.1).release(0.3))

// After evaluation: move each fader and open its top knob so values are sent.
// Initial values may not match the hardware positions until a control moves.
// Mute/solo affect newly scheduled events. Existing notes and effect tails
// aren't a hard audio-bus mute. This example does not send LED feedback.
