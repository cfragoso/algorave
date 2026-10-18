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
  const connect = async headers => {
    const client = new WebSocket(base.replace('http:', 'ws:') + '/ws', {headers});
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
