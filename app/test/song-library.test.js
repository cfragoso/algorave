import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createControlServer} from '../server.js';
import {createSongStore} from '../song-store.js';

async function fixture(t, token='') {
  const directory=await mkdtemp(path.join(tmpdir(),'algorave-library-'));
  const {server,ws}=await createControlServer({songDir:directory,token});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{ws.clients.forEach(client=>client.terminate());await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${server.address().port}`;
  const call=async(method,resource,input,auth=token)=>{const response=await fetch(url+resource,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(input?{body:JSON.stringify(input)}:{})});return {status:response.status,body:await response.json()};};
  const base=JSON.parse(await readFile(new URL('../../songs/live-set/session.json',import.meta.url)));
  const song={...base,id:'generated-test',name:'Generated test'};
  return {directory,call,song};
}

test('song creation persists and refreshes catalogue without an audio player or deck mutation',async t=>{
  const {directory,call,song}=await fixture(t);
  const before=(await call('GET','/api/session/state')).body;
  const created=await call('POST','/api/songs',song);
  assert.equal(created.status,201);
  assert.ok(created.body.code.includes('setcpm'));
  assert.ok((await call('GET','/api/songs')).body.some(item=>item.id===song.id));
  const after=(await call('GET','/api/session/state')).body;
  assert.deepEqual(after.decks,before.decks);
  assert.equal((await createSongStore(directory).list())[0].id,song.id);
  assert.equal((await call('POST','/api/songs',song)).status,409);
  assert.equal((await call('POST','/api/songs',{...song,id:'live-set'})).status,409);
});

test('song creation rejects unauthorized, unsafe IDs and invalid scores',async t=>{
  const {call,song}=await fixture(t,'test-library-token');
  assert.equal((await call('POST','/api/songs',song,'')).status,401);
  for(const id of ['../escape','/absolute','bad/id'])assert.equal((await call('POST','/api/songs',{...song,id})).status,400);
  assert.equal((await call('POST','/api/songs',{...song,code:'kick$: s('})).status,400);
  assert.equal((await call('POST','/api/songs',{...song,tracks:[]})).status,400);
  assert.equal((await call('GET','/api/songs')).body.some(item=>item.id===song.id),false);
});

test('shared generation endpoint saves to the same library and does not alter the decks',async t=>{
 const {call}=await fixture(t),before=(await call('GET','/api/session/state')).body.decks;
 const created=await call('POST','/api/songs/generate',{phrase:'Dark deep house 122 BPM'});
 assert.equal(created.status,201);assert.equal(created.body.generation.genre,'house');assert.equal(created.body.bpm,122);
 assert.ok((await call('GET','/api/songs')).body.some(song=>song.id===created.body.id));
 assert.deepEqual((await call('GET','/api/session/state')).body.decks,before);
 assert.equal((await call('POST','/api/songs/generate',{phrase:''})).status,400);
});
