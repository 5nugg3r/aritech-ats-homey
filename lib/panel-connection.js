'use strict';

const { EventEmitter } = require('events');

/**
 * Monitor events that are re-emitted from an AritechMonitor onto the
 * PanelConnection, so that Homey devices can subscribe to a single, stable
 * object even across reconnects (which replace the underlying client/monitor).
 */
const MONITOR_EVENTS = [
  'initialized',
  'areaChanged',
  'zoneChanged',
  'outputChanged',
  'triggerChanged',
  'doorChanged',
  'filterChanged',
  'error',
];

const DEFAULT_RECONNECT_BASE_MS = 2000;
const DEFAULT_RECONNECT_MAX_MS = 60000;

/**
 * A single, long-lived connection to one physical Aritech ATS panel.
 *
 * Owns exactly one AritechClient + AritechMonitor. All Area devices belonging
 * to the same panel share one PanelConnection (panels are strict about the
 * number of concurrent sessions per user). Handles the full connect/login
 * sequence, detects dropped sockets, and reconnects with exponential backoff.
 *
 * Lifecycle events emitted:
 * - 'connected'     ({ panelInfo })  after a successful (re)connect + monitor start
 * - 'disconnected'  ({ reason })     when an established connection is lost
 * - 'reconnecting'  ({ attempt, delayMs })
 * - 'closed'                          after an intentional destroy()
 * Plus all MONITOR_EVENTS, forwarded verbatim from the underlying monitor.
 *
 * @extends EventEmitter
 */
