import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMaster,patchMaster,crossfadeGains} from '../public/master-model.js';
test('master patches preserve the other channel and crossfader endpoints silence the opposite deck',()=>{
 const original=defaultMaster(),next=patchMaster(original,{channels:{A:{volume:.2,low:-12}},crossfader:0});
 assert.equal(next.channels.A.volume,.2);assert.equal(next.channels.B.volume,.8);assert.equal(original.channels.A.volume,.8);
 assert.deepEqual(crossfadeGains(0),[1,0]);assert.deepEqual(crossfadeGains(1),[0,1]);
 const [a,b]=crossfadeGains(.5);assert.ok(Math.abs(a*a+b*b-1)<1e-10);
 for(const patch of [{channels:{C:{volume:.5}}},{channels:{A:{volume:NaN}}},{channels:{A:{high:13}}},{master:-1},{other:true}])assert.throws(()=>patchMaster(original,patch));
});
