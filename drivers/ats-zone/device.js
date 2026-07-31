'use strict';

const Homey = require('homey');

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

    // Ensure indicator capabilities exist on devices paired before they were
    // added to the driver.
    await this._ensureCapabilities();

    // Stable, bound handlers so we can detach them later.
    this._onConnected = this._handleConnected.bind(this);
    this._onDisconnected = this._handleDisconnected.bind(this);
    this._onZoneChanged = this._handleZoneChanged.bind(this);

    this.log(`ATS zone ${this._zoneNumber} init`);

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
    this.setCapabilityValue('alarm_motion', !!s.isActive).catch(this.error);
    this.setCapabilityValue('alarm_generic', !!s.isAlarming).catch(this.error);
    this.setCapabilityValue('alarm_tamper', !!s.isTampered).catch(this.error);
  }

  /** @private */
  _syncFromCurrentState() {
    if (!this._conn || !this._conn.getZoneStates) return;
    const entry = this._conn.getZoneStates()[this._zoneNumber];
    const s = entry && entry.state ? entry.state : entry;
    if (s) this._applyZoneState(s);
  }

  /**
   * Add capabilities that may be missing on devices paired with an older
   * version of this driver. Safe to call on every init.
   * @private
   */
  async _ensureCapabilities() {
    for (const cap of ['alarm_motion', 'alarm_generic', 'alarm_tamper']) {
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
