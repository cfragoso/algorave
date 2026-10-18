import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAudio, normalizeTelemetry} from '../public/monitor.js';

test('master waveform reports measured PCM and RMS rather than pattern events', () => {
  const samples = new Float32Array(2048).fill(0.25), frequencies = new Uint8Array(1024);
  const result = summarizeAudio(samples, frequencies, 48000);
  assert.equal(result.peak, 0.25); assert.equal(result.rms, 0.25);
  assert.equal(result.wave.length, 256); assert.ok(result.wave.every(value=>value===0.25));
  const normalized = normalizeTelemetry({cycle: 1, elapsed: 2, playing: true, audio: result});
  assert.equal(normalized.audio.rms, 0.25);
  assert.equal(normalizeTelemetry({cycle: NaN, elapsed: 0}), null);
  assert.equal(normalizeTelemetry({cycle: 1, elapsed: 0, audio: {...result, wave:[1,2]}}).audio, undefined);
});
