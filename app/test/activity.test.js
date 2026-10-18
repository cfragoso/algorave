import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityClock, validRanges} from '../public/activity.js';

test('highlighting follows scheduled audio time, skips muted events and clears stale score positions', () => {
  const clock = createActivityClock();
  const hap = {value: {postgain: 0.65}, context: {algoraveSource: 'kick$: s("bd")',
    locations: [{start: 10, end: 12}], algoraveLabel: {start: 0, end: 5}}};
  clock.schedule(hap, 10, 0.25);
  assert.deepEqual(clock.frame(9.99, hap.context.algoraveSource).ranges, []);
  assert.deepEqual(clock.frame(10.01, hap.context.algoraveSource).ranges, [{start: 10, end: 12}]);
  assert.deepEqual(clock.frame(10.01, hap.context.algoraveSource).labels, [{start: 0, end: 5}]);
  assert.deepEqual(clock.frame(10.26, hap.context.algoraveSource).ranges, []);
  clock.schedule({...hap, value: {postgain: 0}}, 11, 1);
  assert.deepEqual(clock.frame(11, hap.context.algoraveSource).ranges, []);
  clock.schedule(hap, 12, 1);
  assert.deepEqual(clock.frame(12, 'different score').ranges, []);
  clock.schedule(hap, 14, 1); clock.clear();
  assert.deepEqual(clock.frame(14, hap.context.algoraveSource).ranges, []);
  assert.deepEqual(validRanges([{start: -1, end: 2}, {start: 0, end: 2}, {start: 0, end: 2}], 4), [{start: 0, end: 2}]);
});