class PanelConnection extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.key - Stable identifier for this panel (host:port).
   * @param {object} opts.lib - The loaded aritech-js module exports.
   * @param {object} opts.config - Client config ({ host, port, encryptionKey, pin | username/password }).
   * @param {Function} [opts.log] - Logger for info messages.
   * @param {Function} [opts.error] - Logger for error messages.
   * @param {{ baseMs?: number, maxMs?: number }} [opts.reconnect] - Backoff tuning (mainly for tests).
   */
  constructor({ key, lib, config, log, error, reconnect } = {}) {
    super();
    this.key = key;
    this._lib = lib;
    this._config = config;
    this._log = typeof log === 'function' ? log : () => {};
    this._error = typeof error === 'function' ? error : () => {};
    this._reconnectBaseMs = reconnect?.baseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this._reconnectMaxMs = reconnect?.maxMs ?? DEFAULT_RECONNECT_MAX_MS;

    this._client = null;
    this._monitor = null;
    this._connected = false;
    this._intentionalClose = false;
    this._connecting = null; // in-flight connect promise (lock)
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._refCount = 0;
    this._monitorHandlers = null;
    this._socketWatchers = null;

    /** @type {object|null} Panel description, populated after connect. */
    this.panelInfo = null;
  }

  /** @returns {boolean} Whether the panel is currently connected and logged in. */
  get connected() {
    return this._connected;
  }

  /** @returns {object|null} The underlying AritechClient (may be null). */
  get client() {
    return this._client;
  }

  /** @returns {object|null} The underlying AritechMonitor (may be null). */
  get monitor() {
    return this._monitor;
  }

  /** @returns {number} Number of devices currently using this connection. */
  get refCount() {
    return this._refCount;
  }

  /** Increase the usage count. @returns {number} The new count. */
  retain() {
    this._refCount += 1;
    return this._refCount;
  }

  /** Decrease the usage count. @returns {number} The new count. */
  release() {
    this._refCount = Math.max(0, this._refCount - 1);
    return this._refCount;
  }

  /**
   * Ensure the connection is established, connecting if needed. Safe to call
   * concurrently; callers share the same in-flight connect.
   * @returns {Promise<void>}
   */
  async ensureConnected() {
    if (this._connected) return undefined;
    return this.connect();
  }

  /**
   * Connect and log in to the panel, then start monitoring. Concurrency-safe.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this._connecting) return this._connecting;
    this._connecting = this._doConnect().finally(() => {
      this._connecting = null;
    });
    return this._connecting;
  }

  /**
   * Perform the full connect → describe → key-exchange → login → monitor flow.
   * @private
   * @returns {Promise<void>}
   */
  async _doConnect() {
    const { AritechClient, AritechMonitor } = this._lib;
    this._intentionalClose = false;
    this._teardownClientOnly();

    const client = new AritechClient(this._config);
    this._client = client;

    this._log(`[${this.key}] connecting…`);
    await client.connect();
    await client.getDescription();
    await client.changeSessionKey();

    const ok = await client.login();
    if (!ok) {
      await this._safeClientDisconnect();
      this._client = null;
      throw new Error('Login rejected by panel (check user credentials and permissions)');
    }

    this.panelInfo = {
      panelName: client.panelName || null,
      panelModel: client.panelModel || null,
      firmwareVersion: client.firmwareVersion || null,
      protocolVersion: client.protocolVersion || null,
      serial: client.config?.serial || null,
    };

    this._attachSocketWatchers(client);

    const monitor = new AritechMonitor(client);
    this._monitor = monitor;
    this._forwardMonitorEvents(monitor);
    await monitor.start();

    this._connected = true;
    this._reconnectAttempts = 0;
    this._log(
      `[${this.key}] connected: ${this.panelInfo.panelModel || 'panel'} `
      + `"${this.panelInfo.panelName || '?'}" fw ${this.panelInfo.firmwareVersion || '?'}`,
    );
    this.emit('connected', { panelInfo: this.panelInfo });
  }

  // ==========================================================================
  // Control proxies (delegated to the client)
  // ==========================================================================

  /**
   * Arm one or more areas.
   * @param {number|number[]} area - Area number(s).
   * @param {'full'|'part1'|'part2'} [setType='full']
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async armArea(area, setType = 'full', force = false) {
    this._requireConnected();
    return this._client.armArea(area, setType, force);
  }

  /**
   * Disarm an area.
   * @param {number} area - Area number.
   * @returns {Promise<void>}
   */
  async disarmArea(area) {
    this._requireConnected();
    return this._client.disarmArea(area);
  }

  /** @returns {object} Map of area number → state (empty when not monitoring). */
  getAreaStates() {
    return this._monitor ? this._monitor.getAreaStates() : {};
  }

  /** @returns {object} Map of zone number → state (empty when not monitoring). */
  getZoneStates() {
    return this._monitor ? this._monitor.getZoneStates() : {};
  }

  /** @returns {Array<{number:number,name:string}>} Known areas. */
  getAreas() {
    return this._monitor?.areas ? [...this._monitor.areas] : [];
  }

  /** @returns {Array<{number:number,name:string}>} Known zones. */
  getZones() {
    return this._monitor?.zones ? [...this._monitor.zones] : [];
  }

  /**
   * Intentionally close the connection and stop all reconnect attempts.
   * @returns {Promise<void>}
   */
  async destroy() {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._detachSocketWatchers();
    this._detachMonitorHandlers();
    if (this._monitor) {
      try {
        this._monitor.stop();
      } catch (err) {
        this._error(`[${this.key}] monitor stop failed: ${err?.message || err}`);
      }
      this._monitor = null;
    }
    await this._safeClientDisconnect();
    this._client = null;
    this._connected = false;
    this.emit('closed');
    this.removeAllListeners();
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /** @private */
  _requireConnected() {
    if (!this._connected || !this._client) {
      throw new Error(`Panel ${this.key} is not connected`);
    }
  }

  /**
   * Watch the underlying socket so we can detect and recover from drops.
   * @private
   * @param {object} client
   */
  _attachSocketWatchers(client) {
    const socket = client.socket;
    if (!socket) return;

    // Disable the library's idle timeout; we rely on close/error + keep-alive.
    try {
      socket.setTimeout(0);
    } catch {
      // ignore
    }

    const onClose = () => this._handleDrop('socket closed');
    const onEnd = () => this._handleDrop('socket ended');
    const onError = (err) => {
      this._error(`[${this.key}] socket error: ${err?.message || err}`);
      // A 'close' event normally follows and triggers the actual reconnect.
    };

    socket.on('close', onClose);
    socket.on('end', onEnd);
    socket.on('error', onError);
    this._socketWatchers = { socket, onClose, onEnd, onError };
  }

  /** @private */
  _detachSocketWatchers() {
    if (!this._socketWatchers) return;
    const { socket, onClose, onEnd, onError } = this._socketWatchers;
    socket.removeListener('close', onClose);
    socket.removeListener('end', onEnd);
    socket.removeListener('error', onError);
    this._socketWatchers = null;
  }

  /**
   * Forward all monitor change events onto this connection.
   * @private
   * @param {object} monitor
   */
  _forwardMonitorEvents(monitor) {
    this._detachMonitorHandlers();
    const handlers = new Map();
    for (const event of MONITOR_EVENTS) {
      const handler = (payload) => this.emit(event, payload);
      monitor.on(event, handler);
      handlers.set(event, handler);
    }
    this._monitorHandlers = { monitor, handlers };
  }

  /** @private */
  _detachMonitorHandlers() {
    if (!this._monitorHandlers) return;
    const { monitor, handlers } = this._monitorHandlers;
    for (const [event, handler] of handlers) {
      monitor.removeListener(event, handler);
    }
    this._monitorHandlers = null;
  }

  /**
   * Handle an unexpected connection loss.
   * @private
   * @param {string} reason
   */
  _handleDrop(reason) {
    if (this._intentionalClose) return;
    if (!this._connected && !this._client) return;

    const wasConnected = this._connected;
    this._connected = false;
    this._detachSocketWatchers();

    this._log(`[${this.key}] connection lost (${reason})`);
    if (wasConnected) this.emit('disconnected', { reason });
    this._scheduleReconnect();
  }

  /**
   * Schedule a reconnect using exponential backoff with jitter.
   * @private
   */
  _scheduleReconnect() {
    if (this._intentionalClose) return;
    if (this._reconnectTimer) return;
    if (this._refCount <= 0) {
      this._log(`[${this.key}] not reconnecting: no devices are using this panel`);
      return;
    }

    const attempt = this._reconnectAttempts;
    this._reconnectAttempts += 1;
    const backoff = Math.min(this._reconnectMaxMs, this._reconnectBaseMs * 2 ** attempt);
    // Equal jitter: wait between 50% and 100% of the backoff, so retries from
    // multiple devices/panels spread out instead of hammering in lockstep.
    const wait = Math.round(backoff / 2 + Math.random() * (backoff / 2));

    this._log(`[${this.key}] reconnecting in ${Math.round(wait / 1000)}s (attempt ${attempt + 1})`);
    this.emit('reconnecting', { attempt: attempt + 1, delayMs: wait });

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect().catch((err) => {
        this._error(`[${this.key}] reconnect failed: ${err?.message || err}`);
        this._scheduleReconnect();
      });
    }, wait);
  }

  /**
   * Tear down the current client/monitor listeners without touching reconnect
   * state. Used before creating a fresh client on (re)connect.
   * @private
   */
  _teardownClientOnly() {
    this._detachSocketWatchers();
    this._detachMonitorHandlers();
    if (this._monitor) {
      try {
        this._monitor.stop();
      } catch {
        // ignore
      }
      this._monitor = null;
    }
  }

  /** @private */
  async _safeClientDisconnect() {
    if (!this._client) return;
    try {
      await this._client.disconnect();
    } catch (err) {
      this._error(`[${this.key}] disconnect failed: ${err?.message || err}`);
    }
  }

  /**
   * One-shot probe: connect, log in, read the area/zone lists, then disconnect.
   * Used during pairing to validate credentials and enumerate areas.
   *
   * Each protocol step is logged and, on failure, the thrown error is annotated
   * with the step name so the failing phase is visible in the app logs. This is
   * important because some panels reply with a `0xF0` frame (e.g. `F0 000002`)
   * that the underlying library treats as an error, while on these panels it is
   * often a keepalive / "no data" frame.
   *
   * @param {object} opts
   * @param {object} opts.lib - The loaded aritech-js module exports.
   * @param {object} opts.config - Client config.
   * @param {Function} [opts.log] - Optional logger for step progress.
   * @returns {Promise<{ info: object, areas: Array, zones: Array }>}
   */
  static async probe({ lib, config, log } = {}) {
    const info = typeof log === 'function' ? log : () => {};
    const { AritechClient, AritechMonitor } = lib;
    const client = new AritechClient(config);

    const step = async (name, fn) => {
      info(`probe: ${name}…`);
      try {
        return await fn();
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        throw new Error(`Failed during ${name}: ${msg}`);
      }
    };

    try {
      await step('connect', () => client.connect());
      await step('getDescription', () => client.getDescription());
      info(
        `probe: panel ${client.panelModel || '?'} "${client.panelName || '?'}" `
        + `fw ${client.firmwareVersion || '?'} proto ${client.protocolVersion || '?'}`,
      );
      await step('changeSessionKey', () => client.changeSessionKey());

      const ok = await step('login', () => client.login());
      if (!ok) {
        throw new Error('Login rejected by panel (check user credentials and permissions)');
      }

      const monitor = new AritechMonitor(client);
      await step('monitor.start', () => monitor.start());

      const areas = (monitor.areas || []).map((a) => ({ number: a.number, name: a.name }));
      const zones = (monitor.zones || []).map((z) => ({ number: z.number, name: z.name }));
      const panelInfo = {
        panelName: client.panelName || null,
        panelModel: client.panelModel || null,
        firmwareVersion: client.firmwareVersion || null,
        protocolVersion: client.protocolVersion || null,
        serial: client.config?.serial || null,
      };
      info(`probe: done — ${areas.length} area(s), ${zones.length} zone(s)`);

      try {
        monitor.stop();
      } catch {
        // ignore
      }

      return { info: panelInfo, areas, zones };
    } finally {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

module.exports = PanelConnection;
