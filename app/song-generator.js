// Offline phrase-driven composition. Prompt text is metadata, never executable code.
import {createHash,randomUUID} from 'node:crypto';
import {trackIds} from './public/source.js';

export function generateSong(phrase) {
  if(typeof phrase!=='string'||!phrase.trim()||phrase.length>500)throw new Error('Use a phrase containing 1–500 characters');
  const prompt=phrase.replace(/\s+/gu,' ').trim(),lower=prompt.toLowerCase();
  let genre=lower.match(/\b(house|techno|trance|ambient|soundscape)\b/)?.[1]||'house';
  if(genre==='soundscape')genre='ambient';
  const hint=lower.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/);
  const bpm=hint?Number(hint[1]):({house:122,techno:134,trance:138,ambient:90})[genre];
  if(bpm<40||bpm>250)throw new Error('Requested tempo must be 40–250 BPM');
  const seed=createHash('sha256').update(prompt).digest('hex');
  let state=parseInt(seed.slice(0,8),16);
  const choose=items=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return items[state%items.length];};
  const major=/\b(bright|happy|uplifting|sunny|joyful|warm)\b/.test(lower)&&!/\b(dark|minor|sad|night|moody)\b/.test(lower);
  const scale=major?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10],root=choose([0,2,4,5,7,9]);
  const names=['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
  const note=(degree,octave)=>{const semitone=root+scale[degree%7]+12*Math.floor(degree/7);return names[semitone%12]+(octave+Math.floor(semitone/12));};
  const melody=Array.from({length:8},()=>note(choose([0,2,4,6,7]),4)).join(' ');
  const bass=[0,0,5,3].map(degree=>note(degree,2)).join(' ');
  const chords=[0,5,3,4].map(degree=>'['+[0,2,4].map(step=>note(degree+step,3)).join(',')+']').join(' ');
  const fast=['techno','trance'].includes(genre),airy=genre==='ambient';
  const patterns=[
    's("bd*4").bank("tr909").gain(0.55)',
    's("~ cp ~ cp").bank("tr909").gain(0.22)',
    `s("hh*${fast?16:8}").bank("tr909").gain("0.10 0.05").hpf(5000)`,
    choose(['s("~ oh ~ ~").bank("tr909").gain(0.08)','s("~ rim ~ rim").bank("tr909").gain(0.10)']),
    `note("<${bass}>").struct("~ x ~ x ~ x ~ x").s("sawtooth").lpf(${airy?550:950}).decay(0.18).sustain(0).gain(0.12)`,
    `note("${melody}").s("${fast?'sawtooth':'triangle'}").lpf(2400).decay(0.16).sustain(0).room(0.25).gain(0.07)`,
    `note("<${chords}>").s("triangle").attack(0.12).release(0.6).room(0.4).gain(0.08)`,
    's("nightvox:0 ~ ~ ~").slow(4).room(0.3).gain(0.10)',
  ];
  const active=[
    [1,1,1,0,0,1,1],[0,1,1,0,0,1,0],[0,1,1,0,1,1,1],[0,0,1,0,1,1,0],
    [0,1,1,0,0,1,0],[0,0,1,1,1,1,0],[0,1,1,1,1,1,1],[0,0,1,0,0,1,0],
  ];
  const bars=[8,16,24,8,8,24,8];
  const tracks=trackIds.map((id,index)=>{
    let code='arrange('+bars.map((length,part)=>`[${length}, ${active[index][part]?patterns[index]:'silence'}]`).join(', ')+')';
    if(airy&&index<4)code='('+code+').gain(0.4)';
    return {id,column:index+1,code,sound:null,enabled:true};
  });
  const name=prompt.slice(0,120);
  const code=`// ${name}\n// Phrase-driven procedural composition · ${genre}\nsetcpm(${bpm} / 4);\n\n`+tracks.map(track=>`${track.id}$: ${track.code};`).join('\n\n');
  return {id:'generated-'+randomUUID(),name,bpm,key:names[root].toUpperCase()+(major?' major':' minor'),bars:96,
    tracks,code,generation:{method:'phrase-procedural-v1',prompt:phrase,seed,genre}};
}
