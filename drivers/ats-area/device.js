'use strict';

const Homey = require('homey');
const { usesDefaultPassword } = require('../../lib/panel-config');
const { ARM_CONFIRM_TIMEOUT_MS, unconfirmedArmOutcome } = require('../../lib/arm-confirmation');

/**
 * A single ATS area, exposed to Homey as a home alarm with the native
 * `homealarm_state` capability:
 *   - armed            → full set
 *   - partially_armed  → part set 1
 *   - disarmed         → disarm
 *
 * All area devices of the same panel share one PanelConnection (via the app's
 * ConnectionManager), which handles login, monitoring and reconnects.
 */
class AtsAreaDevice extends Homey.Device {
  async onInit() {
    this._conn = null;
    this._areaNumber = this.getStoreValue('areaNumber');
    this._lastObservedState = null;
    this._pendingArm = null;
    this._armConfirmTimer = null;

    // Ensure indicator capabilities exist on devices paired before they were
    // added to the driver.
    await this._ensureCapabilities();

    // Stable, bound handlers so we can detach them later.
    this._onConnected = this._handleConnected.bind(this);
    this._onDisconnected = this._handleDisconnected.bind(this);
    this._onAreaChanged = this._handleAreaChanged.bind(this);
    this._onZoneChanged = this._handleZoneChanged.bind(this);

    // Register the capability listener first, so arm/disarm always has a
    // handler even if the connection is still being established.
    this.registerCapabilityListener('homealarm_state', (value) => this._setArmState(value));
    this.log(`ATS area ${this._areaNumber} init: capability listener registered`);

    // Non-blocking: warn on the device card if the encryption key is weak.
    await this._checkEncryptionKeyStrength();

    await this.setUnavailable('Connecting to panel…').catch(this.error);

    try {
      await this._connect();
    } catch (err) {
      // Never let onInit reject: the device must stay initialised so the
      // capability listener remains registered and reconnects can recover it.
      this.error('onInit connect error:', err);
    }
  }

  /**
   * Heuristic weak-key check for the numeric ATS encryption key. Flags keys
   * that are trivially guessable: very low digit variety, a short repeating
   * block (e.g. "123123123…"), or a sequential run such as "012345…" or
   * "987654…" (with wraparound).
   * @private
   * @param {string} key - The numeric encryption key.
   * @returns {boolean} True when the key is considered weak.
   */
  _isWeakEncryptionKey(key) {
    if (!/^\d+$/.test(key)) return false; // Non-numeric keys are validated elsewhere.

    // Very low variety (all identical, or only two distinct digits).
    if (new Set(key.split('')).size <= 2) return true;

    // Short repeating block, e.g. "123123123…" or "0101…".
    for (let blockLen = 1; blockLen <= 4; blockLen++) {
      if (key.length % blockLen === 0) {
        const block = key.slice(0, blockLen);
        if (block.repeat(key.length / blockLen) === key) return true;
      }
    }

    // Sequential run ascending or descending, with wraparound ("…8901…").
    const isSequential = (step) => {
      for (let i = 1; i < key.length; i++) {
        const expected = (Number(key[i - 1]) + step + 10) % 10;
        if (Number(key[i]) !== expected) return false;
      }
      return true;
    };
    if (isSequential(1) || isSequential(-1)) return true;

    return false;
  }

  /**
   * Show a non-blocking warning on the device card when a credential is
   * trivially weak: an encryption key of repeated or sequential digits, or an
   * account still using the panel's factory default where the password equals
   * the username. Never blocks operation.
   * @private
   */
  async _checkEncryptionKeyStrength() {
    const key = String(this.getStoreValue('encryptionKey') || '');
    const warnings = [];

    if (key.length > 0 && this._isWeakEncryptionKey(key)) {
      warnings.push(
        'Weak encryption key: it is easy to guess (repeated or sequential digits). Set a stronger key in the panel and re-pair for better security.',
      );
    }
    if (usesDefaultPassword(this.getStoreValue('username'), this.getStoreValue('password'))) {
      warnings.push(
        'This account still uses the panel default, where the password equals the username. Set a distinct password in the panel and repair this device.',
      );
    }

    if (warnings.length > 0) {
      await this.setWarning(warnings.join(' ')).catch(this.error);
    } else {
      await this.unsetWarning().catch(this.error);
    }
  }

