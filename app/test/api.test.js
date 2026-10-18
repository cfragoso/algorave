import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createControlServer} from '../server.js';

async function fixture(t, options = {}) {
  const {server, ws} = await createControlServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { ws.clients.forEach(client => client.terminate()); await new Promise(resolve => server.close(resolve)); });
  const request = async (url, method = 'GET', data, headers = {}) => {
    const res = await fetch(base + url, {method, headers: {'Content-Type': 'application/json', ...headers}, ...(data ? {body: JSON.stringify(data)} : {})});
    return {status: res.status, body: await res.json(), headers: res.headers};
  };
  const connect = async (headers, query = '') => {
    const client = new WebSocket(base.replace('http:', 'ws:') + '/ws' + query, {headers});
    const messages = [];
    client.on('message', raw => messages.push(JSON.parse(raw)));
    await once(client, 'open');
    const wait = async type => {
      for (let i = 0; i < 100; i++) {
        const index = messages.findIndex(message => message.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error('No message: ' + type);
    };
    return {client, wait, send: value => client.send(JSON.stringify(value))};
  };
  return {request, connect};
}

test('edits commit only after the designated player accepts; errors retain the previous song', async t => {
  const {request, connect} = await fixture(t);
  assert.equal((await request('/api/songs/load', 'POST', {id: 'night-bus'})).status, 409);
  const player = await connect(); player.send({type: 'claim'}); await player.wait('sync');
  const edit = await request('/api/tracks/bass', 'PATCH', {sound: 'square'});
  assert.equal(edit.status, 202);
  const command = await player.wait('apply');
  assert.equal(command.song.tracks[4].sound, 'square');
  assert.equal((await request('/api/state')).body.revision, 0);
  assert.equal((await request('/api/tracks/kick', 'PATCH', {enabled: false})).status, 409);
  const observer = await connect();
  observer.send({type: 'result', jobId: edit.body.id, ok: true});
  assert.equal((await request('/api/state')).body.revision, 0);
  player.send({type: 'result', jobId: edit.body.id, ok: true}); await player.wait('state');
  // Poll because state broadcasts also include the earlier pending notification.
  for (let i = 0; i < 50 && (await request('/api/state')).body.revision === 0; i++) await new Promise(r => setTimeout(r, 5));
  const state = (await request('/api/state')).body;
  assert.equal(state.revision, 1); assert.equal(state.song.tracks[4].sound, 'square');
  const bad = await request('/api/tracks/bass', 'PATCH', {code: 'broken('});
  await player.wait('apply');
  player.send({type: 'result', jobId: bad.body.id, ok: false, error: 'Syntax error'});
  for (let i = 0; i < 50 && (await request('/api/jobs/' + bad.body.id)).body.status === 'pending'; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal((await request('/api/jobs/' + bad.body.id)).body.status, 'failed');
  assert.equal((await request('/api/state')).body.song.tracks[4].code, state.song.tracks[4].code);
  assert.equal((await request('/api/tracks/bass', 'PATCH', {column: 1})).status, 400);
  observer.send({type: 'claim'}); assert.match((await observer.wait('error')).error, /Another/);
  player.send({type: 'release'});
  for (let i = 0; i < 50 && (await request('/api/state')).body.playerConnected; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal((await request('/api/state')).body.playerConnected, false);
  observer.send({type: 'claim'});
  const transferred = await observer.wait('sync');
  assert.equal(transferred.revision, 1);
  assert.equal(transferred.song.tracks[4].sound, 'square');
  observer.send({type: 'playback', playing: true});
  observer.send({type: 'activity', revision: 1, ranges: [{start: 0, end: 2}, {start: -1, end: 1}], labels: []});
  const activity = await player.wait('activity');
  assert.deepEqual(activity.ranges, [{start: 0, end: 2}]);
  observer.send({type:'telemetry',revision:1,frame:{cycle:1,elapsed:2,playing:true}});
  assert.equal((await player.wait('telemetry')).frame.elapsed,2);
});

test('authentication, browser session cookies and origin checks', async t => {
  const token = 'test-token-with-at-least-24-characters';
  const {request, connect} = await fixture(t, {token});
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await request('/api/session', 'POST', {}, {Authorization: 'Bearer wrong'})).status, 401);
  const login = await request('/api/session', 'POST', {}, {Authorization: 'Bearer ' + token});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/state', 'GET', null, {Cookie: cookie})).status, 200);
  assert.equal((await request('/api/state', 'GET', null, {Authorization: 'Bearer ' + token, Origin: 'http://evil.example'})).status, 403);
  const player = await connect({Cookie: cookie}); player.send({type: 'claim'}); await player.wait('sync');
  const catalog = (await request('/api/songs', 'GET', null, {Authorization: 'Bearer ' + token})).body;
  for (const id of ['live-set', 'night-bus', 'south-african-awakening']) assert.ok(catalog.some(song => song.id === id));
  assert.equal((await request('/missing.js')).status, 404);
});

test('full editor updates share the track API and reject stale drafts', async t => {
  const {request, connect} = await fixture(t);
  const player = await connect(); player.send({type: 'claim'}); await player.wait('sync');
  const code = `setcpm(140/4); const phrase = note("e2 g2"); kick$: s("bd*4"); bass$: phrase.s('sawtooth');`;
  const edit = await request('/api/code', 'POST', {code, revision: 0});
  assert.equal(edit.status, 202);
  const command = await player.wait('apply');
  assert.equal(command.song.code, code);
  assert.equal(command.song.tracks[4].enabled, true);
  player.send({type: 'result', jobId: edit.body.id, ok: true, bpm: 140});
  for (let i = 0; i < 50 && (await request('/api/state')).body.revision === 0; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal((await request('/api/state')).body.song.bpm, 140);
  assert.equal((await request('/api/code', 'POST', {code, revision: 0})).status, 409);
  const patch = await request('/api/tracks/bass', 'PATCH', {sound: 'square'});
  const updated = await player.wait('apply');
  assert.match(updated.song.code, /const phrase/);
  assert.match(updated.song.code, /\.s\('square'\)/);
  player.send({type: 'result', jobId: patch.body.id, ok: false, error: 'Test rejection'});
  for(let i=0;i<50 && (await request('/api/state')).body.pendingJob;i++)await new Promise(r=>setTimeout(r,5));
  const tempo=await request('/api/tempo','PATCH',{bpm:122});
  assert.equal(tempo.status,202);
  assert.match((await player.wait('apply')).song.code,/setcpm\(122 \/ 4\)/);
  player.send({type:'result',jobId:tempo.body.id,ok:true,bpm:122});
});

test('disconnects and timeouts fail pending updates without advancing revision', async t => {
  const {request, connect} = await fixture(t, {timeoutMs: 80});
  const player = await connect(); player.send({type: 'claim'}); await player.wait('sync');
  const job = await request('/api/songs/load', 'POST', {id: 'night-bus'});
  await new Promise(r => setTimeout(r, 120));
  assert.equal((await request('/api/jobs/' + job.body.id)).body.status, 'failed');
  assert.equal((await request('/api/state')).body.revision, 0);
  assert.equal((await request('/api/state')).body.playerConnected, false);
  const second = await connect(); second.send({type: 'claim'}); await second.wait('sync');
  const next = await request('/api/songs/load', 'POST', {id: 'night-bus'});
  second.client.close();
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await request('/api/jobs/' + next.body.id)).body.status, 'failed');
});

