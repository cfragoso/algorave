import {crossfadeGains} from './master-model.js';
import {createAudioMonitor} from './monitor.js';
export function createMasterAudio(){
  const context=new AudioContext({latencyHint:'interactive'}),channels={};
  const master=context.createGain(), limiter=context.createDynamicsCompressor();
  limiter.threshold.value=-3;limiter.knee.value=3;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;
  master.connect(limiter);limiter.connect(context.destination);
  for(const id of ['A','B']){
    const input=context.createGain(), low=context.createBiquadFilter(),mid=context.createBiquadFilter(),high=context.createBiquadFilter(),fader=context.createGain(),crossfade=context.createGain();
    low.type='lowshelf';low.frequency.value=200;mid.type='peaking';mid.frequency.value=1000;mid.Q.value=.7;high.type='highshelf';high.frequency.value=4000;
    input.connect(low);low.connect(mid);mid.connect(high);high.connect(fader);fader.connect(crossfade);crossfade.connect(master);
    channels[id]={input,low,mid,high,fader,crossfade,source:null,monitor:createAudioMonitor(context,()=>fader)};
  }
  const monitor=createAudioMonitor(context,()=>limiter);
  const ramp=(param,value)=>param.setTargetAtTime(value,context.currentTime,.015);
  return {context,channels,monitor,
    attach(id,source){
      const channel=channels[id];if(channel.source===source)return;
      if(!channel.streamDestination || channel.streamDestination.context!==source.context){
        channel.streamSource?.disconnect();
        channel.streamDestination=source.context.createMediaStreamDestination();
        channel.streamSource=context.createMediaStreamSource(channel.streamDestination.stream);
        channel.streamSource.connect(channel.input);
      }
      if(channel.source){try{channel.source.disconnect(channel.streamDestination);}catch{}}
      channel.source=source;
      // Each Strudel realm owns its AudioContext and effect prototypes. A local
      // MediaStream bridge carries stereo audio into the single output graph.
      try{source.disconnect(source.context.destination);}catch{}
      source.connect(channel.streamDestination);
    },
    async apply(settings){
      if(settings.sinkId!==(context.sinkId||'')){
        if(!context.setSinkId)throw new Error('Output selection is unavailable; select the device in system audio settings');
        await context.setSinkId(settings.sinkId);
      }
      const gains=crossfadeGains(settings.crossfader);ramp(master.gain,settings.master);
      ['A','B'].forEach((id,i)=>{const c=channels[id],v=settings.channels[id];ramp(c.fader.gain,v.volume);ramp(c.crossfade.gain,gains[i]);for(const eq of ['low','mid','high'])ramp(c[eq].gain,v[eq]);});
    },
    silence(){ramp(master.gain,0);},
  };
}
