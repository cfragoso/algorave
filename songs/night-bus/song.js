// NIGHT BUS — an original eight-part techno sketch, 134 BPM, E minor.
// Paste this whole file into the Strudel REPL and evaluate.
// MIDI is enabled. Set USE_MIDI=false to listen without the controller.
const USE_MIDI = true;
const MIDI_INPUT = 'Launch Control XL'; // use the exact browser input name
setcpm(134 / 4);

// Spoken vocal samples from TidalCycles Dirt-Samples. Internet required.
// This custom name leaves the REPL's default drum sample map intact.
await samples({
  nightvox: [
    'numbers/1.wav',
    'numbers/2.wav',
    'numbers/3.wav',
    'numbers/4.wav',
    'yeah/000_Sound0.wav',
  ],
}, 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/');

// Current Launch Control XL template, captured on 2026-10-16.
// All eight columns are confirmed from physical movements.
// Faders: CC77..84 on MIDI channel 2.
// On MIDI channel 1: top knobs CC13..20, middle CC29..36,
// bottom CC49..56. Buttons split after column 4:
// upper CC41..44 then CC57..60; lower CC73..76 then CC89..92.
// Buttons use received toggle state: off 0 / on 127.
// Keep the same hardware template selected; no reprogramming is required.
const controls = Array.from({ length: 8 }, (_, i) => ({
  volume: 77 + i, cutoff: 13 + i, resonance: 29 + i,
  reverb: 49 + i,
  mute: [41, 42, 43, 44, 57, 58, 59, 60][i],
  solo: [73, 74, 75, 76, 89, 90, 91, 92][i],
}));
// Keep our mix separate from Strudel's persisted midin() cache.
// An untouched fader starts at a useful level, rather than zero.
// RESET_MIX=true resets software levels/mute/solo on the next evaluation.
const RESET_MIX = false;
let cc = null;
const previous = globalThis.nightBusMidi;
if (previous?.input && previous?.handler) {
  previous.input.removeEventListener('midimessage', previous.handler);
}
if (previous?.ledTimer) clearInterval(previous.ledTimer);
if (previous?.ledPending) clearTimeout(previous.ledPending);
if (USE_MIDI) {
  const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
  const input = [...midiAccess.inputs.values()].find(port => port.name === MIDI_INPUT);
  const output = [...midiAccess.outputs.values()].find(port => port.name === MIDI_INPUT);
  if (!input) throw new Error('Launch Control XL MIDI input is unavailable');
  const defaults = {};
  const buttonKeys = new Set();
  for (const control of controls) {
    defaults['2:' + control.volume] = 0.65;
    defaults['1:' + control.cutoff] = 0.75;
    defaults['1:' + control.resonance] = 0;
    defaults['1:' + control.reverb] = 0.05;
    defaults['1:' + control.mute] = 0;
    defaults['1:' + control.solo] = 0;
    buttonKeys.add('1:' + control.mute);
    buttonKeys.add('1:' + control.solo);
  }
  const state = {
    input, output, ledTemplate: previous?.ledTemplate ?? null,
    values: !RESET_MIX && previous?.values ? previous.values : { ...defaults },
    handler: null, ledTimer: null, ledPending: null, ledErrorLogged: false,
    reset() {
      this.values = { ...defaults };
      this.renderLEDs();
    },
    renderLEDs() {
      if (!this.output || this.output.state === 'disconnected') return;
      const soloActive = controls.some(control => this.values['1:' + control.solo] > 0.5);
      try {
        const pairs = [];
        controls.forEach((control, index) => {
          const muted = this.values['1:' + control.mute] > 0.5;
          const soloed = this.values['1:' + control.solo] > 0.5;
          const enabled = !muted && (!soloActive || soloed);
          // Physical LED indices are independent of the controls' CC numbers.
          // Upper buttons: 24..31; lower: 32..39. Colours: off12/green60/amber63.
          pairs.push(24 + index, enabled ? 60 : 12, 32 + index, soloed ? 63 : 12);
        });
        // Until a template-change message identifies the selected slot, update
        // only these 16 LED colours in all slots. No mappings/settings are written.
        const templates = this.ledTemplate === null
          ? Array.from({ length: 16 }, (_, index) => index) : [this.ledTemplate];
        for (const template of templates) {
          this.output.send([0xf0, 0, 0x20, 0x29, 2, 0x11, 0x78, template, ...pairs, 0xf7]);
        }
      } catch (error) {
        if (!this.ledErrorLogged) console.warn('[Night Bus] LED output unavailable', error);
        this.ledErrorLogged = true;
      }
    },
  };
  state.handler = event => {
    const data = event.data;
    if (data.length === 9 && data[8] === 0xf7 && data[7] < 16 &&
        [0xf0, 0, 0x20, 0x29, 2, 0x11, 0x77].every((value, i) => data[i] === value)) {
      state.ledTemplate = data[7];
      state.renderLEDs();
      return;
    }
    const [status, number, raw] = data;
    if ((status & 0xf0) !== 0xb0 || raw === undefined) return;
    const key = ((status & 0x0f) + 1) + ':' + number;
    if (!(key in defaults)) return;
    if (buttonKeys.has(key)) {
      // Verified template sends one CC (alternating 0/127) per press,
      // with no release CC. Toggle SOFTWARE state on either press value.
      // This keeps the next press useful after a software mixer reset.
      if (raw !== 0 && raw !== 127) return;
      state.values[key] = state.values[key] > 0.5 ? 0 : 1;
      clearTimeout(state.ledPending);
      state.ledPending = setTimeout(() => state.renderLEDs(), 20);
    } else {
      state.values[key] = raw / 127;
    }
  };
  input.addEventListener('midimessage', state.handler);
  globalThis.nightBusMidi = state;
  cc = (number, channel) => ref(() => state.values[channel + ':' + number] ?? 0);
  state.renderLEDs();
  // Reassert software state after template changes or automatic device LEDs.
  state.ledTimer = setInterval(() => state.renderLEDs(), 1000);
  if (!output) console.warn('[Night Bus] MIDI input ready, but no matching LED output found.');
  console.log('[Night Bus] MIDI ready: upper green=enabled, off=muted/excluded; lower amber=solo.');
}

const anySolo = USE_MIDI
  ? controls.map(control => cc(control.solo, 1))
      .reduce((a, b) => a.add(b))
  : null;

function strip(channel, pattern) {
  if (!USE_MIDI) return pattern;
  const control = controls[channel - 1];
  const audible = cc(control.mute, 1).lt(0.5);
  const soloAllowed = anySolo.lt(0.5)
    .add(cc(control.solo, 1).gt(0.5)).gt(0);
  return pattern
    .lpf(cc(control.cutoff, 1).range(100, 12000))
    .lpq(cc(control.resonance, 1).range(0.5, 5))
    .room(cc(control.reverb, 1).mul(0.6))
    .postgain(cc(control.volume, 2).mul(audible).mul(soloAllowed));
}

// Each cycle = one four-beat bar. Every part shares this 96-bar timeline.
// Intro 8 | groove 16 | main 16 | breakdown 8 | build 8 | drop 24 | outro 16
// The arrangement loops after approximately 2 minutes 52 seconds.
function song(intro, groove, main, breakdown, build, drop, outro) {
  return arrange(
    [8, intro], [16, groove], [16, main], [8, breakdown],
    [8, build], [24, drop], [16, outro],
  );
}

// 1 — Four-to-the-floor kick, with a more urgent drop variation.
const kick = s("bd*4").bank('tr909').gain(0.65);
const kickDrop = s("<bd*4 [bd bd bd [bd bd]]>")
  .bank('tr909').gain(0.62);
kick$: strip(1, song(kick, kick, kick, silence, silence, kickDrop, kick));

// 2 — Backbeat clap, occasional snare embellishment, build roll.
const clap = s("~ cp ~ cp").bank('tr909').gain(0.28);
const clapFill = stack(
  clap,
  s("<~ ~ ~ [~ ~ sd sd]>").bank('tr909').gain(0.12),
);
const buildRoll = s("<sd*4 sd*4 sd*8 sd*8 sd*8 sd*16 sd*16 sd*16>")
  .bank('tr909').gain(0.16);
clap$: strip(2, song(silence, clap, clapFill, silence, buildRoll, clapFill, clap));

// 3 — Closed hats: eighth notes become accented sixteenth notes.
const hats = s("hh*8").bank('tr909').gain("0.12 0.07");
const hatsFast = s("hh*16").bank('tr909')
  .gain("0.12 0.04 0.08 0.04");
hats$: strip(3, song(hats, hats, hatsFast, silence, hats, hatsFast, hats));

// 4 — Offbeat open hats and a quiet syncopated rim.
const openHats = s("~ oh ~ oh ~ oh ~ oh").bank('tr909')
  .gain(0.12).cut(4);
const percussion = stack(
  openHats,
  s("~ ~ rim ~ ~ rim ~ ~").bank('tr909').gain(0.10),
);
percussion$: strip(4, song(
  silence, openHats, percussion, silence, openHats, percussion, openHats,
));

// 5 — Short offbeat bass: space for the kick on every beat.
const bass = note("~ e2 ~ e2 ~ e2 ~ <e2 g2 b1 d2>")
  .s("sawtooth").attack(0.005).decay(0.12).sustain(0).release(0.06)
  .lpf(650).lpq(1).gain(0.19);
const bassDrop = note("~ e2 [~ e2] e2 ~ <g2 e2> ~ <d2 b1>")
  .s("sawtooth").attack(0.005).decay(0.10).sustain(0).release(0.05)
  .lpf(900).lpq(1.5).gain(0.18);
bass$: strip(5, song(silence, bass, bass, silence, silence, bassDrop, bass));

// 6 — Resonant acid-style lead. Top knob becomes its filter when MIDI is on.
const acid = note("e3 ~ e3 g3 b3 ~ d4 b3 e3 ~ g3 e3 d3 ~ b2 d3")
  .s("sawtooth").attack(0.005).decay(0.09).sustain(0).release(0.04)
  .lpf("<700 1100 1700 2400>").lpq(3).gain(0.09);
acid$: strip(6, song(silence, silence, acid, silence, acid, acid, silence));

// 7 — Minor chord stabs and an airy breakdown pad.
const stabs = note("<[e3,g3,b3] [e3,g3,b3] [d3,f#3,a3] [d3,f#3,a3]>")
  .struct("~ x ~ ~ ~ x ~ ~").s("triangle")
  .attack(0.01).decay(0.22).sustain(0).release(0.15)
  .room(0.3).gain(0.10);
const pad = note("<[e3,g3,b3] [d3,f#3,a3]>").slow(4).s("triangle")
  .attack(0.6).decay(0.4).sustain(0.5).release(1.2)
  .room(0.5).gain(0.07);
chords$: strip(7, song(silence, silence, stabs, pad, pad, stabs, silence));

// 8 — Spoken count / vocal chops; not a sung verse.
const voice = s("<[~ nightvox:0 ~ ~] [~ ~ nightvox:1 ~] [~ nightvox:2 ~ ~] [~ ~ ~ nightvox:4]>")
  .gain(0.20).hpf(300).room(0.25);
const voiceBreak = s("nightvox:0 ~ nightvox:1 ~ nightvox:2 ~ nightvox:3 ~")
  .slow(4).gain(0.20).hpf(300).room(0.4);
vocals$: strip(8, song(
  silence, silence, voice, voiceBreak, voiceBreak, voice, silence,
));

// PERFORMANCE: switch USE_MIDI=true and evaluate again. Move every fader
// and top knob to send its current value; start with resonance/reverb low.
// For a drop, mute bass and kick, open the acid filter, then bring them back.
// Mute/solo affect new events; existing notes/reverb may ring out.
