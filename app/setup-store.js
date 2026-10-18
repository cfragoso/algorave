import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateSong} from './model.js';
import {withSource} from './public/source.js';
import {defaultMaster,patchMaster} from './public/master-model.js';
export const defaultUi=()=>({midiTarget:'A',lights:{colour:'#df9c42',level:.5,target:'all'}});
export const defaultStrip=()=>Array.from({length:8},()=>({volume:.65,cutoff:.75,resonance:0,reverb:.05,mute:0,solo:0}));
export function validateStrips(values){
 const keys=['volume','cutoff','resonance','reverb','mute','solo'];
 if(!Array.isArray(values)||values.length!==8||!values.every(v=>v&&keys.every(k=>Number.isFinite(v[k])&&v[k]>=0&&v[k]<=1)))throw new Error('Invalid instrument mix');
 return values.map(v=>Object.fromEntries(keys.map(k=>[k,v[k]])));
}
export function validateUi(ui){
 if(!ui||!['A','B'].includes(ui.midiTarget)||!/^#[0-9a-f]{6}$/i.test(ui.lights?.colour)||!Number.isFinite(ui.lights?.level)||ui.lights.level<0||ui.lights.level>1||!['all','1','2','3','4','5','6','7','8'].includes(ui.lights?.target))throw new Error('Invalid setup controls');
 return {midiTarget:ui.midiTarget,lights:{colour:ui.lights.colour,level:ui.lights.level,target:ui.lights.target}};
}
export function validateSetup(value){
 if(value?.schema!=='algorave-setup'||value.version!==1||typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>80)throw new Error('Use a named Algorave setup (version 1)');
 const decks={};for(const id of ['A','B']){if(!value.decks?.[id])throw new Error('Setup needs decks A and B');decks[id]={song:withSource(validateSong(structuredClone(value.decks[id].song))),mix:validateStrips(value.decks[id].mix)};}
 const portableMixer=patchMaster(defaultMaster(),value.mixer);portableMixer.sinkId='';
 return {schema:'algorave-setup',version:1,name:value.name.trim(),decks,mixer:portableMixer,ui:validateUi(value.ui)};
}
export function createSetupStore(directory){
 const filename=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid setup ID');return path.join(directory,id+'.json');};
 return {
  async list(){let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
   const values=[];for(const name of names){if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;const raw=JSON.parse(await readFile(path.join(directory,name),'utf8'));validateSetup(raw);values.push({id:raw.id,name:raw.name,updatedAt:raw.updatedAt});}return values.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},
  async get(id){const raw=JSON.parse(await readFile(filename(id),'utf8'));return {...validateSetup(raw),id:raw.id,updatedAt:raw.updatedAt};},
  async save(value,id){const setup=validateSetup(value);id ||= randomUUID();const file=filename(id);await mkdir(directory,{recursive:true});const saved={...setup,id,updatedAt:new Date().toISOString()};const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(saved,null,2)+'\n');await rename(temp,file);return saved;},
 };
}
