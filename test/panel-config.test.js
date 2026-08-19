'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildPanelConfig, usesDefaultPassword, DEFAULT_PORT } = require('../lib/panel-config');

const KEY_24 = '135792468013579246801357';
const KEY_48 = `${KEY_24}${KEY_24}`;

test('rejects an account without a password instead of defaulting to the username', () => {
  assert.throws(
    () => buildPanelConfig({ host: '10.0.0.5', encryptionKey: KEY_48, username: 'homey' }),
    /Enter the password for this account/,
  );
});

test('accepts an account when the password is given explicitly', () => {
  const config = buildPanelConfig({
    host: '10.0.0.5', encryptionKey: KEY_48, username: 'homey', password: 's3cret',
  });
  assert.strictEqual(config.username, 'homey');
  assert.strictEqual(config.password, 's3cret');
  assert.ok(!('pin' in config));
});

test('still allows the panel default, but only as a deliberate entry', () => {
  const config = buildPanelConfig({
    host: '10.0.0.5', encryptionKey: KEY_48, username: 'homey', password: 'homey',
  });
  assert.strictEqual(config.password, 'homey');
  assert.strictEqual(usesDefaultPassword(config.username, config.password), true);
});

test('usesDefaultPassword only flags a username/password match', () => {
  assert.strictEqual(usesDefaultPassword('homey', 'homey'), true);
  assert.strictEqual(usesDefaultPassword('homey', 'other'), false);
  assert.strictEqual(usesDefaultPassword('', ''), false);
  assert.strictEqual(usesDefaultPassword(undefined, undefined), false);
});

test('PIN login needs no password and keeps working', () => {
  const config = buildPanelConfig({ host: '10.0.0.5', encryptionKey: KEY_24, pin: '1234' });
  assert.strictEqual(config.pin, '1234');
  assert.strictEqual(config.port, DEFAULT_PORT);
  assert.ok(!('username' in config));
});

test('rejects a missing host and a malformed encryption key', () => {
  assert.throws(() => buildPanelConfig({ encryptionKey: KEY_24, pin: '1' }), /Host/);
  assert.throws(() => buildPanelConfig({ host: 'h', encryptionKey: '123', pin: '1' }), /24 digits/);
  assert.throws(() => buildPanelConfig({ host: 'h', encryptionKey: `abc${KEY_24}`, pin: '1' }), /24 digits/);
});

test('requires a PIN or an account', () => {
  assert.throws(() => buildPanelConfig({ host: 'h', encryptionKey: KEY_24 }), /Enter a PIN/);
});
