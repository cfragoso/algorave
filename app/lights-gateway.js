import {WebSocket} from 'ws';
import {randomUUID} from 'node:crypto';
// The endpoint is configured by the operator, never supplied by an HTTP caller.
export function createLightsGateway({url=process.env.ALGORAVE_LIGHT_URL||'ws://127.0.0.1:8765',token=process.env.ALGORAVE_LIGHT_TOKEN||''}={}){
  let socket,frame=null,receivedAt=0,connecting=null,lastError=null;
  const requests=new Map();
  const state=()=>({connected:socket?.readyState===WebSocket.OPEN,fresh:Date.now()-receivedAt<1800,frame,lastError,url});
  const disconnect=()=>{socket?.close();socket=null;frame=null;receivedAt=0;for(const request of requests.values()){clearTimeout(request.timer);request.reject(new Error('Lighting bridge disconnected'));}requests.clear();};
  const ask=(type,input={})=>new Promise((resolve,reject)=>{
    if(socket?.readyState!==WebSocket.OPEN)return reject(new Error('Lighting bridge is disconnected'));
    const id=randomUUID(),timer=setTimeout(()=>{requests.delete(id);reject(new Error('Lighting bridge acknowledgement timed out'));},3000);
    requests.set(id,{resolve,reject,timer});socket.send(JSON.stringify({...input,type,id}));
  });
  const connect=()=>{
    if(socket?.readyState===WebSocket.OPEN)return Promise.resolve();if(connecting)return connecting;
    const connection=new WebSocket(url);socket=connection;lastError=null;
    connecting=new Promise((resolve,reject)=>{
      let ready=false;
      const timeout=setTimeout(()=>{connection.terminate();reject(new Error('Lighting connection timed out'));},4000);
      const done=error=>{if(ready)return;ready=true;clearTimeout(timeout);error?reject(error):resolve();};
      connection.on('open',()=>connection.send(JSON.stringify(token?{type:'auth',token}:{type:'subscribe'})));
      connection.on('message',raw=>{
        if(socket!==connection)return;
        let message;try{message=JSON.parse(raw);}catch{return;}
        if(message.type==='authenticated')connection.send(JSON.stringify({type:'subscribe'}));
        if(message.type==='state'){frame=message;receivedAt=Date.now();done();}
        if(message.type==='error'){lastError=message.message;if(!ready)done(new Error(lastError));}
        const request=requests.get(message.id);
        if(request){clearTimeout(request.timer);requests.delete(message.id);message.type==='error'?request.reject(new Error(message.message)):request.resolve(message);}
      });
      connection.on('error',error=>{lastError=error.message;done(error);});
      connection.on('close',()=>{
        done(new Error('Lighting bridge disconnected'));
        if(socket!==connection)return;
        for(const request of requests.values()){clearTimeout(request.timer);request.reject(new Error('Lighting bridge disconnected'));}requests.clear();
      });
    }).finally(()=>{connecting=null;});return connecting;
  };
  return {state,disconnect,async command(action,input={}){
    if(action==='disconnect'){disconnect();return state();}
    if(action==='connect'){await connect();return state();}
    if(action==='bar' && (!Number.isInteger(input.bar)||input.bar<1||input.bar>8||!Array.isArray(input.rgb)||input.rgb.length!==3||!input.rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw new Error('Use bar 1–8 and RGB values 0–255');
    if(!['bar','blackout'].includes(action))throw new Error('Unknown lighting command');
    return ask(action,action==='bar'?{bar:input.bar,rgb:input.rgb,exclusive:input.exclusive===true}:{});
  }};
}
