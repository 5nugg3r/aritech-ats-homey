'use strict';

/**
 * Checks on the panel address used by the repair flow.
 */

/**
 * Whether a host is a literal IP address in a range that cannot be routed over
 * the internet, or a loopback/hostname. Hostnames return true because they
 * cannot be judged without resolving them, and the repair flow only uses this
 * to decide whether to warn.
 *
 * @param {string} host - IP address or hostname.
 * @returns {boolean} False only for a literal, publicly routable IPv4 address.
 */
function isPrivateHost(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return true;

  if (value === 'localhost' || value.startsWith('::1') || value.startsWith('fc') || value.startsWith('fd')) {
    return true;
  }

  const parts = value.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) {
    return true; // Not a literal IPv4 address; nothing to judge here.
  }
  const [a, b] = parts.map(Number);
  if (parts.some((p) => Number(p) > 255)) return true;

  return (
    a === 10
    || a === 127
    || (a === 192 && b === 168)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127) // CGNAT, common on tunnels
  );
}

/**
 * Whether the repair flow must ask for the encryption key again.
 *
 * Blank secret fields normally mean "keep the current value", which is
 * convenient — but combined with a changed address it would silently send the
 * existing credentials to a different machine. Redirecting the app therefore
 * requires proving knowledge of the key.
 *
 * @param {string} currentHost - The address stored on the device.
 * @param {string} newHost - The address entered in the repair form.
 * @param {string} providedKey - The encryption key entered in the repair form.
 * @returns {boolean}
 */
function requiresKeyReconfirmation(currentHost, newHost, providedKey) {
  const from = String(currentHost || '').trim();
  const to = String(newHost || '').trim();
  if (!to || to === from) return false;
  return String(providedKey || '').trim().length === 0;
}

module.exports = { isPrivateHost, requiresKeyReconfirmation };
