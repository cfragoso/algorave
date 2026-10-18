import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { patchTrack, validateSong } from './model.js';
import {withSource, replaceSource, setSongTempo} from './public/source.js';
import {validRanges} from './public/activity.js';
import {normalizeTelemetry} from './public/monitor.js';
import {defaultMaster, patchMaster} from './public/master-model.js';
import {createLightsGateway} from './lights-gateway.js';
import {createSetupStore,validateSetup,validateUi,validateStrips,defaultUi,defaultStrip} from './setup-store.js';

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

export async function createControlServer({token = '', timeoutMs = 10000, initialSong, initialRevision = 0, initialSession, setupDir = process.env.ALGORAVE_DATA_DIR || path.join(appDir,'data','setups')} = {}) {
  const songs = new Map();
  const refreshSongs = async () => {
    const updated=new Map();
  for (const name of await readdir(path.join(root, 'songs'))) {
    try {
      const song = validateSong(JSON.parse(await readFile(path.join(root, 'songs', name, 'session.json'), 'utf8')));
      updated.set(song.id, withSource(song));
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
    songs.clear();for(const [id,song] of updated)songs.set(id,song);
  };
  await refreshSongs();
  const decks = Object.fromEntries(['A','B'].map(id => [id, {
    song: id === 'A' && initialSong ? withSource(validateSong(initialSong)) : structuredClone(songs.get('live-set')),
    revision: id === 'A' ? initialRevision : 0, player: null, pending: null, playback: false, telemetry: null, telemetryAt: 0, stripValues:defaultStrip(),
  }]));
  const setups=createSetupStore(setupDir);let currentSetup={id:null,name:'Untitled set'},ui=defaultUi();
  const snapshot=name=>validateSetup({schema:'algorave-setup',version:1,name,decks:Object.fromEntries(['A','B'].map(id=>[id,{song:decks[id].song,mix:decks[id].stripValues}])),mixer:master,ui});
  const setupBusy=()=>masterPending?.setup || Object.values(decks).some(d=>d.pending);
  let masterFrame=null, masterFrameAt=0;
  let master = defaultMaster(), masterPlayer = null, ownerId = null, masterPending = null;
  const jobs = new Map(), lights = createLightsGateway();
  if(initialSession){
    for(const id of ['A','B']){const saved=initialSession.decks?.[id];if(saved?.song){decks[id].song=withSource(validateSong(saved.song));decks[id].revision=saved.revision||0;decks[id].stripValues=validateStrips(saved.mixerValues||saved.telemetry?.mixer?.values||defaultStrip());}}
    if(initialSession.mixer)master=patchMaster(defaultMaster(),initialSession.mixer);
    if(initialSession.ui)ui=validateUi(initialSession.ui);
    if(initialSession.setup)currentSetup=initialSession.setup;
  }
  const cookie = randomBytes(32).toString('hex');
  const ws = new WebSocketServer({noServer: true, maxPayload: 600000});
  const authenticated = req => !token || equal(req.headers.authorization, 'Bearer ' + token) ||
    equal((req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('algorave='))?.slice(9), cookie);
  const sameOrigin = req => !req.headers.origin || req.headers.origin === 'http://' + req.headers.host ||
    req.headers.origin === 'https://' + req.headers.host;
  const state = id => {const d=decks[id]; return {deck:id,song:d.song,revision:d.revision,playerConnected:!!d.player,
    mixerValues:d.stripValues,syncAvailable:!!masterPlayer && !!decks[id==='A'?'B':'A'].player,playback:d.playback,pendingJob:d.pending?.id ?? null,telemetry:Date.now()-d.telemetryAt<2000?d.telemetry:null};};
  const session = () => ({setup:currentSetup,ui,decks:{A:state('A'),B:state('B')},mixer:master,
    telemetry:Date.now()-masterFrameAt<2000?masterFrame:null,restoring:!!masterPending?.setup,playerConnected:!!masterPlayer,pendingJob:masterPending?.id ?? null,lights:lights.state()});
  const send = (client, value) => client?.readyState === WebSocket.OPEN && client.send(JSON.stringify(value));
  const broadcast = () => ws.clients.forEach(client => send(client,{type:'state',...(client.scope==='session'?session():state(client.deck))}));
  const finish = (d,status,error) => {
    if(!d.pending)return;
    clearTimeout(d.pending.timer);Object.assign(jobs.get(d.pending.id),{status,...(error?{error}:{})});d.pending=null;broadcast();
  };
  const failDeck = (id,reason) => {const d=decks[id]; d.player?.terminate();d.player=null;d.playback=false;d.telemetry=null;finish(d,'failed',reason);};
  const enqueue = (id,candidate,operation=null) => {
    const d=decks[id];
    if(masterPending?.setup || Object.values(decks).some(x=>x.pending?.operation?.type==='beatSync'))return {status:409,body:{error:'Session restore or beat sync is pending'}};
    if(!d.player)return {status:409,body:{error:'Open the app and click Enable audio device first'}};
    if(d.pending)return {status:409,body:{error:'An update is pending',jobId:d.pending.id}};
    const jobId=randomUUID(); jobs.set(jobId,{id:jobId,deck:id,status:'pending',revision:d.revision+(candidate?1:0)});
    if(jobs.size>100)jobs.delete(jobs.keys().next().value);
    d.pending={id:jobId,candidate,operation,timer:setTimeout(()=>{
      failDeck(id,'Audio device did not acknowledge the update; re-enable it');broadcast();
    },timeoutMs)};
    send(d.player,{type:candidate?'apply':'command',jobId,revision:d.revision+(candidate?1:0),...(candidate?{song:candidate}:{}),...(operation?{operation}:{})});
    broadcast();return {status:202,body:jobs.get(jobId)};
  };
  const enqueueMaster = candidate => {
    if(!masterPlayer)return {status:409,body:{error:'Enable the main audio device first'}};
    if(masterPending || Object.values(decks).some(d=>d.pending?.operation?.type==='beatSync'))return {status:409,body:{error:'A mixer update is pending'}};
    const id=randomUUID();jobs.set(id,{id,status:'pending'});if(jobs.size>100)jobs.delete(jobs.keys().next().value);
    masterPending={id,candidate,timer:setTimeout(()=>{masterPlayer?.terminate();masterPlayer=null;ownerId=null;
      Object.assign(jobs.get(id),{status:'failed',error:'Mixer acknowledgement timed out'});masterPending=null;
      for(const id of ['A','B'])failDeck(id,'Main audio device disconnected');broadcast();},timeoutMs)};
    send(masterPlayer,{type:'mixer',jobId:id,mixer:candidate});broadcast();return {status:202,body:jobs.get(id)};
  };
  const commitSetup = setup => {
    for(const id of ['A','B']){const d=decks[id];d.song=structuredClone(setup.decks[id].song);d.stripValues=structuredClone(setup.decks[id].mix);d.revision++;d.playback=false;d.telemetry=null;}
    master=structuredClone(setup.mixer);ui=structuredClone(setup.ui);currentSetup={id:setup.id,name:setup.name};masterFrame=null;
  };
  const loadSetup = setup => {
    setup=structuredClone(setup);setup.mixer.sinkId=master.sinkId;
    if(setupBusy() || masterPending) return {status:409,body:{error:'Wait for pending updates before loading a setup'}};
    if(!masterPlayer){if(Object.values(decks).some(d=>d.player))return {status:409,body:{error:'Use the main studio to restore both decks'}};commitSetup(setup);broadcast();return {status:200,body:{status:'applied',name:setup.name}};}
    if(Object.values(decks).some(d=>!d.player))return {status:409,body:{error:'Both decks must be enabled before restoring a setup'}};
    const id=randomUUID();jobs.set(id,{id,status:'pending'});if(jobs.size>100)jobs.delete(jobs.keys().next().value);
    masterPending={id,setup,timer:setTimeout(()=>{releaseMaster('Setup restore timed out');},timeoutMs)};
    send(masterPlayer,{type:'restoreSetup',jobId:id,setup});broadcast();return {status:202,body:jobs.get(id)};
  };
  const body = async req => {
    let data = '';
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 600000) throw new Error('Request too large');
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
        if(url.pathname==='/api/session/ui' && req.method==='PATCH'){ui=validateUi(await body(req));broadcast();return json(res,200,ui);}
        if(url.pathname==='/api/setups' && req.method==='GET')return json(res,200,await setups.list());
        if(url.pathname==='/api/setups' && req.method==='POST'){
          if(setupBusy()||masterPending)return json(res,409,{error:'Wait for pending updates before saving'});
          const input=await body(req),saved=await setups.save(snapshot(input.name),input.id);
          currentSetup={id:saved.id,name:saved.name};broadcast();return json(res,201,saved);
        }
        if(url.pathname==='/api/setups/import' && req.method==='POST')return json(res,201,await setups.save(await body(req)));
        const setupMatch=url.pathname.match(/^\/api\/setups\/([0-9a-f-]{36})(\/load)?$/);
        if(setupMatch){const setup=await setups.get(setupMatch[1]);if(req.method==='GET'&&!setupMatch[2])return json(res,200,setup);if(req.method==='POST'&&setupMatch[2]){const result=loadSetup(setup);return json(res,result.status,result.body);}}
        if(req.method==='GET' && url.pathname==='/api/session/state')return json(res,200,session());
        if(req.method==='GET' && url.pathname==='/api/songs'){await refreshSongs();return json(res,200,[...songs.values()]);}
        if(req.method==='GET' && url.pathname.startsWith('/api/jobs/')){
          const job=jobs.get(url.pathname.slice(10));return json(res,job?200:404,job||{error:'Unknown job'});
        }
        if(url.pathname==='/api/mixer'){
          if(req.method==='GET')return json(res,200,master);
          if(req.method==='PATCH'){const result=enqueueMaster(patchMaster(master,await body(req)));return json(res,result.status,result.body);}
        }
        if(url.pathname.startsWith('/api/lights/')){
          const action=url.pathname.slice(12);
          if(action==='state' && req.method==='GET')return json(res,200,lights.state());
          if(req.method==='POST' && ['connect','disconnect','bar','blackout'].includes(action)){
            const input=await body(req);const result=await lights.command(action,input);return json(res,200,result);
          }
        }
        const match=url.pathname.match(/^\/api\/decks\/([AB])(?:\/(.*))?$/);
        if(url.pathname.startsWith('/api/decks/') && !match)return json(res,404,{error:'Unknown deck'});
        const id=match?.[1] || 'A', d=decks[id], route=match?'/api/'+(match[2] || 'state'):url.pathname;
        if(req.method==='GET' && route==='/api/state')return json(res,200,state(id));
        let candidate, operation;
        if(req.method==='POST' && route==='/api/sync'){
          const source=id==='A'?'B':'A';
          if(!masterPlayer || !decks[source].player || decks[source].pending || masterPending)return json(res,409,{error:'Enable both decks and wait for pending updates before syncing'});
          candidate=validateSong(setSongTempo(d.song,decks[source].song.bpm));operation={type:'beatSync',source};
        } else if(req.method==='PATCH' && route==='/api/tempo')candidate=validateSong(setSongTempo(d.song,(await body(req)).bpm));
        else if(req.method==='POST' && route==='/api/code'){
          const input=await body(req);
          if(input.revision!==d.revision)return json(res,409,{error:'Song changed since this draft started. Download your draft, then use current song before applying again.'});
          candidate=validateSong(replaceSource(d.song,input.code));
        } else if(req.method==='POST' && route==='/api/songs/load'){
          const input=await body(req);await refreshSongs();if(!songs.has(input.id))return json(res,404,{error:'Unknown song'});
          candidate=structuredClone(songs.get(input.id));
        } else if(req.method==='PATCH' && route.startsWith('/api/tracks/'))candidate=patchTrack(d.song,decodeURIComponent(route.slice(12)),await body(req));
        else if(req.method==='POST' && route==='/api/transport'){
          const input=await body(req);if(!['play','pause','stop','cue'].includes(input.action))throw new Error('Use play, pause, stop or cue');
          operation={type:'transport',action:input.action};
        } else if(req.method==='PATCH' && route==='/api/mixer'){
          const input=await body(req);
          if(input.reset===true)operation={type:'stripReset'};
          else {
            if(!Number.isInteger(input.column)||input.column<1||input.column>8||!['volume','cutoff','resonance','reverb','mute','solo'].includes(input.parameter)||!Number.isFinite(input.value)||input.value<0||input.value>1)throw new Error('Invalid instrument mixer control');
            operation={type:'strip',column:input.column,parameter:input.parameter,value:input.value};
          }
        }
        if(candidate || operation){const result=enqueue(id,candidate,operation);return json(res,result.status,result.body);}
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
  server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!=='/ws'||!authenticated(req)||!sameOrigin(req)|| (url.searchParams.has('deck')&&!['A','B'].includes(url.searchParams.get('deck')))){
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;
    }
    ws.handleUpgrade(req,socket,head,client=>{client.scope=url.searchParams.get('scope');client.deck=url.searchParams.get('deck')||'A';ws.emit('connection',client);});
  });
  ws.on('connection',client=>{
    client.alive=true;client.on('pong',()=>{client.alive=true;});
    send(client,{type:'state',...(client.scope==='session'?session():state(client.deck))});
    client.on('message',raw=>{
      try{
        const message=JSON.parse(raw), id=client.deck, d=decks[id];
        if(client.scope==='session'){
          if(message.type==='claim'){
            if((masterPlayer && masterPlayer!==client)||Object.values(decks).some(d=>d.player))return send(client,{type:'error',error:'Another audio device is active'});
            masterPlayer=client;ownerId=randomUUID();send(client,{type:'sync',mixer:master,ownerId});broadcast();
          } else if(message.type==='masterTelemetry' && client===masterPlayer){
            const normalized=normalizeTelemetry({cycle:0,elapsed:0,playing:true,audio:message.frame?.audio});
            const levels=message.frame?.levels;
            if(normalized?.audio && levels && ['A','B'].every(id=>Number.isFinite(levels[id])&&levels[id]>=0&&levels[id]<=8)){
              masterFrame={audio:normalized.audio,levels:{A:levels.A,B:levels.B}};masterFrameAt=Date.now();
              ws.clients.forEach(observer=>{if(observer!==client&&observer.scope==='session')send(observer,{type:'masterTelemetry',frame:masterFrame});});
            }
          } else if(message.type==='result' && client===masterPlayer && masterPending?.id===message.jobId){
            clearTimeout(masterPending.timer);
            if(message.ok===true){if(masterPending.setup){const restored=structuredClone(masterPending.setup);for(const id of ['A','B']){const bpm=message.bpms?.[id];if(Number.isFinite(bpm)&&bpm>=40&&bpm<=250)restored.decks[id].song.bpm=bpm;}commitSetup(restored);}else master=masterPending.candidate;}
            Object.assign(jobs.get(masterPending.id),{status:message.ok===true?'applied':'failed',...(message.ok===true?{}:{error:message.error||'Mixer rejected update'})});masterPending=null;broadcast();
          } else if(message.type==='release' && client===masterPlayer){
            releaseMaster('Main audio device released');
          }
          return;
        }
        if(message.type==='ready' && client===d.player){if(Number.isFinite(message.bpm)&&message.bpm>=40&&message.bpm<=250){d.song.bpm=message.bpm;broadcast();}}else if(message.type==='claim'){
          if((d.player && d.player!==client)||(masterPlayer && message.ownerId!==ownerId))return send(client,{type:'error',error:'Another audio device is active'});
          d.player=client;send(client,{type:'sync',song:d.song,revision:d.revision,mixerValues:d.stripValues});broadcast();
        } else if(message.type==='release' && client===d.player){d.player=null;d.playback=false;d.telemetry=null;finish(d,'failed','Audio device released');broadcast();}
        else if(message.type==='result' && client===d.player && d.pending && message.jobId===d.pending.id){
          if(message.ok===true){
            if(typeof message.playing==='boolean')d.playback=message.playing;
            if(d.pending.candidate){d.song=d.pending.candidate;if(Number.isFinite(message.bpm)&&message.bpm>=40&&message.bpm<=250)d.song.bpm=message.bpm;d.revision++;d.telemetry=null;}
            if(typeof message.playing==='boolean')d.playback=message.playing;
          }
          finish(d,message.ok===true?'applied':'failed',message.ok===true?undefined:message.error||'Player rejected update');
        } else if(message.type==='telemetry' && client===d.player && message.revision===d.revision){
          const frame=normalizeTelemetry(message.frame);if(frame){d.telemetry=frame;d.telemetryAt=Date.now();if(frame.mixer)d.stripValues=frame.mixer.values;ws.clients.forEach(observer=>{
            if(observer!==client && (observer.scope==='session'||observer.deck===id))send(observer,{type:'telemetry',deck:id,revision:d.revision,frame});
          });}
        } else if(message.type==='activity' && client===d.player && d.playback && message.revision===d.revision){
          const frame={type:'activity',deck:id,revision:d.revision,ranges:validRanges(message.ranges,d.song.code.length),labels:validRanges(message.labels,d.song.code.length)};
          ws.clients.forEach(observer=>{if(observer!==client && observer.scope!=='session' && observer.deck===id)send(observer,frame);});
        } else if(message.type==='playback' && client===d.player){d.playback=message.playing===true;broadcast();}
      }catch{send(client,{type:'error',error:'Invalid message'});}
    });
    client.on('error',()=>{});
    client.on('close',()=>{
      if(client===masterPlayer)return releaseMaster('Main audio device disconnected');
      const d=decks[client.deck];if(client!==d.player)return;d.player=null;d.playback=false;d.telemetry=null;finish(d,'failed','Audio device disconnected');broadcast();
    });
  });
  function releaseMaster(reason){
    masterPlayer=null;ownerId=null;masterFrame=null;
    if(masterPending){clearTimeout(masterPending.timer);Object.assign(jobs.get(masterPending.id),{status:'failed',error:reason});masterPending=null;}
    for(const id of ['A','B'])failDeck(id,reason);broadcast();
  }
  const heartbeat = setInterval(() => ws.clients.forEach(client => {
    if (!client.alive) return client.terminate();
    client.alive = false;
    client.ping();
    send(client, {type: 'heartbeat'});
  }), 5000);
  heartbeat.unref();
  server.on('close', () => {clearInterval(heartbeat);for(const d of Object.values(decks))clearTimeout(d.pending?.timer);clearTimeout(masterPending?.timer);lights.disconnect();ws.close();});
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