  /**
   * Build the AritechClient config from the device store.
   * @private
   * @returns {object}
   */
  _config() {
    const username = this.getStoreValue('username');
    const base = {
      host: this.getStoreValue('host'),
      port: this.getStoreValue('port'),
      encryptionKey: this.getStoreValue('encryptionKey'),
    };
    if (username) {
      return { ...base, username, password: this.getStoreValue('password') };
    }
    return { ...base, pin: this.getStoreValue('pin') };
  }

  /**
   * Acquire the shared connection and subscribe to its events.
   * @private
   */
  async _connect() {
    const app = this.homey.app;
    if (!app || !app.connections) {
      await this.setUnavailable('App not ready').catch(this.error);
      return;
    }

    const conn = app.connections.acquire(this._config());
    this._conn = conn;
    conn.on('connected', this._onConnected);
    conn.on('initialized', this._onConnected);
    conn.on('disconnected', this._onDisconnected);
    conn.on('areaChanged', this._onAreaChanged);
    conn.on('zoneChanged', this._onZoneChanged);

    try {
      await conn.ensureConnected();
      if (conn.connected) {
        await this.setAvailable().catch(this.error);
        this._syncFromCurrentState();
      }
    } catch (err) {
      this.error('Connect failed:', err);
      await this.setUnavailable(err.message || 'Connection failed').catch(this.error);
    }
  }

  /** @private */
  _handleConnected() {
    this.setAvailable().catch(this.error);
    this._syncFromCurrentState();
  }

  /** @private */
  _handleDisconnected() {
    this.setUnavailable('Panel disconnected, reconnecting…').catch(this.error);
  }

  /**
   * @private
   * @param {{ id:number, newData:object }} event
   */
  _handleAreaChanged(event) {
    if (event.id !== this._areaNumber) return;
    this._applyAreaState(event.newData);
  }

  /**
   * Fire zone Flow triggers on state-change edges. Scoped to this area when the
   * zone→area mapping is known.
   * @private
   * @param {{ id:number, name?:string, oldData?:object, newData?:object }} event
   */
  _handleZoneChanged(event) {
    const zoneNum = event.id;
    // The ZoneState lives under `.state` (event = { id, name, oldData, newData }
    // where newData = { zone, state: ZoneState, rawHex }).
    const oldS = (event.oldData && event.oldData.state) || {};
    const newS = (event.newData && event.newData.state) || {};

    // Debug: one line per zone change (edge-triggered), gated behind the
    // device's 'debug_logging' setting.
    this._dbg(`zone ${zoneNum} "${event.name || ''}" changed`, {
      isActive: newS.isActive,
      wasActive: oldS.isActive,
      isAlarming: newS.isAlarming,
      isTampered: newS.isTampered,
      isInhibited: newS.isInhibited,
      isSet: newS.isSet,
      hasFault: newS.hasFault,
    });

    const areas = this._conn && this._conn.getZoneAreas ? this._conn.getZoneAreas(zoneNum) : null;
    if (areas && areas.length > 0 && !areas.includes(this._areaNumber)) return;

    const tokens = { zone: zoneNum, zone_name: event.name || `Zone ${zoneNum}` };
    const d = this.driver;

    if (newS.isActive && !oldS.isActive) d.zoneOpenedTrigger.trigger(this, tokens).catch(this.error);
    if (!newS.isActive && oldS.isActive) d.zoneClosedTrigger.trigger(this, tokens).catch(this.error);
    if (newS.isAlarming && !oldS.isAlarming) d.zoneAlarmTrigger.trigger(this, tokens).catch(this.error);
    if (newS.isTampered && !oldS.isTampered) d.zoneTamperTrigger.trigger(this, tokens).catch(this.error);
  }

