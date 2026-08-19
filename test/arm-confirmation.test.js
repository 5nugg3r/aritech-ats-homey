'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { unconfirmedArmOutcome, ARM_CONFIRM_TIMEOUT_MS } = require('../lib/arm-confirmation');

test('a confirmed state needs no correction', () => {
  assert.strictEqual(unconfirmedArmOutcome('armed', 'armed'), null);
  assert.strictEqual(unconfirmedArmOutcome('disarmed', 'disarmed'), null);
});

test('nothing to do when no state was requested', () => {
  assert.strictEqual(unconfirmedArmOutcome(null, 'armed'), null);
});

test('reverts to the last observed state when the panel disagrees', () => {
  const outcome = unconfirmedArmOutcome('armed', 'disarmed');
  assert.strictEqual(outcome.revertTo, 'disarmed');
  assert.match(outcome.message, /did not confirm "armed"/);
  assert.match(outcome.message, /still reports "disarmed"/);
});

test('warns without reverting when the panel was never heard from', () => {
  const outcome = unconfirmedArmOutcome('armed', null);
  assert.strictEqual(outcome.revertTo, null);
  assert.match(outcome.message, /never confirmed "armed"/);
});

test('the timeout leaves room for a normal exit delay', () => {
  assert.ok(ARM_CONFIRM_TIMEOUT_MS >= 60000, 'must outlast a 60s exit delay');
});
