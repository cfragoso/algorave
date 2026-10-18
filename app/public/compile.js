import {transpiler} from '@strudel/transpiler';
import {captureSource, trackId, trackIds} from './source.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export async function compileSong(song, mixer) {
  const captured = [], allTransforms = [], eachTransforms = [];
  let bpm = song.bpm;
  const setTempo = value => {
    bpm = Number(value?.__value ?? value);
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 250) throw new Error('Tempo must be 40–250 BPM');
    return globalThis.silence;
  };
  const capture = (label, pattern) => {
    if (!pattern?.queryArc) throw new Error(label + ' must return a Strudel pattern');
    captured.push({label, pattern});
    return pattern;
  };
  const source = captureSource(song.code);
  const output = transpiler(source, {emitMiniLocations: false, emitWidgets: false, addReturn: false}).output;
  // Code is evaluated in a function scope. Musical tempo and pattern changes are
  // staged here, so syntax/query failures do not alter the running scheduler.
  const evaluate = new AsyncFunction('__capture', 'setcpm', 'setCpm', 'setcps', 'all', 'each', 'liveStrip', 'strip',
    '"use strict";\n' + output);
  await evaluate(capture, value => setTempo(Number(value) * 4), value => setTempo(Number(value) * 4),
    value => setTempo(Number(value) * 240), transform => allTransforms.push(transform),
    transform => eachTransforms.push(transform), (_column, pattern) => pattern, (_column, pattern) => pattern);
  const patterns = captured.map(({label, pattern}) => {
    const index = trackIds.indexOf(trackId(label));
    for (const transform of eachTransforms) pattern = transform(pattern);
    return index < 0 ? pattern : mixer.strip(index + 1, pattern);
  });
  let pattern = patterns.length ? globalThis.stack(...patterns) : globalThis.silence;
  for (const transform of allTransforms) pattern = transform(pattern);
  pattern.queryArc(0, 1);
  return {pattern, bpm};
}
