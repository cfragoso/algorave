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

test('rename, delete and restore support bundled and generated songs without changing loaded decks',async t=>{
 const {call,song,directory}=await fixture(t);
 await call('POST','/api/songs',song);
 const before=(await call('GET','/api/session/state')).body.decks;
 for(const id of ['live-set',song.id]){
   const renamed=await call('PATCH','/api/songs/'+id,{name:'Renamed '+id});
   assert.equal(renamed.status,200);assert.equal(renamed.body.name,'Renamed '+id);
   const removed=await call('DELETE','/api/songs/'+id);
   assert.equal(removed.status,200);assert.equal(removed.body.deleted,true);
   assert.equal((await call('GET','/api/songs')).body.some(s=>s.id===id),false);
   assert.ok((await call('GET','/api/songs/deleted')).body.some(s=>s.id===id&&s.name==='Renamed '+id));
   assert.equal((await call('POST','/api/songs',{...song,id})).status,409);
   assert.equal((await call('PATCH','/api/songs/'+id,{name:'Invalid while deleted'})).status,404);
   const restored=await call('POST','/api/songs/'+id+'/restore',{});
   assert.equal(restored.status,200);assert.equal(restored.body.name,'Renamed '+id);
 }
 assert.deepEqual((await call('GET','/api/session/state')).body.decks,before);
 const store=createSongStore(directory),bundled=JSON.parse(await readFile(new URL('../../songs/live-set/session.json',import.meta.url)));
 assert.notEqual(bundled.name,'Renamed live-set');
 assert.equal((await store.apply([bundled]))[0].name,'Renamed live-set');
});

test('catalogue edits validate names, missing IDs and authentication',async t=>{
 const {call}=await fixture(t,'edit-token');
 for(const method of ['PATCH','DELETE'])assert.equal((await call(method,'/api/songs/live-set',{name:'Test'},'')).status,401);
 for(const name of ['', ' ', 'x'.repeat(121),null])assert.equal((await call('PATCH','/api/songs/live-set',{name})).status,400);
 assert.equal((await call('DELETE','/api/songs/missing')).status,404);
 assert.equal((await call('POST','/api/songs/missing/restore',{})).status,404);
});

test('concurrent library name edits persist both changes',async t=>{
 const {call}=await fixture(t);
 const results=await Promise.all([call('PATCH','/api/songs/live-set',{name:'Concurrent A'}),call('PATCH','/api/songs/night-bus',{name:'Concurrent B'})]);
 assert.ok(results.every(result=>result.status===200));
 const songs=(await call('GET','/api/songs')).body;
 assert.equal(songs.find(song=>song.id==='live-set').name,'Concurrent A');
 assert.equal(songs.find(song=>song.id==='night-bus').name,'Concurrent B');
});
