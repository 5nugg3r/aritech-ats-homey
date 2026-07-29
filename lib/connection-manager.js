'use strict';

const PanelConnection = require('./panel-connection');

/**
 * App-level registry of panel connections.
 *
 * Ensures that all devices belonging to the same physical panel (identified by
 * host:port) share a single {@link PanelConnection}. Uses reference counting so
 * a panel connection is torn down only once the last device stops using it.
 */
class ConnectionManager {
  /**
   * @param {object} opts
   * @param {object} opts.lib - The loaded aritech-js module exports.
   * @param {Function} [opts.log] - Logger for info messages.
   * @param {Function} [opts.error] - Logger for error messages.
   * @param {{ baseMs?: number, maxMs?: number }} [opts.reconnect] - Backoff tuning.
   */
  constructor({ lib, log, error, reconnect } = {}) {
    this._lib = lib;
    this._log = typeof log === 'function' ? log : () => {};
    this._error = typeof error === 'function' ? error : () => {};
    this._reconnect = reconnect;
    /** @type {Map<string, PanelConnection>} */
    this._connections = new Map();
  }

  /**
   * Stable key for a panel config.
   * @param {object} config - Must contain host and port.
   * @returns {string}
   */
  static keyFor(config) {
    return `${config.host}:${config.port}`;
  }

  /**
   * Get (creating if needed) the shared PanelConnection for a config. Does not
   * change the reference count or connect.
   * @param {object} config
   * @returns {PanelConnection}
   */
  get(config) {
    const key = ConnectionManager.keyFor(config);
    let conn = this._connections.get(key);
    if (!conn) {
      conn = new PanelConnection({
        key,
        lib: this._lib,
        config,
        log: this._log,
        error: this._error,
        reconnect: this._reconnect,
      });
      this._connections.set(key, conn);
    }
    return conn;
  }

  /**
   * Acquire the shared connection for a device: gets it and increments the
   * reference count. The caller is responsible for calling {@link connect} /
   * {@link ensureConnected} and, when done, {@link release}.
   * @param {object} config
   * @returns {PanelConnection}
   */
  acquire(config) {
    const conn = this.get(config);
    conn.retain();
    return conn;
  }

  /**
   * Release a device's hold on a connection. When the last user releases it,
   * the connection is destroyed and removed from the registry.
   * @param {object} config
   * @returns {Promise<void>}
   */
  async release(config) {
    const key = ConnectionManager.keyFor(config);
    const conn = this._connections.get(key);
    if (!conn) return;

    const remaining = conn.release();
    if (remaining <= 0) {
      this._connections.delete(key);
      await conn.destroy();
    }
  }

  /**
   * One-shot probe for pairing: connect, log in and enumerate areas/zones.
   * Does not create or retain a persistent connection.
   * @param {object} config
   * @returns {Promise<{ info: object, areas: Array, zones: Array }>}
   */
  probe(config) {
    return PanelConnection.probe({ lib: this._lib, config, log: this._log });
  }

  /**
   * Destroy all connections (call on app shutdown).
   * @returns {Promise<void>}
   */
  async destroyAll() {
    const conns = [...this._connections.values()];
    this._connections.clear();
    await Promise.all(conns.map((c) => c.destroy().catch(() => {})));
  }
}

module.exports = ConnectionManager;
