import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSong} from '../song-generator.js';

test('phrases reproducibly shape the music while every saved song gets a unique ID',()=>{
 const a=generateSong('Warm deep house at 123 BPM'),b=generateSong('Warm deep house at 123 BPM');
 assert.deepEqual(a.tracks,b.tracks);assert.notEqual(a.id,b.id);assert.equal(a.bpm,123);assert.match(a.key,/major$/);
 assert.deepEqual(a.tracks.map(t=>t.column),[1,2,3,4,5,6,7,8]);
 for(const [genre,bpm] of [['techno',134],['trance',138],['ambient',90],['house',122]])assert.equal(generateSong(genre).bpm,bpm);
 assert.notDeepEqual(a.tracks,generateSong('Dark techno').tracks);
});
test('invalid prompts are rejected and text cannot introduce code statements',()=>{
 for(const phrase of ['', ' ',null,'x'.repeat(501),'house 999 BPM'])assert.throws(()=>generateSong(phrase));
 const song=generateSong('hello\nkick$: hacked(); //');
 assert.ok(song.code.startsWith('// hello kick$: hacked(); //\n'));
 assert.equal((song.code.match(/setcpm\(/g)||[]).length,1);
});
