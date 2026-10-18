export function createLightsMonitor() {
  const $=id=>document.getElementById(id);
  let socket, lastFrame, receivedAt=0, pending=false;
  const fixtures=[];
  for(let i=0;i<8;i++){
    const fixture=document.createElement('div');fixture.className='light-fixture';
    const body=document.createElement('div');body.className='light-body';
    for(let j=0;j<10;j++){const pixel=document.createElement('i');pixel.className='light-pixel';body.append(pixel);}
    const label=document.createElement('span');label.className='fixture-label';label.textContent=String(i+1).padStart(2,'0');
    fixture.append(body,label);$('light-bars').append(fixture);fixtures.push(fixture);
  }
  try{$('light-url').value=localStorage.getItem('algorave-light-url') || $('light-url').value;}catch{}
  $('light-url').onchange=()=>{try{const url=new URL($('light-url').value);if(['ws:','wss:'].includes(url.protocol))localStorage.setItem('algorave-light-url',url.href);}catch{}};
  const status=(text,kind='')=>{$('lights-state').textContent=text;$('lights-state').className='connection-chip '+kind;};
  const render=()=>{
    const fresh=socket?.readyState===WebSocket.OPEN && performance.now()-receivedAt<1800;
    fixtures.forEach((fixture,i)=>{
      const rgb=lastFrame?.colours?.[i];
      fixture.classList.toggle('live',!!fresh && !!rgb);
      if(!rgb)return;
      const normalized=rgb.map(v=>Math.min(255,Math.round(v*255/Math.max(1,lastFrame.limit))));
      fixture.style.setProperty('--rgb','rgb('+normalized.join(',')+')');
      fixture.style.setProperty('--glow',rgb.some(v=>v>0)?'rgb('+normalized.join(' ')+' / .35)':'transparent');
      fixture.title='Bar '+(i+1)+' · DMX RGB '+rgb.join(', ')+(fresh?'':' · last known');
    });
    if(lastFrame){
      status(fresh?(lastFrame.dryRun?'SIMULATION':'DMX LIVE'):'STALE',fresh?'online':'error');
      $('lights-detail').textContent=fresh?'Preview scaled to '+lastFrame.limit+'/255 limit':'Last frame retained · output unconfirmed';
      $('lights-mode').textContent=lastFrame.dryRun?'No USB output':'ENTTEC output frame';
    }
  };
  function receive(event){
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='authenticated'){socket.send(JSON.stringify({type:'subscribe'}));pending=false;}
    if(message.type==='state' && message.framesWritten>0 && Array.isArray(message.colours) && message.colours.length>0 && message.colours.slice(0,8).every(rgb=>Array.isArray(rgb)&&rgb.length===3&&rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255)) && Number.isInteger(message.limit) && message.limit>=0 && message.limit<=255){
      lastFrame=message;receivedAt=performance.now();pending=false;render();
    }
    if(message.type==='error'){
      pending=false;
      status('BRIDGE ERROR','error');$('lights-detail').textContent=message.message || 'Bridge rejected the subscription';
      if(/Unknown command/.test(message.message || ''))$('lights-detail').textContent='Restart the updated lighting bridge to enable live monitoring';
    }
  }
  $('light-connect').onsubmit=event=>{
    event.preventDefault();socket?.close();lastFrame=null;receivedAt=0;pending=true;
    try{
      const url=new URL($('light-url').value);
      if(!['ws:','wss:'].includes(url.protocol))throw new Error('Use a ws:// or wss:// bridge URL');
      socket=new WebSocket(url.href);status('CONNECTING');
      const connection=socket;
      try{localStorage.setItem('algorave-light-url',url.href);}catch{}
      socket.onopen=()=>{
        const token=$('light-token').value;
        socket.send(JSON.stringify(token?{type:'auth',token}:{type:'subscribe'}));
        $('light-token').value='';
      };
      socket.onmessage=event=>{if(socket===connection)receive(event);};
      socket.onerror=()=>{if(socket!==connection)return;pending=false;status('UNAVAILABLE','error');$('lights-detail').textContent='Start the lighting bridge, then reconnect';};
      socket.onclose=()=>{if(socket!==connection)return;pending=false;status('OFFLINE');render();};
      setTimeout(()=>{if(pending){status('NO STATUS','error');$('lights-detail').textContent='Bridge did not provide a live frame';}},3000);
    }catch(error){pending=false;status('INVALID URL','error');$('lights-detail').textContent=error.message;}
  };
  $('disconnect-lights').onclick=()=>{socket?.close();socket=null;pending=false;render();status(lastFrame?'STALE':'OFFLINE');};
  setInterval(render,500);
  return {disconnect(){socket?.close();}};
}
