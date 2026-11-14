// Loading screen: the status line steps through its messages and holds the last one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOADING_STEPS, loadingStep } from '../src/components/splash/loadingSteps.ts';

test('the status line starts on the first message and steps every interval', () => {
  assert.equal(loadingStep(0), LOADING_STEPS[0]);
  assert.equal(loadingStep(699), LOADING_STEPS[0]);
  assert.equal(loadingStep(700), LOADING_STEPS[1]);
});

test('a slow connection holds the last message instead of looping', () => {
  assert.equal(loadingStep(60_000), LOADING_STEPS[LOADING_STEPS.length - 1]);
  assert.equal(loadingStep(-5), LOADING_STEPS[0]);
});
