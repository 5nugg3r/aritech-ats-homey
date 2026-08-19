'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { isPrivateHost, requiresKeyReconfirmation } = require('../lib/host-checks');

test('recognises non-routable IPv4 ranges', () => {
  for (const host of ['10.0.0.5', '192.168.1.40', '172.16.0.1', '172.31.255.254',
    '127.0.0.1', '169.254.1.1', '100.64.0.1']) {
    assert.strictEqual(isPrivateHost(host), true, host);
  }
});

test('flags publicly routable IPv4 addresses', () => {
  for (const host of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '203.0.113.7']) {
    assert.strictEqual(isPrivateHost(host), false, host);
  }
});

test('does not judge hostnames, loopback names or IPv6 unique-local', () => {
  for (const host of ['panel.local', 'localhost', '::1', 'fd00::1', '', undefined]) {
    assert.strictEqual(isPrivateHost(host), true, String(host));
  }
});

test('changing the address requires the encryption key again', () => {
  assert.strictEqual(requiresKeyReconfirmation('192.168.1.40', '192.168.1.99', ''), true);
  assert.strictEqual(requiresKeyReconfirmation('192.168.1.40', '8.8.8.8', '   '), true);
});

test('an unchanged address keeps the blank-means-keep behaviour', () => {
  assert.strictEqual(requiresKeyReconfirmation('192.168.1.40', '192.168.1.40', ''), false);
  assert.strictEqual(requiresKeyReconfirmation('192.168.1.40', '', ''), false);
});

test('supplying the key satisfies the reconfirmation', () => {
  assert.strictEqual(requiresKeyReconfirmation('192.168.1.40', '192.168.1.99', '1357'), false);
});
