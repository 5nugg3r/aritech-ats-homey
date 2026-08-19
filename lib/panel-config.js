'use strict';

/**
 * Validation and normalisation of the panel connection form, shared by both
 * drivers so the rules cannot drift apart.
 */

/** Default TCP port for the ATS automation/IP interface. */
const DEFAULT_PORT = 32000;

/** Valid encryption key lengths: 24 digits on x500, 48 on x700. */
const KEY_LENGTHS = [24, 48];

/**
 * Whether the account uses the panel's factory default, where the password
 * equals the username.
 * @param {string} username
 * @param {string} password
 * @returns {boolean}
 */
function usesDefaultPassword(username, password) {
  return Boolean(username) && String(password) === String(username);
}

/**
 * Validate and normalise the connection form into an AritechClient config.
 *
 * A username without a password is rejected rather than defaulted to the
 * username: that default is a documented panel setting, and silently adopting
 * it turns a factory default into a credential nobody chose.
 *
 * @param {object} data - Raw form fields.
 * @returns {{host: string, port: number, encryptionKey: string, pin?: string, username?: string, password?: string}}
 * @throws {Error} When a field is missing or malformed.
 */
function buildPanelConfig(data = {}) {
  const host = String(data.host || '').trim();
  const port = Number.parseInt(data.port, 10) || DEFAULT_PORT;
  const encryptionKey = String(data.encryptionKey || '').trim();
  const pin = String(data.pin || '').trim();
  const username = String(data.username || '').trim();
  const password = String(data.password || '').trim();

  if (!host) {
    throw new Error('Host / IP address is required');
  }
  if (!/^\d+$/.test(encryptionKey) || !KEY_LENGTHS.includes(encryptionKey.length)) {
    throw new Error('Encryption key must be 24 digits (x500) or 48 digits (x700)');
  }
  if (!username && !pin) {
    throw new Error('Enter a PIN (x500) or a username and password (x700)');
  }
  if (username && !password) {
    throw new Error(
      'Enter the password for this account. Panels ship with the password set to the username; '
      + 'if that is still the case, set a distinct password on the panel first.',
    );
  }

  const config = { host, port, encryptionKey };
  if (username) {
    config.username = username;
    config.password = password;
  } else {
    config.pin = pin;
  }
  return config;
}

module.exports = {
  DEFAULT_PORT,
  KEY_LENGTHS,
  usesDefaultPassword,
  buildPanelConfig,
};
