'use strict';

/**
 * Zone type helpers for the ats-zone driver.
 *
 * The ATS automation protocol (as implemented by the vendored aritech-js
 * library) does not expose a per-zone type (PIR / door contact / fire / ...).
 * ZoneState only carries status flags. To still present the right kind of
 * Homey sensor, we let the user pick a type per device and default it with a
 * name-based heuristic (zone names like "Meterkast" or "Brand" are telling).
 */

/**
 * Capability set per sensor type. The first entry is the primary "active/open"
 * indicator shown on the tile; `alarm_tamper` and the settable `inhibited`
 * (bypass) control are always present. For motion and contact zones we
 * additionally expose `alarm_generic` ("In alarm") so an armed trip is visible
 * separately from mere activity.
 * @type {Record<string, string[]>}
 */
const TYPE_CAPS = {
  motion: ['alarm_motion', 'alarm_generic', 'alarm_tamper', 'alarm_battery', 'zone_active'],
  contact: ['alarm_contact', 'alarm_generic', 'alarm_tamper', 'alarm_battery', 'zone_active'],
  fire: ['alarm_fire', 'alarm_tamper', 'alarm_battery', 'zone_active'],
  generic: ['alarm_generic', 'alarm_tamper', 'alarm_battery', 'zone_active'],
};

/** @type {string[]} Selectable concrete types (excludes the 'auto' setting). */
const ZONE_TYPES = Object.keys(TYPE_CAPS);

/**
 * Guess a zone type from its (zone) name. Dutch and English keywords are
 * matched; anything unrecognised defaults to motion (the most common detector).
 * @param {string} name - The zone name.
 * @returns {'fire'|'contact'|'motion'} The guessed type.
 */
function guessZoneType(name) {
  const n = String(name || '').toLowerCase();
  if (/brand|fire|rook|smoke|\bco\b|hitte|thermisch|warmte/.test(n)) return 'fire';
  if (/deur|door|raam|window|contact|magneet|kast|poort|hek|reed|luik|schuifpui|\bpui\b|slot/.test(n)) return 'contact';
  return 'motion';
}

/**
 * Resolve an effective concrete type from a setting value and a device name.
 * @param {string} setting - The `sensor_type` setting ('auto' or a concrete type).
 * @param {string} name - The device/zone name (used when setting is 'auto').
 * @returns {'motion'|'contact'|'fire'|'generic'}
 */
function resolveZoneType(setting, name) {
  if (setting && setting !== 'auto' && TYPE_CAPS[setting]) return setting;
  return guessZoneType(name);
}

/**
 * Capability list for a concrete type (falls back to motion).
 * @param {string} type
 * @returns {string[]}
 */
function capsForType(type) {
  return TYPE_CAPS[type] || TYPE_CAPS.motion;
}

module.exports = {
  TYPE_CAPS,
  ZONE_TYPES,
  guessZoneType,
  resolveZoneType,
  capsForType,
};
