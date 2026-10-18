export const defaultMaster = () => ({crossfader:0.5,master:0.7,sinkId:'',channels:{A:{volume:0.8,low:0,mid:0,high:0},B:{volume:0.8,low:0,mid:0,high:0}}});
export function patchMaster(current,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw new Error('Invalid master mixer patch');
  const next=structuredClone(current);
  for(const [key,value] of Object.entries(patch)){
    if(['crossfader','master'].includes(key)){
      if(!Number.isFinite(value)||value<0||value>1)throw new Error(key+' must be 0–1');next[key]=value;
    }else if(key==='sinkId'){
      if(typeof value!=='string'||value.length>256)throw new Error('Invalid output device');next.sinkId=value;
    }else if(key==='channels'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid channels');
      for(const [id,channel] of Object.entries(value)){
        if(!['A','B'].includes(id)||!channel||typeof channel!=='object'||Array.isArray(channel))throw new Error('Use channel A or B');
        for(const [param,v] of Object.entries(channel)){
          if(!['volume','low','mid','high'].includes(param)||!Number.isFinite(v)||v<(param==='volume'?0:-24)||v>(param==='volume'?1:12))throw new Error('Invalid channel control');
          next.channels[id][param]=v;
        }
      }
    }else throw new Error('Unknown master mixer control');
  }
  return next;
}
export function crossfadeGains(position){
  return [Math.cos(position*Math.PI/2),Math.sin(position*Math.PI/2)].map(v=>v<1e-9?0:v);
}
