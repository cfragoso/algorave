import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMixer} from '../public/mixer.js';

test('verified button toggles, solo exclusions, fader channel and reconnect preserve audible state', async t => {
  const mapping = JSON.parse(await readFile(new URL('../../controllers/launch-control-xl/mapping.json', import.meta.url)));
  const sent = [];
  const input = new EventTarget();
  Object.assign(input, {name: mapping.input_name, state: 'connected'});
  const output = {name: mapping.input_name, state: 'connected', send: frame => sent.push(frame)};
  const access = {inputs: new Map([['input', input]]), outputs: new Map([['output', output]])};
  Object.defineProperty(navigator, 'requestMIDIAccess', {value: async () => access, configurable: true});
  t.after(() => delete navigator.requestMIDIAccess);
  const signal = get => ({get, range: (a, b) => signal(() => a + get() * (b - a)), mul: v => signal(() => get() * (v.get ? v.get() : v))});
  const mixer = createMixer(mapping, signal);
  t.after(() => mixer.disconnect());
  const gain = column => {
    let result;
    const pattern = {lpf() { return this; }, lpq() { return this; }, room() { return this; }, postgain(value) { result = value.get(); return this; }};
    mixer.strip(column, pattern);
    return result;
  };
  const cc = (channel, number, value) => {
    const event = new Event('midimessage');
    event.data = [0xb0 + channel - 1, number, value];
    input.dispatchEvent(event);
  };
  const led = index => {
    const frame = sent.at(-1);
    const pairs = frame.slice(8, -1);
    for (let i = 0; i < pairs.length; i += 2) if (pairs[i] === index) return pairs[i + 1];
  };
  await mixer.connect();
  assert.equal(gain(1), 0.65); assert.equal(led(24), 60);
  cc(1, 41, 127); assert.equal(gain(1), 0);
  await new Promise(r => setTimeout(r, 25)); assert.equal(led(24), 12);
  cc(1, 41, 0); assert.equal(gain(1), 0.65);
  cc(1, 90, 127); assert.equal(gain(1), 0); assert.equal(gain(6), 0.65);
  await new Promise(r => setTimeout(r, 25)); assert.equal(led(37), 63);
  mixer.reset(); assert.equal(gain(1), 0.65); assert.equal(led(37), 12);
  cc(1, 77, 0); assert.equal(gain(1), 0.65); // Fader actually uses channel 2.
  cc(2, 77, 64); assert.equal(gain(1), 64 / 127);
  assert.equal(mixer.snapshot().values[0].volume, 64 / 127);
  assert.ok(mixer.snapshot().received[0].includes('volume'));
  assert.equal(mixer.snapshot().connected, true);
  await mixer.connect();
  cc(1, 41, 127); assert.equal(gain(1), 0); // Reconnect must not double-register the listener.
  mixer.reset(); assert.equal(gain(1), 0.65);
  mixer.set(1, 'volume', 0.4); assert.equal(gain(1), 0.4);
  mixer.set(1, 'mute', 1); assert.equal(gain(1), 0); assert.equal(led(24), 12);
  assert.throws(()=>mixer.set(9,'volume',0.4));
});
