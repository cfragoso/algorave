// Paste all of this into Strudel and allow MIDI access.
// Confirmed from live MIDI capture: leftmost fader = CC77, channel 2.
// Top-left knob = CC13, channel 1 (cutoff).
// Middle-left knob = CC29, channel 1 (resonance).
// Bottom-left knob = CC49, channel 1 (reverb).
// Upper-left button = CC41, channel 1 (mute: 127 on, 0 off).
// Use the same controller template that was active during the capture.
const cc = await midin('Launch Control XL');
setcpm(134 / 4);
$: s("bd*4").bank('tr909')
  .gain(0.5)
  .lpf(cc(13, 1).range(80, 12000))
  .lpq(cc(29, 1).range(0.5, 5))
  .room(cc(49, 1).mul(0.6))
  .postgain(cc(77, 2).mul(cc(41, 1).lt(0.5)));
// Move the leftmost fader: down = silence, up = louder kick.
// Turn the top-left knob: left = darker, right = brighter.
// Upper-left button: CC127 mutes new events, CC0 restores them.
