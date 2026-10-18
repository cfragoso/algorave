import {initStrudel, getAudioContext, webaudioOutput, getSuperdoughAudioController, initAudio} from '@strudel/web/web.mjs';
import {createMixer} from './mixer.js';
import {sessionControls} from './session-ui.js';
import {compileSong} from './compile.js';
import {createSongEditor} from './editor.js';
import {createActivityClock} from './activity.js';
import {createAudioMonitor} from './monitor.js';
import {createPerformanceConsole} from './console.js';
import {createLightsMonitor} from './lights-monitor.js';

const deckId = new URLSearchParams(location.search).get('deck') === 'B' ? 'B' : 'A';
const embedded = window.parent !== window;
if(embedded){document.body.classList.add('embedded');document.querySelector('.panel-heading h1').innerHTML='DECK <span>'+deckId+'</span>';document.title='Deck '+deckId+' · Strudel';}
const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
let socket, engine, mixer, active = false, compiled, state, desiredSong;
let applyQueue = Promise.resolve();
let ready = false;
let audioMonitor, elapsed = 0, beganAt = null, pausedCycle = 0;
const activity = createActivityClock();
const api = async (url, options = {}) => {
  if(url.startsWith('/api/') && !['/api/songs','/api/session'].includes(url) && !url.startsWith('/api/jobs/'))url='/api/decks/'+deckId+url.slice(4);
  const response = await fetch(url, {headers: {'Content-Type': 'application/json', ...options.headers}, ...options});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};
const send = value => {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('Control server is disconnected');
  socket.send(JSON.stringify(value));
};
const showError = error => status(error.message);
const deck = createPerformanceConsole({
  onMix: (column, parameter, value) => {if(active && mixer){mixer.set(column,parameter,value);deck.mixer(mixer.snapshot());}},
  onTempo: bpm => submit('/api/tempo','PATCH',{bpm}),
  report: showError,
});
if(!embedded)createLightsMonitor();
fetch('/mapping.json').then(response=>response.json()).then(mapping=>deck.mixer({connected:false,ledConnected:false,
  values:Array.from({length:8},()=>({...mapping.software_startup_normalized})), received:[]})).catch(showError);
const editor = createSongEditor({
  apply: (code, revision) => submit('/api/code', 'POST', {code, revision}),
  report: showError, storageKey: 'algorave-code-draft-'+deckId,
});
function currentActivityFrame() {
  return engine?.scheduler.started && desiredSong && desiredSong.code === state?.song.code
    ? activity.frame(getAudioContext().currentTime, desiredSong.code) : {ranges: [], labels: []};
}
function animateActivity() {
  if (active) {
    editor.highlight(currentActivityFrame());
  }
  requestAnimationFrame(animateActivity);
}
requestAnimationFrame(animateActivity);
// Remote feedback must not depend on this tab's paint/visibility cycle.
setInterval(() => {
  if (active && socket?.readyState === WebSocket.OPEN && state) {
    const frame = currentActivityFrame();
    send({type: 'activity', revision: state.revision, ...frame});
    const telemetry = {cycle:engine?.scheduler.started ? Math.max(0,engine.scheduler.now()) : pausedCycle,
      elapsed:elapsed+(beganAt===null?0:getAudioContext().currentTime-beganAt), playing:!!engine?.scheduler.started,
      mixer:mixer?.snapshot(), audio:audioMonitor?.capture(), tracks:frame.tracks || []};
    deck.telemetry(telemetry);
    send({type:'telemetry',revision:state.revision,frame:telemetry});
  }
}, 67);

function renderControls(next) {
  const controls = sessionControls({active, connected: socket?.readyState === WebSocket.OPEN, ...next});
  $('enable').disabled = controls.enableDisabled;
  $('enable').textContent = controls.enableLabel;
  $('enable').title = controls.hint;
  $('play').disabled = $('stop').disabled = $('midi').disabled = $('reset').disabled = controls.localDisabled;
  $('release').hidden = controls.releaseHidden;
  $('load').disabled = controls.loadDisabled;
  deck.state(next,active);
  $('play').disabled=$('stop').disabled=$('cue').disabled=!next.playerConnected || !!next.pendingJob;
  $('device-status').textContent = controls.hint;
}

