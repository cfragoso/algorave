// Adapter for the pinned Strudel 1.3 Cyclist scheduler. Its initial query begins
// clock.minLatency seconds after start; both decks have the same output latency.
export function nearestAlignedCycle(targetCycle, referenceCycle){
  const phase=((referenceCycle%1)+1)%1;
  return Math.max(0,Math.round(targetCycle-phase))+phase;
}
export async function alignScheduler(scheduler,reference,now,targetCycle=scheduler.now()){
  if(!Number.isFinite(reference.cycle)||!Number.isFinite(reference.bpm)||reference.bpm<40||reference.bpm>250)throw new Error('Invalid reference clock');
  if(!scheduler.clock || !Number.isFinite(scheduler.clock.minLatency) || !('lastEnd' in scheduler))throw new Error('This scheduler does not support beat alignment');
  const cps=reference.bpm/240;
  scheduler.stop();scheduler.setCps(cps);
  const referenceNow=reference.cycle+(reference.playing?(now()-reference.time)*cps:0);
  const aligned=nearestAlignedCycle(targetCycle,referenceNow);
  // now() subtracts one query duration from the clock phase. Compensate
  // both that duration and the initial clock lead. start() retains lastEnd.
  scheduler.lastEnd=aligned+(scheduler.clock.minLatency+scheduler.clock.duration)*cps;
  await scheduler.start();
  return aligned;
}