test('two decks isolate songs, edits, transport, failures and telemetry; main mixer requires acknowledgement',async t=>{
  const {request,connect}=await fixture(t);
  const host=await connect(undefined,'?scope=session');host.send({type:'claim'});const lease=await host.wait('sync');
  const a=await connect(undefined,'?deck=A'),b=await connect(undefined,'?deck=B'),outsider=await connect(undefined,'?deck=B');
  outsider.send({type:'claim'});assert.match((await outsider.wait('error')).error,/Another/);
  for(const player of [a,b]){player.send({type:'claim',ownerId:lease.ownerId});await player.wait('sync');}
  const loadA=await request('/api/decks/A/songs/load','POST',{id:'night-bus'});
  const loadB=await request('/api/decks/B/songs/load','POST',{id:'south-african-awakening'});
  assert.equal(loadA.status,202);assert.equal(loadB.status,202);
  assert.equal((await a.wait('apply')).song.id,'night-bus');assert.equal((await b.wait('apply')).song.id,'south-african-awakening');
  a.send({type:'result',jobId:loadA.body.id,ok:true});b.send({type:'result',jobId:loadB.body.id,ok:true});
  async function settled(id){for(let i=0;i<100;i++){const result=await request('/api/jobs/'+id);if(result.body.status!=='pending')return result.body;await new Promise(r=>setTimeout(r,5));}throw new Error('Job did not settle');}
  await settled(loadA.body.id);await settled(loadB.body.id);
  let session=(await request('/api/session/state')).body;
  assert.equal(session.decks.A.song.id,'night-bus');assert.equal(session.decks.B.song.id,'south-african-awakening');
  const edit=await request('/api/decks/B/tracks/bass','PATCH',{sound:'square'});await b.wait('apply');b.send({type:'result',jobId:edit.body.id,ok:false,error:'Invalid pattern'});await settled(edit.body.id);
  assert.equal((await request('/api/decks/A/state')).body.revision,1);assert.equal((await request('/api/decks/B/state')).body.song.tracks[4].sound,null);
  const play=await request('/api/decks/B/transport','POST',{action:'play'});assert.equal((await b.wait('command')).operation.action,'play');b.send({type:'result',jobId:play.body.id,ok:true,playing:true});await settled(play.body.id);
  assert.equal((await request('/api/decks/B/state')).body.playback,true);assert.equal((await request('/api/decks/A/state')).body.playback,false);
  const mix=await request('/api/mixer','PATCH',{crossfader:1,channels:{A:{volume:0}}});assert.equal(mix.status,202);assert.equal((await request('/api/mixer')).body.crossfader,.5);
  const mixCommand=await host.wait('mixer');assert.equal(mixCommand.mixer.channels.A.volume,0);host.send({type:'result',jobId:mix.body.id,ok:true});await settled(mix.body.id);
  assert.equal((await request('/api/mixer')).body.crossfader,1);
  assert.equal((await request('/api/mixer','PATCH',{crossfader:2})).status,400);assert.equal((await request('/api/decks/C/state')).status,404);
  b.send({type:'telemetry',revision:1,frame:{cycle:3,elapsed:6,playing:true}});const frame=await host.wait('telemetry');assert.equal(frame.deck,'B');
  host.send({type:'release'});for(let i=0;i<100&&(await request('/api/decks/A/state')).body.playerConnected;i++)await new Promise(r=>setTimeout(r,5));
  session=(await request('/api/session/state')).body;assert.equal(session.playerConnected,false);assert.equal(session.decks.A.playerConnected,false);assert.equal(session.decks.B.playback,false);
});