function render(next) {
  if (!state) $('songs').value = next.song.id;
  const changed = !state || state.revision !== next.revision;
  state = next;
  renderControls(next);
  editor.sync(next);
  if (!changed) return;
  $('tracks').replaceChildren();
  for (const track of next.song.tracks) {
    const article = document.createElement('article');
    const heading = document.createElement('h2');
    const column = document.createElement('span');
    column.className = 'column'; column.textContent = String(track.column).padStart(2, '0');
    heading.append(column, track.id.replaceAll('_', ' '));
    const code = document.createElement('textarea');
    code.value = track.code; code.spellcheck = false; code.setAttribute('aria-label', track.id + ' pattern');
    const controls = document.createElement('div'); controls.className = 'track-controls';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = track.enabled;
    const label = document.createElement('label'); label.append(enabled, ' In the set');
    const sound = document.createElement('input'); sound.type = 'text'; sound.value = track.sound ?? '';
    sound.placeholder = 'Sound override'; sound.setAttribute('aria-label', track.id + ' sound override');
    const apply = document.createElement('button'); apply.textContent = 'Apply track'; apply.className = 'apply';
    apply.onclick = () => submit('/api/tracks/' + track.id, 'PATCH', {code: code.value, enabled: enabled.checked, sound: sound.value.trim() || null}).catch(showError);
    controls.append(label, sound, apply); article.append(heading, code, controls); $('tracks').append(article);
  }
  status(`${next.song.name} · ${next.song.bpm} BPM · revision ${next.revision}`);
}

async function applySong(song, connection) {
  const {pattern: candidate, bpm} = await compileSong(song, mixer);
  if (!active || socket !== connection || connection.readyState !== WebSocket.OPEN) throw new Error('Audio device was released or disconnected');
  const wasPlaying = engine.scheduler.started;
  activity.clear();
  engine.setCps(bpm / 240);
  await engine.setPattern(candidate, wasPlaying);
  compiled = candidate;
  desiredSong = song;
  return bpm;
}

async function initEngine() {
  // Resume immediately inside the user's click, before fetching sample manifests.
  const context = getAudioContext();
  await context.resume();
  if (engine) return;
  await initAudio();
  engine = await initStrudel({
    audioContext: context,
    // The transpiler supplies positions for double-quoted mini notation.
    // Parsing literal single-quoted sound/bank names again creates offset-0
    // locations and would incorrectly highlight the beginning of the score.
    miniAllStrings: false,
    defaultOutput: (hap, deadline, duration, cps, time) => {
      routeOutput();
      activity.schedule(hap, time, duration);
      return webaudioOutput(hap, deadline, duration, cps, time);
    },
    onToggle: playing => { if (!playing) { activity.clear(); editor.highlight(); } },
    onError: error => status('Audio scheduler: ' + error.message),
    prebake: async () => {
      const base = 'https://raw.githubusercontent.com/geikha/tidal-drum-machines/main/';
      await globalThis.samples({
        tr909_bd: 'machines/RolandTR909/rolandtr909-bd/Bassdrum-01.wav',
        tr909_cp: 'machines/RolandTR909/rolandtr909-cp/Clap.wav',
        tr909_sd: 'machines/RolandTR909/rolandtr909-sd/naredrum.wav',
        tr909_hh: 'machines/RolandTR909/rolandtr909-hh/hh01.wav',
        tr909_oh: 'machines/RolandTR909/rolandtr909-oh/Hat Open.wav',
        tr909_rim: 'machines/RolandTR909/rolandtr909-rim/Rimhot.wav',
      }, base);
      const vocals = await (await fetch('/vocals.json')).json();
      const {_base, ...samples} = vocals;
      await globalThis.samples(samples, _base);
    },
  });
  const mapping = await (await fetch('/mapping.json')).json();
  mixer = createMixer(mapping, globalThis.ref);
  audioMonitor = createAudioMonitor(context,()=>{routeOutput();return getSuperdoughAudioController().output.destinationGain;});
  routeOutput();
  deck.mixer(mixer.snapshot());
}

function routeOutput(){if(embedded && parent.algoraveSession?.audio)parent.algoraveSession.audio.attach(deckId,getSuperdoughAudioController().output.destinationGain);}

async function submit(url, method, payload) {
  const job = await api(url, {method, body: JSON.stringify(payload)});
  status('Sending update to audio device…');
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const result = await api('/api/jobs/' + job.id);
    if (result.status === 'applied') return status('Applied · revision ' + result.revision);
    if (result.status === 'failed') throw new Error(result.error || 'Player rejected the update');
  }
  throw new Error('Update timed out; inspect /api/state');
}