  /**
   * Add capabilities that may be missing on devices paired with an older
   * version of this driver. Safe to call on every init.
   * @private
   */
  async _ensureCapabilities() {
    for (const cap of ['alarm_armed', 'ready_to_arm', 'zones_open', 'zone_faults', 'zones_inhibited', 'zones_isolated', 'alarm_generic', 'alarm_fire', 'alarm_tamper', 'alarm_panic', 'alarm_medical', 'alarm_duress', 'siren_internal', 'siren_external', 'strobe_active', 'buzzer_active']) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch(this.error);
      }
    }
  }

  /**
   * Log only when the device's 'debug_logging' setting is enabled.
   * @private
   */
  _dbg(...args) {
    if (this.getSettings().debug_logging) this.log(...args);
  }

  /** @private */
  _syncFromCurrentState() {
    if (!this._conn) return;
    const state = this._conn.getAreaStates()[this._areaNumber];
    if (state) this._applyAreaState(state);
  }

  /**
   * @private
   * @param {{ area:number, state:object, rawHex:string }} entry - Area state
   *   entry from the monitor. The AreaState flags live under `.state`.
   */
  _applyAreaState(entry) {
    const a = entry && entry.state ? entry.state : null;
    const value = this._toHomealarmState(a);
    this._dbg(
      `area ${this._areaNumber} state → ${value}`,
      a
        ? {
          isFullSet: a.isFullSet,
          isPartiallySet: a.isPartiallySet,
          isPartiallySet2: a.isPartiallySet2,
          isUnset: a.isUnset,
          isExiting: a.isExiting,
          isEntering: a.isEntering,
          isAlarming: a.isAlarming,
        }
        : { note: 'no .state on entry', keys: entry ? Object.keys(entry) : null },
    );
    if (value) {
      this._noteObservedState(value);
      this.setCapabilityValue('homealarm_state', value).catch(this.error);
    }
    if (a) {
      // Status indicator: armed when fully or partially set (enum capabilities
      // cannot be device indicators, so mirror it to a boolean).
      const armed = value === 'armed' || value === 'partially_armed';
      this.setCapabilityValue('alarm_armed', armed).catch(this.error);
      // Panel reports whether the area can be armed right now (no active zones
      // or faults blocking it).
      this.setCapabilityValue('ready_to_arm', !!a.isReadyToArm).catch(this.error);
      // The two conditions that usually explain why an area is not ready to arm.
      this.setCapabilityValue('zones_open', !!a.hasActiveZones).catch(this.error);
      this.setCapabilityValue('zone_faults', !!a.hasZoneFaults).catch(this.error);
      // Zones the panel is deliberately ignoring while armed.
      this.setCapabilityValue('zones_inhibited', !!a.hasInhibitedZones).catch(this.error);
      this.setCapabilityValue('zones_isolated', !!a.hasIsolatedZones).catch(this.error);
      // Warning indicator: only true when the area is actually in alarm.
      this.setCapabilityValue('alarm_generic', !!a.isAlarming).catch(this.error);
      // Specific alarm types reported for this area.
      this.setCapabilityValue('alarm_fire', !!a.hasFire).catch(this.error);
      this.setCapabilityValue('alarm_tamper', !!a.isTampered).catch(this.error);
      this.setCapabilityValue('alarm_panic', !!a.hasPanic).catch(this.error);
      this.setCapabilityValue('alarm_medical', !!a.hasMedical).catch(this.error);
      this.setCapabilityValue('alarm_duress', !!a.hasDuress).catch(this.error);
      // Audible and visual signalling driven by the panel.
      this.setCapabilityValue('siren_internal', !!a.isInternalSiren).catch(this.error);
      this.setCapabilityValue('siren_external', !!a.isExternalSiren).catch(this.error);
      this.setCapabilityValue('strobe_active', !!a.isStrobeActive).catch(this.error);
      this.setCapabilityValue('buzzer_active', !!a.isBuzzerActive).catch(this.error);
    }
  }

  /**
   * Map an area state to a Homey `homealarm_state` value.
   * @private
   * @param {object} a - AreaState flags.
   * @returns {('armed'|'partially_armed'|'disarmed'|null)}
   */
  _toHomealarmState(a) {
    if (!a) return null;
    if (a.isFullSet) return 'armed';
    if (a.isPartiallySet || a.isPartiallySet2) return 'partially_armed';
    // Exit or entry delay in progress: the area is committing to / holding an
    // armed state, so don't fall back to "disarmed" (which made the tile spring
    // back during the exit countdown).
    if (a.isExiting || a.isEntering) return 'armed';
    return 'disarmed';
  }

  /**
   * Handle a requested arm/disarm from Homey.
   * @private
   * @param {'armed'|'partially_armed'|'disarmed'} value
   * @returns {Promise<void>}
   */
  async _setArmState(value) {
    if (!this._conn) throw new Error('Not connected to panel');

    try {
      switch (value) {
        case 'armed':
          await this._conn.armArea(this._areaNumber, 'full');
          break;
        case 'partially_armed':
          await this._conn.armArea(this._areaNumber, 'part1');
          break;
        case 'disarmed':
          await this._conn.disarmArea(this._areaNumber);
          break;
        default:
          throw new Error(`Unsupported alarm state: ${value}`);
      }
    } catch (err) {
      // Surface a readable reason in the Homey UI. The client already maps
      // panel error codes to friendly text; prefix which action failed so the
      // user knows what the panel rejected (e.g. part set on this area).
      const action = value === 'partially_armed'
        ? 'part set'
        : value === 'armed' ? 'arm' : 'disarm';
      this.error(`${action} area ${this._areaNumber} failed:`, err);
      throw new Error(`Could not ${action} area ${this._areaNumber}: ${err.message}`);
    }

    // The panel accepted the command (arming may still be running its exit
    // countdown). Reflect the requested state immediately so the tile does not
    // spring back; subsequent areaChanged events keep it in sync afterwards.
    await this.setCapabilityValue('homealarm_state', value).catch(this.error);
    this._awaitArmConfirmation(value);
  }

  /**
   * Record a state actually reported by the panel, and treat it as confirmation
   * of a pending request.
   * @private
   * @param {string} value
   */
  _noteObservedState(value) {
    this._lastObservedState = value;
    if (this._pendingArm === value) this._clearArmConfirmation();
  }

  /**
   * Start distrusting an optimistically shown state: if the panel has not
   * confirmed it before the timeout, fall back to the last observed state and
   * warn on the device card.
   * @private
   * @param {string} value
   */
  _awaitArmConfirmation(value) {
    this._clearArmConfirmation();
    this._pendingArm = value;
    this._armConfirmTimer = this.homey.setTimeout(() => {
      this._armConfirmTimer = null;
      const outcome = unconfirmedArmOutcome(this._pendingArm, this._lastObservedState);
      this._pendingArm = null;
      if (!outcome) return;

      this.error(`Area ${this._areaNumber}: ${outcome.message}`);
      if (outcome.revertTo) {
        this.setCapabilityValue('homealarm_state', outcome.revertTo).catch(this.error);
      }
      this.setWarning(outcome.message).catch(this.error);
    }, ARM_CONFIRM_TIMEOUT_MS);
  }

  /** @private */
  _clearArmConfirmation() {
    if (this._armConfirmTimer) {
      this.homey.clearTimeout(this._armConfirmTimer);
      this._armConfirmTimer = null;
    }
    this._pendingArm = null;
  }

  async onUninit() {
    await this._release();
  }

  async onDeleted() {
    await this._release();
  }

  // ==========================================================================
  // Flow card helpers (called by the driver's run/autocomplete listeners)
  // ==========================================================================

  /** Arm this area in night / part set 2 mode ('arm_night' action). */
  async armNight() {
    if (!this._conn) throw new Error('Not connected to panel');
    await this._conn.armArea(this._areaNumber, 'part2');
  }

  /**
   * Force-arm this area in the given mode ('force_arm' action).
   * @param {'full'|'part1'|'part2'} mode
   */
  async forceArm(mode) {
    if (!this._conn) throw new Error('Not connected to panel');
    const setType = mode === 'part1' || mode === 'part2' ? mode : 'full';
    await this._conn.armArea(this._areaNumber, setType, true);
  }

  /** Inhibit (bypass) a zone ('inhibit_zone' action). @param {number} zoneNum */
  async inhibitZone(zoneNum) {
    if (!this._conn) throw new Error('Not connected to panel');
    await this._conn.inhibitZone(zoneNum);
  }

  /** Un-inhibit (restore) a zone ('uninhibit_zone' action). @param {number} zoneNum */
  async uninhibitZone(zoneNum) {
    if (!this._conn) throw new Error('Not connected to panel');
    await this._conn.uninhibitZone(zoneNum);
  }

  /**
   * Whether a zone is currently open/active ('zone_is_open' condition).
   * @param {number} zoneNum
   * @returns {boolean}
   */
  isZoneOpen(zoneNum) {
    const map = this._conn && this._conn.getZoneStates ? this._conn.getZoneStates() : {};
    const entry = map[zoneNum];
    const zs = entry && entry.state ? entry.state : entry;
    return !!(zs && zs.isActive);
  }

  /**
   * Autocomplete the panel's zones for Flow arguments.
   * @param {string} query
   * @returns {Array<{name:string, description:string, number:number}>}
   */
  zoneAutocomplete(query) {
    const zones = this._conn && this._conn.getZones ? this._conn.getZones() : [];
    const q = String(query || '').toLowerCase();
    return zones
      .filter((z) => !q || `${z.number}`.includes(q) || (z.name || '').toLowerCase().includes(q))
      .map((z) => ({ name: z.name || `Zone ${z.number}`, description: `Zone ${z.number}`, number: z.number }));
  }

  /**
   * Apply a new connection configuration (from the repair flow) and reconnect.
   * Releases the current shared connection under the OLD store values first,
   * then persists the new values and reconnects with them.
   * @param {object} config - Client config from the driver's _buildConfig.
   * @returns {Promise<void>}
   */
  async applyNewConfig(config) {
    // Release the shared connection under the current (old) store values first.
    await this._release();

    await this.setStoreValue('host', config.host);
    await this.setStoreValue('port', config.port);
    await this.setStoreValue('encryptionKey', config.encryptionKey);
    await this.setStoreValue('pin', config.pin ?? null);
    await this.setStoreValue('username', config.username ?? null);
    await this.setStoreValue('password', config.password ?? null);

    // Re-evaluate the weak-key warning and reconnect with the new config.
    await this._checkEncryptionKeyStrength();
    await this.setUnavailable('Reconnecting to panel…').catch(this.error);
    await this._connect();
  }

  /**
   * Detach event handlers and release the shared connection.
   * @private
   */
  async _release() {
    this._clearArmConfirmation();
    if (this._conn) {
      this._conn.removeListener('connected', this._onConnected);
      this._conn.removeListener('initialized', this._onConnected);
      this._conn.removeListener('disconnected', this._onDisconnected);
      this._conn.removeListener('areaChanged', this._onAreaChanged);
      this._conn.removeListener('zoneChanged', this._onZoneChanged);
      this._conn = null;
    }
    const app = this.homey.app;
    if (app && app.connections) {
      await app.connections.release(this._config()).catch(this.error);
    }
  }
}

module.exports = AtsAreaDevice;