test('named setups persist and restore both decks only after the audio owner acknowledges',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const directory=await mkdtemp(tmpdir()+'/algorave-setups-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const {request,connect}=await fixture(t,{setupDir:directory});
 const saved=await request('/api/setups','POST',{name:'Sunday in Berlin'});assert.equal(saved.status,201);
 assert.equal((await request('/api/setups/'+saved.body.id+'/load','POST',{})).body.status,'applied');
 const modified=structuredClone(saved.body);modified.name='Afterhours';modified.mixer.crossfader=.25;modified.decks.B.mix[0].volume=.15;modified.ui.midiTarget='B';
 const imported=await request('/api/setups/import','POST',modified);assert.equal(imported.status,201);assert.notEqual(imported.body.id,saved.body.id);
 assert.equal((await request('/api/setups')).body.length,2);assert.equal((await request('/api/setups/'+imported.body.id)).body.decks.B.mix[0].volume,.15);
 const host=await connect(undefined,'?scope=session');host.send({type:'claim'});const lease=await host.wait('sync');const players=[];
 for(const id of ['A','B']){const p=await connect(undefined,'?deck='+id);p.send({type:'claim',ownerId:lease.ownerId});await p.wait('sync');players.push(p);}
 const restore=await request('/api/setups/'+imported.body.id+'/load','POST',{});assert.equal(restore.status,202);await host.wait('restoreSetup');
 assert.equal((await request('/api/session/state')).body.setup.name,'Sunday in Berlin');assert.equal((await request('/api/decks/A/transport','POST',{action:'play'})).status,409);
 host.send({type:'result',jobId:restore.body.id,ok:false,error:'Bad score'});
 const settle=async id=>{for(let i=0;i<100;i++){if((await request('/api/jobs/'+id)).body.status!=='pending')return;await new Promise(r=>setTimeout(r,5));}throw new Error('Job timeout');};await settle(restore.body.id);
 assert.equal((await request('/api/session/state')).body.setup.name,'Sunday in Berlin');
 const retry=await request('/api/setups/'+imported.body.id+'/load','POST',{});await host.wait('restoreSetup');host.send({type:'result',jobId:retry.body.id,ok:true,bpms:{A:134,B:134}});await settle(retry.body.id);
 const state=(await request('/api/session/state')).body;assert.equal(state.setup.name,'Afterhours');assert.equal(state.mixer.crossfader,.25);assert.equal(state.decks.B.mixerValues[0].volume,.15);assert.equal(state.ui.midiTarget,'B');assert.equal(state.decks.A.playback,false);
 const sync=await request('/api/decks/B/sync','POST',{});assert.equal(sync.status,202);const command=await players[1].wait('apply');assert.equal(command.operation.type,'beatSync');assert.equal(command.operation.source,'A');assert.equal(command.song.bpm,134);players[1].send({type:'result',jobId:sync.body.id,ok:true,bpm:134,playing:false});await settle(sync.body.id);
 modified.decks.A.mix[0].volume=9;assert.equal((await request('/api/setups/import','POST',modified)).status,400);
});
