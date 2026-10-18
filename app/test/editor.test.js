import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import {withSource, replaceSource, partsIn, setSongTempo} from '../public/source.js';
import {patchTrack} from '../model.js';

register(new URL('../esm-resolution.mjs', import.meta.url));
const [core, mini, tonal, {compileSong}] = await Promise.all([
  import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'), import('../public/compile.js'),
]);
await core.evalScope(core, mini, tonal);
const preset = async id => withSource(JSON.parse(await readFile(new URL(`../../songs/${id}/session.json`, import.meta.url))));

test('whole-song Strudel code supports shared variables, labels, mini notation and staged tempo', async () => {
  const columns = [];
  const mixer = {strip(column, pattern) { columns.push(column); return pattern; }};
  const code = `setcpm(140 / 4);\nconst phrase = note("e2 g2");\nkick$: s("bd*4");\nbass$: phrase.s('square');`;
  const song = replaceSource(await preset('live-set'), code);
  const result = await compileSong(song, mixer);
  assert.equal(result.bpm, 140);
  assert.deepEqual(columns, [1, 5]);
  const events = result.pattern.queryArc(0, 1);
  assert.equal(events.length, 6);
  assert.equal(events.filter(event => event.value.s === 'square').length, 2);
  assert.equal(song.tracks[4].enabled, true);
  assert.equal(song.tracks[1].enabled, false);
});

test('API track edits rewrite the shared score while preserving setup and other parts', async () => {
  let song = replaceSource(await preset('live-set'), `// Keep this setup\nsetcpm(134/4);\nconst phrase = note("e2 g2");\nkick$: s("bd*4");\nbass$: phrase.s('sawtooth');`);
  song = patchTrack(song, 'bass', {sound: 'square'});
  assert.match(song.code, /const phrase/);
  assert.match(song.code, /kick\$: s\("bd\*4"\)/);
  assert.match(song.code, /\.s\('square'\)/);
  song = patchTrack(song, 'bass', {sound: null});
  assert.doesNotMatch(song.code, /square/);
  song = patchTrack(song, 'bass', {enabled: false});
  assert.equal(partsIn(song.code).some(part => part.id === 'bass'), false);
  song = patchTrack(song, 'bass', {enabled: true});
  assert.equal(partsIn(song.code).filter(part => part.id === 'bass').length, 1);
  const result = await compileSong(song, {strip: (_column, pattern) => pattern});
  assert.equal(result.pattern.queryArc(0, 1).length, 6);
});

test('existing presets compile and failed code/tempo is rejected before playback changes', async () => {
  for (const id of ['live-set', 'night-bus', 'south-african-awakening', 'german-renaissance']) {
    const result = await compileSong(await preset(id), {strip: (_column, pattern) => pattern});
    assert.ok(result.pattern.queryArc(0, 1).length);
    if(id==='german-renaissance'){
      assert.equal(result.bpm,140);for(let bar=0;bar<144;bar++)assert.ok(result.pattern.queryArc(bar,bar+1).length);
      assert.equal(result.pattern.queryArc(32,33).filter(h=>h.context.algoraveTrack==='lead').length,16);
    }
    if (id === 'south-african-awakening') {
      assert.equal(result.bpm, 122);
      // Query the complete arrangement, including parts absent in the intro.
      for (let bar = 0; bar < 128; bar++) assert.ok(result.pattern.queryArc(bar, bar + 1).length);
    }
  }
  const song = await preset('live-set');
  assert.throws(() => replaceSource(song, 'kick$: s('));
  assert.throws(() => replaceSource(song, 'bass$: silence; bass$: silence;'), /only one/);
  await assert.rejects(compileSong({...song, code: 'setcpm(999); kick$: silence;'}, {}), /Tempo/);
  await assert.rejects(compileSong({...song, code: 'kick$: s("bd").missingFunction();'}, {}), /missingFunction/);
});

test('unlabeled patterns and top-level await run once', async () => {
  let calls = 0;
  globalThis.editorTestSetup = async () => { calls++; };
  const song = {...await preset('live-set'), code: 'await editorTestSetup(); s("bd*4")'};
  const result = await compileSong(song, {});
  assert.equal(calls, 1);
  assert.equal(result.pattern.queryArc(0, 1).length, 4);
  delete globalThis.editorTestSetup;
});

test('scheduled events retain original token and part locations through compilation and shared variables', async () => {
  const code = `// Source positions must match this editor text\nsetcpm(122/4);\nconst phrase = note("e2 g2");\nkick$: s("bd sd");\nbass$: phrase.s('triangle');`;
  const song = replaceSource(await preset('live-set'), code);
  const {pattern} = await compileSong(song, {strip: (_column, pattern) => pattern});
  const events = pattern.queryArc(0, 1);
  for (const event of events) {
    assert.equal(event.context.algoraveSource, code);
    assert.ok(event.context.locations.length);
    const tokens = event.context.locations.map(range => code.slice(range.start, range.end));
    assert.ok(tokens.some(token => ['bd', 'sd', 'e2', 'g2'].includes(token)), tokens.join(','));
    const label = event.context.algoraveLabel;
    assert.equal(code.slice(label.start, label.end), event.context.algoraveTrack + '$');
  }
});

test('deck tempo changes update the canonical score and preserve shared instruments', async()=>{
  const original=await preset('south-african-awakening');
  const updated=setSongTempo(original,124.5);
  assert.match(updated.code,/setcpm\(124.5 \/ 4\)/);
  const result=await compileSong(updated,{strip:(_column,pattern)=>pattern});
  assert.equal(result.bpm,124.5);assert.ok(result.pattern.queryArc(8,9).length);
  assert.throws(()=>setSongTempo(original,999),/Tempo/);
});
