'use strict';

const Homey = require('homey');
const { resolveZoneType, capsForType } = require('../../lib/zone-type');

/**
 * A single ATS zone (detector), exposed to Homey as a read-only sensor:
 *   - alarm_motion   ← zone active/open (state.isActive)
 *   - alarm_generic  ← zone in alarm    (state.isAlarming)
 *   - alarm_tamper   ← zone tampered    (state.isTampered)
 *
 * All zone (and area) devices of the same panel share one PanelConnection (via
 * the app's ConnectionManager), which handles login, monitoring and reconnects.
 * This is a Phase A (read-only) device; bypass/inhibit control is added later.
 */
class AtsZoneDevice extends Homey.Device {
  async onInit() {
    this._conn = null;
    this._zoneNumber = this.getStoreValue('zoneNumber');

    // Resolve the sensor type and make sure the capability set matches it
    // (also migrates devices paired before the type setting existed).
    this._type = resolveZoneType(this.getSetting('sensor_type'), this.getName());
    await this._applyType(this._type);

    // Stable, bound handlers so we can detach them later.
    this._onConnected = this._handleConnected.bind(this);
    this._onDisconnected = this._handleDisconnected.bind(this);
    this._onZoneChanged = this._handleZoneChanged.bind(this);

    this.log(`ATS zone ${this._zoneNumber} init (type: ${this._type})`);

    await this.setUnavailable('Connecting to panel…').catch(this.error);

    try {
      await this._connect();
    } catch (err) {
      // Never let onInit reject: the device must stay initialised so reconnects
      // can recover it.
      this.error('onInit connect error:', err);
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
   * Update this zone's capabilities from a zoneChanged event.
   * @private
   * @param {{ id:number, name?:string, newData?:object }} event
   */
  _handleZoneChanged(event) {
    if (event.id !== this._zoneNumber) return;
    // The ZoneState lives under `.state` (newData = { zone, state, rawHex }).
    const s = (event.newData && event.newData.state) || {};
    this._applyZoneState(s);
  }

  /**
   * Map a ZoneState onto the device's capabilities according to its type.
   * @private
   * @param {object} s - ZoneState flags.
   */
  _applyZoneState(s) {
    if (!s) return;
    this._dbg(`zone ${this._zoneNumber} state`, {
      isActive: s.isActive,
      isAlarming: s.isAlarming,
      isTampered: s.isTampered,
      isInhibited: s.isInhibited,
      hasFault: s.hasFault,
    });

    const set = (cap, value) => {
      if (this.hasCapability(cap)) this.setCapabilityValue(cap, value).catch(this.error);
    };

    set('alarm_tamper', !!s.isTampered);

    switch (this._type) {
      case 'contact':
        set('alarm_contact', !!s.isActive);
        set('alarm_generic', !!s.isAlarming);
        break;
      case 'fire':
        set('alarm_fire', !!(s.isActive || s.isAlarming));
        break;
      case 'generic':
        set('alarm_generic', !!(s.isActive || s.isAlarming));
        break;
      case 'motion':
      default:
        set('alarm_motion', !!s.isActive);
        set('alarm_generic', !!s.isAlarming);
        break;
    }
  }

  /** @private */
  _syncFromCurrentState() {
    if (!this._conn || !this._conn.getZoneStates) return;
    const entry = this._conn.getZoneStates()[this._zoneNumber];
    const s = entry && entry.state ? entry.state : entry;
    if (s) this._applyZoneState(s);
  }

  /**
   * Reconcile the device's capabilities to match the given sensor type: remove
   * capabilities that no longer apply and add the ones that do (in order, so the
   * primary indicator stays first). Safe to call repeatedly.
   * @private
   * @param {'motion'|'contact'|'fire'|'generic'} type
   */
  async _applyType(type) {
    const desired = capsForType(type);
    for (const cap of this.getCapabilities()) {
      if (!desired.includes(cap)) {
        await this.removeCapability(cap).catch(this.error);
      }
    }
    for (const cap of desired) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch(this.error);
      }
    }
    this._type = type;
  }

  /**
   * React to setting changes: when the sensor type changes, re-map the
   * capabilities and re-apply the current zone state.
   * @param {{ newSettings:object, changedKeys:string[] }} opts
   * @returns {Promise<void>}
   */
  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('sensor_type')) {
      const type = resolveZoneType(newSettings.sensor_type, this.getName());
      await this._applyType(type);
      this._syncFromCurrentState();
    }
  }

  /**
   * Log only when the device's 'debug_logging' setting is enabled.
   * @private
   */
  _dbg(...args) {
    if (this.getSettings().debug_logging) this.log(...args);
  }

  async onUninit() {
    await this._release();
  }

  async onDeleted() {
    await this._release();
  }

  /**
   * Detach event handlers and release the shared connection.
   * @private
   */
  async _release() {
    if (this._conn) {
      this._conn.removeListener('connected', this._onConnected);
      this._conn.removeListener('initialized', this._onConnected);
      this._conn.removeListener('disconnected', this._onDisconnected);
      this._conn.removeListener('zoneChanged', this._onZoneChanged);
      this._conn = null;
    }
    const app = this.homey.app;
    if (app && app.connections) {
      await app.connections.release(this._config()).catch(this.error);
    }
  }
}

module.exports = AtsZoneDevice;
