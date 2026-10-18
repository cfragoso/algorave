const roles = ['kick','clap','closed_hats','percussion','bass','lead','chords','vocals'];
const names = ['Kick','Clap','Hats','Perc','Bass','Lead','Chord','Vox'];
const params = ['cutoff','resonance','reverb','volume','mute','solo'];
const $ = id => document.getElementById(id);
const timeText = seconds => {
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return String(minutes).padStart(2,'0') + ':' + rest.toFixed(1).padStart(4,'0');
};
const parameterText = (p, v) => p === 'cutoff' ? Math.round(100 + v * 11900) + ' Hz'
  : p === 'resonance' ? (0.5 + v * 4.5).toFixed(2) : Math.round(v * 100) + '%';

export function createPerformanceConsole({onMix, onTempo, report}) {
  let current, local = false, last, receivedAt = 0, mode = 'wave', seconds = 16;
  let baseTempos = new Map(), history = [], lastHistory = 0, mixer;
  const controls = [];
  names.forEach((name, i) => {
    const strip = document.createElement('div'); strip.className = 'mixer-strip';
    const heading = document.createElement('div'); heading.className = 'strip-label';
    heading.innerHTML = '<b>' + String(i + 1).padStart(2,'0') + '</b>' + name.toUpperCase();
    strip.append(heading);
    const nodes = {};
    for (const parameter of params) {
      if (['mute','solo'].includes(parameter)) {
        const button = document.createElement('button'); button.className = 'strip-button';
        button.textContent = parameter.toUpperCase(); button.disabled = true;
        button.setAttribute('aria-label', parameter + ' ' + name);
        button.onclick = () => onMix(i+1, parameter, mixer.values[i][parameter] > 0.5 ? 0 : 1);
        nodes[parameter] = button; strip.append(button);
      } else {
        const input = document.createElement('input');
        input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.001; input.value = 0;
        input.disabled = true; input.setAttribute('aria-label', name + ' ' + parameter);
        input.oninput = () => onMix(i+1, parameter, Number(input.value));
        if (parameter === 'volume') { input.className = 'mixer-fader'; strip.append(input); nodes[parameter] = {input}; }
        else {
          const wrap = document.createElement('div'); wrap.className = 'knob-wrap ' + parameter;
          const knob = document.createElement('div'); knob.className = 'knob'; knob.setAttribute('aria-hidden','true');
          input.className = 'knob-input'; wrap.append(knob,input); strip.append(wrap);
          nodes[parameter] = {input,knob,wrap};
        }
      }
    }
    const level = document.createElement('input');
    level.type = 'number'; level.min = 0; level.max = 100; level.step = 1;
    level.className = 'compact-level'; level.disabled = true;
    level.setAttribute('aria-label', name + ' level percent');
    level.onchange = () => {
      if (level.value !== '' && level.checkValidity()) onMix(i + 1, 'volume', Number(level.value) / 100);
      else level.value = Math.round((mixer?.values[i].volume || 0) * 100);
    };
    strip.insertBefore(level, nodes.mute);
    controls.push({nodes,heading,level}); $('controller-strips').append(strip);
  });
  function updateMixer(next) {
    if (!next) return;
    mixer = next;
    const solo = next.values.some(v => v.solo > 0.5);
    next.values.forEach((values,i) => {
      controls[i].level.disabled = !local;
      if (document.activeElement !== controls[i].level) controls[i].level.value = Math.round(values.volume * 100);
      controls[i].level.title = names[i] + ' level: ' + Math.round(values.volume * 100) + '%';
      for (const p of params) {
        const node = controls[i].nodes[p], value = values[p];
        if (['mute','solo'].includes(p)) {
          node.disabled = !local;
          node.setAttribute('aria-pressed',String(value > 0.5));
          if (p === 'mute') {
            node.classList.toggle('enabled', !values.mute && (!solo || values.solo));
            node.textContent = node.closest('.controller').classList.contains('is-minimized') ? 'MUTE' : values.mute ? 'MUTED' : 'ON';
          } else node.classList.toggle('soloed',value > 0.5);
        } else {
          node.input.disabled = !local; node.input.value = value;
          node.input.setAttribute('aria-valuetext',parameterText(p,value));
          node.input.title = names[i] + ' ' + p + ': ' + parameterText(p,value);
          node.knob?.style.setProperty('--angle',(-135 + value*270) + 'deg');
          node.wrap?.classList.toggle('received',next.received?.[i]?.includes(p));
        }
      }
    });
    $('midi-state').textContent = next.connected ? 'MIDI LIVE' + (next.ledConnected ? ' / LED FEEDBACK' : ' / NO LED OUTPUT') : 'SOFTWARE MIX / MIDI NOT CONNECTED';
    $('mixer-note').textContent = local ? 'Knobs and faders mirror MIDI. You can also adjust them here.' : 'Audio-device mix. Physical controls update when moved; defaults are software values.';
  }
  document.querySelector('.controller').addEventListener('panelviewchange', () => { if (mixer) updateMixer(mixer); });
  $('wave-mode').onclick = () => { mode = mode === 'wave' ? 'scope' : 'wave'; $('wave-mode').textContent = mode.toUpperCase(); };
  $('wave-in').onclick = () => { seconds = Math.max(4,seconds/2); };
  $('wave-out').onclick = () => { seconds = Math.min(64,seconds*2); };
  $('tempo').onchange = () => onTempo(Number($('tempo').value)).catch(report);
  $('tempo-reset').onclick = () => onTempo(baseTempos.get(current?.song.id) ?? current.song.bpm).catch(report);

  const canvas = $('waveform'), ctx = canvas.getContext('2d');
  function draw(now) {
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(2,devicePixelRatio || 1);
    if (canvas.width !== Math.round(bounds.width*ratio) || canvas.height !== Math.round(bounds.height*ratio)) {
      canvas.width = Math.max(1,Math.round(bounds.width*ratio)); canvas.height = Math.max(1,Math.round(bounds.height*ratio));
    }
    const w = bounds.width, h = bounds.height;
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,w,h);
    ctx.strokeStyle='#202d31'; ctx.lineWidth=1;
    for(let x=0;x<w;x+=w/8){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=h/4;y<h;y+=h/4){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const fresh = last && now-receivedAt < 1800;
    const audio = fresh ? last.audio : null;
    if(mode==='scope' && audio) {
      ctx.strokeStyle='#88d5bf'; ctx.lineWidth=1.5; ctx.beginPath();
      audio.wave.forEach((sample,i)=>{const x=i*w/(audio.wave.length-1), y=h/2-Math.max(-1,Math.min(1,sample))*h*.43; i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    } else if(mode==='wave') {
      const end = last?.playing ? now : lastHistory || now, start = end-seconds*1000;
      const visible = history.filter(sample=>sample.at>=start);
      const width = Math.max(1,w/(seconds*15));
      visible.forEach(sample=>{
        const x=(sample.at-start)/(seconds*1000)*w;
        const [low,mid,high]=sample.bands;
        ctx.fillStyle=high>low*0.8 && high>mid ? '#60bce8' : mid>low*1.1 ? '#8bd1b1' : '#e9b359';
        const amplitude=Math.min(1,Math.sqrt(sample.peak))*h*.43;
        ctx.fillRect(x,h/2-amplitude,width,Math.max(1,amplitude*2));
      });
    }
    ctx.strokeStyle='#dce7d7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w-2,0);ctx.lineTo(w-2,h);ctx.stroke();
    $('wave-window').textContent = mode==='wave' ? seconds+' s' : audio ? Math.round(audio.windowMs)+' ms' : '—';
    $('wave-in').disabled = $('wave-out').disabled = mode==='scope';
    $('wave-label').textContent = audio ? 'MASTER OUTPUT / '+(mode==='wave'?'CAPTURED HISTORY':'LIVE SCOPE') : history.length ? 'CAPTURED HISTORY / NO LIVE SIGNAL' : 'MASTER OUTPUT / WAITING FOR AUDIO';
    $('wave-source').textContent = audio ? (local ? 'Measured on this audio device' : 'Audio-device feed / network delay') : 'No fresh audio measurement';
    const db=audio && audio.rms>0 ? 20*Math.log10(audio.rms) : -Infinity;
    $('master-db').textContent = audio ? (Number.isFinite(db)?db.toFixed(1):'−∞')+' dBFS' : '— dBFS';
    $('master-meter').style.width = audio ? Math.max(0,Math.min(100,(db+60)/60*100))+'%' : '0%';
    $('clip-indicator').classList.toggle('hot',!!audio && audio.peak>=1);
    if(current) {
      const playing = fresh && last.playing;
      const cycle = fresh ? last.cycle+(playing?(now-receivedAt)/1000*current.song.bpm/240:0) : 0;
      const elapsed = fresh ? last.elapsed+(playing?(now-receivedAt)/1000:0) : 0;
      $('deck-time').textContent = timeText(elapsed);
      $('deck-position').textContent = String(Math.floor(cycle)+1).padStart(3,'0')+' / '+(Math.floor((cycle%1)*4)+1);
      $('jog-ring').style.setProperty('--phase',(cycle%1*360)+'deg');
      $('jog-beat').textContent = playing ? (Math.floor(cycle%1*4)+1)+'.'+String(Math.floor(cycle*16)%4+1) : current.playback ? 'LIVE' : 'READY';
      $('jog-mode').textContent = playing ? 'BAR '+(Math.floor(cycle)+1) : 'AUDIO DECK';
      const bars=Number.isFinite(current.song.bars)?current.song.bars:16, progress=(cycle%bars)/bars*100;
      $('deck-progress').style.width=progress+'%';
      document.querySelector('.track-progress').setAttribute('aria-valuenow',progress.toFixed(1));
    }
    controls.forEach((control,i)=>control.heading.classList.toggle('active',!!fresh && last.tracks?.includes(roles[i])));
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  return {
    catalog(songs) { baseTempos = new Map(songs.map(song=>[song.id,song.bpm])); },
    state(next,isLocal) {
      if(!next.song){local=false;current=null;last=null;$('cue').disabled=$('tempo').disabled=$('tempo-reset').disabled=true;
        if(mixer)updateMixer({...mixer,connected:false,ledConnected:false});return;}
      if(current?.song.id!==next.song.id){history=[];lastHistory=0;}
      current=next; local=isLocal;
      $('deck-title').textContent=next.song.name;
      $('deck-key').textContent=next.song.key || 'LIVE';
      $('deck-bpm').textContent=next.song.bpm.toFixed(1)+' BPM';
      $('tempo').value=next.song.bpm; $('tempo').disabled=$('tempo-reset').disabled=!next.playerConnected || !!next.pendingJob;
      $('cue').disabled=!local;
      $('play').textContent=next.playback?'PAUSE':'PLAY';
      $('play').setAttribute('aria-label',next.playback?'Pause':'Play');
      $('play').classList.toggle('playing',next.playback);
      $('session-chip').textContent=next.playback?'● LIVE':next.playerConnected?'READY':'STANDBY';
      $('session-chip').classList.toggle('playing',next.playback);
      if(mixer) updateMixer(mixer);
      if(!next.playerConnected){last=null;if(mixer)updateMixer({...mixer,connected:false,ledConnected:false});controls.forEach(c=>c.heading.classList.remove('active'));}
    },
    mixer:updateMixer,
    telemetry(frame) {
      last=frame; receivedAt=performance.now();
      if(frame.mixer) updateMixer(frame.mixer);
      if(frame.audio && (frame.playing || frame.audio.peak>0.001) && receivedAt-lastHistory>50) {
        lastHistory=receivedAt;
        history.push({at:receivedAt,peak:frame.audio.peak,bands:frame.audio.bands});
        history=history.filter(sample=>sample.at>receivedAt-65000);
      }
    },
    clear() {last=null;history=[];},
  };
}
