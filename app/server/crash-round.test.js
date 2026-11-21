import test from 'node:test';
import assert from 'node:assert/strict';
import { crashAt, crashPoint } from './crash-round.js';

test('the first displayed multiplier can already be terminal', () => {
  assert.equal(crashPoint(999,1000),100);
  assert.deepEqual(crashAt(100,0),{crashed:true,hundredths:100});
  assert.equal(crashPoint(1,1000),5000);
});

test('the same clock and hundredths govern live quotes and terminal quotes', () => {
  const end = Math.log(1.25)*1800;
  assert.deepEqual(crashAt(125,end-1),{crashed:false,hundredths:124});
  assert.deepEqual(crashAt(125,end),{crashed:true,hundredths:125});
  assert.deepEqual(crashAt(125,end+100000),{crashed:true,hundredths:125});
});
