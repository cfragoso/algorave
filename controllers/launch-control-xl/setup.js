// RUN ONCE before the set, in the same Strudel tab as your live score.
// This connects MIDI, resets to an audible mix and installs liveStrip().
// Afterwards replace the editor with songs/live-set/score.js.
// Reloading the page removes liveStrip(); run this setup again after reload.
const USE_MIDI = true;
const MIDI_INPUT = 'Launch Control XL';
await samples({
  nightvox: [
    'numbers/1.wav',
    'numbers/2.wav',
    'numbers/3.wav',
    'numbers/4.wav',
    'yeah/000_Sound0.wav',
  ],
}, 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/');

const controls = Array.from({ length: 8 }, (_, i) => ({
  volume: 77 + i, cutoff: 13 + i, resonance: 29 + i,
  reverb: 49 + i,
  mute: [41, 42, 43, 44, 57, 58, 59, 60][i],
  solo: [73, 74, 75, 76, 89, 90, 91, 92][i],
}));
// Keep our mix separate from Strudel's persisted midin() cache.
// An untouched fader starts at a useful level, rather than zero.
// RESET_MIX=true resets software levels/mute/solo on the next evaluation.
const RESET_MIX = true;
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

// Expose only the mixer helper to the next editor evaluation.
globalThis.liveStrip = strip;
console.log('[Live set] Setup ready. Replace editor with the live score.');
silence;
