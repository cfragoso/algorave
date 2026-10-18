import {initStrudel, getAudioContext} from '@strudel/web/web.mjs';
import {createMixer} from './mixer.js';
import {sessionControls} from './session-ui.js';
import {compileSong} from './compile.js';
import {createSongEditor} from './editor.js';

const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
let socket, engine, mixer, active = false, compiled, state, desiredSong;
let applyQueue = Promise.resolve();
const api = async (url, options = {}) => {
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
const editor = createSongEditor({
  apply: (code, revision) => submit('/api/code', 'POST', {code, revision}),
  report: showError,
});

function renderControls(next) {
  const controls = sessionControls({active, connected: socket?.readyState === WebSocket.OPEN, ...next});
  $('enable').disabled = controls.enableDisabled;
  $('enable').textContent = controls.enableLabel;
  $('enable').title = controls.hint;
  $('play').disabled = $('stop').disabled = $('midi').disabled = $('reset').disabled = controls.localDisabled;
  $('release').hidden = controls.releaseHidden;
  $('load').disabled = controls.loadDisabled;
  $('device-status').textContent = controls.hint;
}

function render(next) {
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
  engine = await initStrudel({
    audioContext: context,
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
}

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
  $('login').style.display = 'none';
  $('songs').replaceChildren(...songs.map(song => new Option(song.name, song.id)));
  socket?.close();
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
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
    if (message.type === 'error') { active = false; if (state) render(state); showError(new Error(message.error)); }
    if (message.type === 'sync' || message.type === 'apply') {
      applyQueue = applyQueue.catch(() => {}).then(async () => {
        try {
          if (!active || socket !== connection) throw new Error('Audio device is not enabled');
          const bpm = await applySong(message.song, connection);
          if (message.type === 'apply') send({type: 'result', jobId: message.jobId, ok: true, bpm});
          else status('Audio device ready · press Play');
        } catch (error) {
          if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          if (message.type === 'apply') send({type: 'result', jobId: message.jobId, ok: false, error: error.message});
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
    state = null; renderControls({playerConnected: false});
    editor.disconnected();
    $('login').style.display = 'flex';
    status('Disconnected; playback stopped. Click Connect, then enable the audio device again.');
  };
}

$('login').onsubmit = event => {
  event.preventDefault();
  api('/api/session', {method: 'POST', headers: {Authorization: 'Bearer ' + $('token').value}})
    .then(() => { $('token').value = ''; return connect(); }).catch(showError);
};
$('enable').onclick = async () => {
  $('enable').disabled = true;
  try { status('Preparing audio and sample maps…'); await initEngine(); active = true; send({type: 'claim'}); }
  catch (error) { active = false; $('enable').disabled = false; showError(error); }
};
$('play').onclick = async () => {
  try {
    await getAudioContext().resume();
    if (!compiled) throw new Error('Wait for audio device setup');
    await engine.setPattern(compiled, true);
    send({type: 'playback', playing: true}); status('Playing · ' + desiredSong.name);
  } catch (error) { showError(error); }
};
$('stop').onclick = () => { engine.stop(); send({type: 'playback', playing: false}); status('Stopped'); };
$('release').onclick = () => {
  engine?.stop();
  mixer?.disconnect();
  active = false;
  send({type: 'release'});
  if (state) renderControls(state);
  status('Audio device released. You can enable it in another browser now.');
};
$('reset').onclick = () => { mixer.reset(); status('Audible mix restored · mute and solo cleared'); };
$('midi').onclick = () => mixer.connect().then(status).catch(showError);
$('load').onclick = () => submit('/api/songs/load', 'POST', {id: $('songs').value}).catch(showError);
connect().catch(error => { $('login').style.display = 'flex'; showError(error); });
