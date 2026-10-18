import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';
import {createLightsGateway} from '../lights-gateway.js';
test('lighting gateway subscribes read-only and forwards acknowledged controls without tokens in state',async t=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await once(server,'listening');
 const seen=[];server.on('connection',ws=>ws.on('message',raw=>{const m=JSON.parse(raw);seen.push(m.type);if(m.type==='auth')ws.send(JSON.stringify({type:'authenticated'}));else if(m.type==='subscribe')ws.send(JSON.stringify({type:'state',framesWritten:1,dryRun:true,colours:Array.from({length:8},()=>[0,0,0]),limit:32}));else ws.send(JSON.stringify({type:m.type==='bar'?'queued':'blackout',id:m.id}));}));
 const gateway=createLightsGateway({url:'ws://127.0.0.1:'+server.address().port,token:'private-bridge-token'});
 t.after(async()=>{gateway.disconnect();server.clients.forEach(ws=>ws.terminate());await new Promise(r=>server.close(r));});
 await gateway.command('connect');assert.deepEqual(seen,['auth','subscribe']);assert.equal(gateway.state().frame.dryRun,true);assert.ok(!JSON.stringify(gateway.state()).includes('private-bridge-token'));
 assert.equal((await gateway.command('bar',{bar:2,rgb:[1,2,3]})).type,'queued');assert.equal((await gateway.command('blackout')).type,'blackout');
 await assert.rejects(gateway.command('bar',{bar:9,rgb:[1,2,3]}));gateway.disconnect();assert.equal(gateway.state().connected,false);
});
