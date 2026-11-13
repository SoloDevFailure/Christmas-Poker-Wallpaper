import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiConversionError, allowanceResult, retryDelay, waitMessage } from '../src/aiQuota';
test('quota recovery accepts only bounded server delays and distinguishes permanent limits', () => {
  for (const value of [undefined, null, '60', -1, 0, Infinity, NaN, 86401]) assert.equal(retryDelay(value), undefined);
  assert.equal(retryDelay(1.1), 2);
  assert.deepEqual(allowanceResult({ available: true }, true).available, true);
  assert.equal(allowanceResult({ available: true }, false).available, false);
  const rolling = allowanceResult({ code: 'AI_USER_LIMIT', error: 'Rolling allowance used.', retry_after_seconds: 60, retryable: false }, false);
  assert.equal(rolling.retryAfterSeconds, 60); assert.equal(rolling.retryable, false);
  const budget = allowanceResult({ error: 'Event budget exhausted.', retryable: false }, false);
  assert.equal(budget.retryAfterSeconds, undefined); assert.equal(budget.retryable, false);
  const error = new AiConversionError('Wait', false, 'request', false, 60);
  assert.equal(error.retryAfterSeconds, 60);
});
test('countdown explains approximate refill time without implying generation', () => {
  assert.match(waitMessage(1800), /30 min/); assert.match(waitMessage(61), /2 min/);
  assert.match(waitMessage(1), /1 min/); assert.match(waitMessage(0), /Checking/);
});
