import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { patchTrack, validateSong } from './model.js';
import {withSource, replaceSource} from './public/source.js';
import {validRanges} from './public/activity.js';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(appDir);
const json = (res, status, value) => {
  res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(value));
};
const equal = (a, b) => {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function createControlServer({token = '', timeoutMs = 10000, initialSong, initialRevision = 0} = {}) {
  const songs = new Map();
  for (const name of await readdir(path.join(root, 'songs'))) {
    try {
      const song = validateSong(JSON.parse(await readFile(path.join(root, 'songs', name, 'session.json'), 'utf8')));
      songs.set(song.id, withSource(song));
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  let song = initialSong ? withSource(validateSong(initialSong)) : structuredClone(songs.get('live-set'));
  let revision = initialRevision, player = null, pending = null, playback = false;
  const jobs = new Map();
  const cookie = randomBytes(32).toString('hex');
  const ws = new WebSocketServer({noServer: true, maxPayload: 256000});
  const authenticated = req => !token || equal(req.headers.authorization, 'Bearer ' + token) ||
    equal((req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('algorave='))?.slice(9), cookie);
  const sameOrigin = req => !req.headers.origin || req.headers.origin === 'http://' + req.headers.host ||
    req.headers.origin === 'https://' + req.headers.host;
  const state = () => ({song, revision, playerConnected: !!player, playback, pendingJob: pending?.id ?? null});
  const send = (client, value) => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(value));
  const broadcast = () => ws.clients.forEach(client => send(client, {type: 'state', ...state()}));
  const finish = (status, error) => {
    if (!pending) return;
    clearTimeout(pending.timer);
    const job = jobs.get(pending.id);
    Object.assign(job, {status, ...(error ? {error} : {})});
    pending = null;
    broadcast();
  };
  const enqueue = candidate => {
    if (!player) return {status: 409, body: {error: 'Open the app and click Enable audio device first'}};
    if (pending) return {status: 409, body: {error: 'An update is pending', jobId: pending.id}};
    const id = randomUUID();
    jobs.set(id, {id, status: 'pending', revision: revision + 1});
    if (jobs.size > 100) jobs.delete(jobs.keys().next().value);
    pending = {id, candidate, timer: setTimeout(() => {
      // A delayed player must not later apply an update the server has abandoned.
      player?.terminate();
      player = null;
      playback = false;
      finish('failed', 'Audio device did not acknowledge the update; re-enable it');
    }, timeoutMs)};
    send(player, {type: 'apply', jobId: id, revision: revision + 1, song: candidate});
    broadcast();
    return {status: 202, body: jobs.get(id)};
  };
  const body = async req => {
    let data = '';
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 200000) throw new Error('Request too large');
    }
    return JSON.parse(data || '{}');
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!sameOrigin(req)) return json(res, 403, {error: 'Origin rejected'});
      if (url.pathname === '/api/session' && req.method === 'POST') {
        if (token && !equal(req.headers.authorization, 'Bearer ' + token)) return json(res, 401, {error: 'Invalid API token'});
        res.setHeader('Set-Cookie', `algorave=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
        return json(res, 200, {ok: true});
      }
      if (url.pathname.startsWith('/api/')) {
        if (!authenticated(req)) return json(res, 401, {error: 'API token required'});
        if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state());
        if (req.method === 'GET' && url.pathname === '/api/songs') return json(res, 200, [...songs.values()]);
        if (req.method === 'POST' && url.pathname === '/api/code') {
          const input = await body(req);
          if (input.revision !== revision) return json(res, 409, {error: 'Song changed since this draft started. Download your draft, then use current song before applying again.'});
          const result = enqueue(validateSong(replaceSource(song, input.code)));
          return json(res, result.status, result.body);
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
          const job = jobs.get(url.pathname.slice(10));
          return json(res, job ? 200 : 404, job || {error: 'Unknown job'});
        }
        if (req.method === 'POST' && url.pathname === '/api/songs/load') {
          const input = await body(req);
          if (!songs.has(input.id)) return json(res, 404, {error: 'Unknown song'});
          const result = enqueue(structuredClone(songs.get(input.id)));
          return json(res, result.status, result.body);
        }
        if (req.method === 'PATCH' && url.pathname.startsWith('/api/tracks/')) {
          const result = enqueue(patchTrack(song, decodeURIComponent(url.pathname.slice(12)), await body(req)));
          return json(res, result.status, result.body);
        }
        return json(res, 404, {error: 'Unknown endpoint'});
      }
      if (req.method !== 'GET') return json(res, 405, {error: 'Method not allowed'});
      // Explicit static roots; never serve credentials or arbitrary repository files.
      const assets = {
        '/mapping.json': path.join(root, 'controllers/launch-control-xl/mapping.json'),
        '/vocals.json': path.join(root, 'vocals/strudel.json'),
      };
      let file = assets[url.pathname];
      if (!file) {
        const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
        file = path.resolve(appDir, 'dist', relative);
        if (!file.startsWith(path.join(appDir, 'dist') + path.sep)) return json(res, 404, {error: 'Not found'});
      }
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm'};
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
      res.end(data);
    } catch (error) {
      if (res.headersSent) return res.end();
      json(res, error.code === 'ENOENT' ? 404 : 400, {error: error.message});
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !authenticated(req) || !sameOrigin(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    ws.handleUpgrade(req, socket, head, client => ws.emit('connection', client));
  });
  ws.on('connection', client => {
    client.alive = true;
    client.on('pong', () => { client.alive = true; });
    send(client, {type: 'state', ...state()});
    client.on('message', raw => {
      try {
        const message = JSON.parse(raw);
        if (message.type === 'claim') {
          if (player && player !== client) return send(client, {type: 'error', error: 'Another audio device is active'});
          player = client;
          send(client, {type: 'sync', song, revision});
          broadcast();
        } else if (message.type === 'release' && client === player) {
          player = null; playback = false;
          finish('failed', 'Audio device released');
          broadcast();
        } else if (message.type === 'result' && client === player && pending && message.jobId === pending.id) {
          if (message.ok === true) {
            song = pending.candidate;
            if (Number.isFinite(message.bpm) && message.bpm >= 40 && message.bpm <= 250) song.bpm = message.bpm;
            revision++;
          }
          finish(message.ok === true ? 'applied' : 'failed', message.error || (message.ok === true ? undefined : 'Player rejected update'));
        } else if (message.type === 'activity' && client === player && playback && message.revision === revision) {
          const frame = {type: 'activity', revision,
            ranges: validRanges(message.ranges, song.code.length), labels: validRanges(message.labels, song.code.length)};
          ws.clients.forEach(observer => { if (observer !== player) send(observer, frame); });
        } else if (message.type === 'playback' && client === player) {
          playback = message.playing === true;
          broadcast();
        }
      } catch { send(client, {type: 'error', error: 'Invalid message'}); }
    });
    client.on('error', () => {});
    client.on('close', () => {
      if (client !== player) return;
      player = null; playback = false;
      finish('failed', 'Audio device disconnected');
      broadcast();
    });
  });
  const heartbeat = setInterval(() => ws.clients.forEach(client => {
    if (!client.alive) return client.terminate();
    client.alive = false;
    client.ping();
    send(client, {type: 'heartbeat'});
  }), 5000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(heartbeat); clearTimeout(pending?.timer); ws.close(); });
  return {server, ws};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const token = process.env.ALGORAVE_TOKEN || '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && token.length < 24) {
    throw new Error('Set ALGORAVE_TOKEN (24+ characters) before binding to a network interface');
  }
  const {server} = await createControlServer({token});
  server.listen(Number(process.env.PORT || 3000), host, () => console.log(`Algorave: http://${host}:${server.address().port}`));
}