async function connect() {
  const songs = await api('/api/songs');
  deck.catalog(songs);
  $('login').style.display = 'none';
  $('songs').replaceChildren(...songs.map(song => new Option(song.name, song.id)));
  socket?.close();
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?deck=${deckId}`);
  const connection = socket;
  let lastMessage = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastMessage < 15000) return;
    engine?.stop(); mixer?.disconnect(); active = false;
    socket.close();
  }, 2000);
  socket.onmessage = async ({data}) => {
    lastMessage = Date.now();
    const message = JSON.parse(data);
    if (message.type === 'state') render(message);
    if (message.type === 'state' && !active && message.telemetry) deck.telemetry(message.telemetry);
    if (message.type === 'telemetry' && !active && message.revision === state?.revision) deck.telemetry(message.frame);
    if (message.type === 'activity' && !active && message.revision === state?.revision) editor.highlight(message);
    if (message.type === 'error') { active = false; if (state) render(state); showError(new Error(message.error)); }
    if (message.type === 'sync' || message.type === 'apply' || message.type === 'command') {
      applyQueue = applyQueue.catch(() => {}).then(async () => {
        try {
          if (!active || socket !== connection) throw new Error('Audio device is not enabled');
          if(message.type==='command'){
            const op=message.operation;
            if(op.type==='transport')await transport(op.action);
            else if(op.type==='strip')mixer.set(op.column,op.parameter,op.value);
            else if(op.type==='stripReset')mixer.reset();
            send({type:'result',jobId:message.jobId,ok:true,playing:!!engine.scheduler.started});return;
          }
          const bpm = await applySong(message.song, connection);
          if (message.type === 'apply') send({type: 'result', jobId: message.jobId, ok: true, bpm});
          else {ready=true;status('Audio device ready · press Play');}
        } catch (error) {
          if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          if (message.type !== 'sync') send({type: 'result', jobId: message.jobId, ok: false, error: error.message});
          else { send({type: 'release'}); active = false; if (state) render(state); }
          showError(error);
        }
      });
    }
  };
  socket.onclose = () => {
    clearInterval(watchdog);
    // Fail closed: avoid an uncommandable player continuing after a network split.
    engine?.stop(); mixer?.disconnect(); active = false;
    deck.clear();
    elapsed=0;beganAt=null;pausedCycle=0;
    ready=false;state = null; renderControls({playerConnected: false});
    editor.disconnected();
    $('login').style.display = 'flex';
    status('Disconnected; playback stopped. Click Connect, then enable the audio device again.');
  };
  await new Promise((resolve,reject)=>{connection.addEventListener('open',resolve,{once:true});connection.addEventListener('error',()=>reject(new Error('Cannot connect to deck '+deckId)),{once:true});});
}

$('login').onsubmit = event => {
  event.preventDefault();
  api('/api/session', {method: 'POST', headers: {Authorization: 'Bearer ' + $('token').value}})
    .then(() => { $('token').value = ''; return connect(); }).catch(showError);
};
$('enable').onclick = async () => {
  $('enable').disabled = true;
  try { ready=false;status('Preparing audio and sample maps…'); if(socket?.readyState!==WebSocket.OPEN)await connect();await initEngine(); active = true; send({type: 'claim',ownerId:embedded?parent.algoraveSession?.ownerId:undefined}); }
  catch (error) { active = false; $('enable').disabled = false; showError(error); }
};
async function transport(action){
  if(action==='stop'||action==='cue'){
    engine.stop();routeOutput();elapsed=0;beganAt=null;pausedCycle=0;send({type:'playback',playing:false});status('Cued · bar 1');return;
  }
  if(action==='pause'){
    if(engine.scheduler.started){pausedCycle=Math.max(0,engine.scheduler.now());if(beganAt!==null)elapsed+=getAudioContext().currentTime-beganAt;beganAt=null;engine.pause();routeOutput();}
    send({type:'playback',playing:false});status('Paused');return;
  }
  if(!engine.scheduler.started){await getAudioContext().resume();if(!compiled)throw new Error('Wait for audio setup');await engine.setPattern(compiled,true);routeOutput();beganAt=getAudioContext().currentTime;}
  send({type:'playback',playing:true});status('Playing · '+desiredSong.name);
}
$('play').onclick=()=>submit('/api/transport','POST',{action:state.playback?'pause':'play'}).catch(showError);
$('stop').onclick=$('cue').onclick=()=>submit('/api/transport','POST',{action:'cue'}).catch(showError);
$('release').onclick = () => {
  engine?.stop();
  elapsed=0;beganAt=null;pausedCycle=0;
  mixer?.disconnect();
  if(mixer)deck.mixer(mixer.snapshot());
  active = false;ready=false;
  if(socket?.readyState===WebSocket.OPEN)send({type: 'release'});
  if (state) renderControls(state);
  status('Audio device released. You can enable it in another browser now.');
};
$('reset').onclick = () => submit('/api/mixer','PATCH',{reset:true}).catch(showError);
$('midi').onclick = () => (embedded?parent.algoraveSession.connectMidi(deckId):mixer.connect()).then(status).catch(showError);
$('load').onclick = () => submit('/api/songs/load', 'POST', {id: $('songs').value}).catch(showError);
connect().catch(error => { $('login').style.display = 'flex'; showError(error); });

window.algoraveDeck={
  async enable(){await $('enable').onclick();for(let i=0;i<150;i++){if(ready)return;if(!active)throw new Error($('status').textContent);await new Promise(r=>setTimeout(r,100));}throw new Error('Deck '+deckId+' setup timed out');},
  release(){if(active)$('release').onclick();},
  connectMidi(access){if(!active)throw new Error('Enable audio first');return mixer.connect(access);},
  disconnectMidi(){mixer?.disconnect();},
};
if(embedded){new ResizeObserver(()=>parent.postMessage({type:'deck-height',deck:deckId,height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin)).observe(document.body);}
