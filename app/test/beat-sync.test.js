import test from 'node:test';import assert from 'node:assert/strict';
import {Cyclist} from '@strudel/core/cyclist.mjs';
import {alignScheduler,nearestAlignedCycle} from '../public/beat-sync.js';
test('sync matches phase across audio clock origins and retains the nearby song bar',async()=>{
 let time=10;const pattern={queryArc:()=>[]};
 const scheduler=offset=>new Cyclist({getTime:()=>time+offset,onTrigger:()=>{},setInterval:()=>1,clearInterval:()=>{}});
 const a=scheduler(100),b=scheduler(250);a.setCps(140/240);b.setCps(122/240);await a.setPattern(pattern,true);time+=.73;await b.setPattern(pattern,true);time+=1.13;
 const previous=b.now();await alignScheduler(b,{cycle:a.now(),bpm:140,playing:true,time},()=>time,previous);
 const error=()=>Math.abs(((a.now()-b.now()+.5)%1+1)%1-.5);
 assert.ok(error()<.0001);assert.equal(b.cps,a.cps);assert.ok(Math.abs(b.now()-previous)<=.5);time+=30;assert.ok(error()<.0001);
 assert.equal(nearestAlignedCycle(20.9,3.1),21.1);
});
