'use strict';

const Homey = require('homey');
const ConnectionManager = require('./lib/connection-manager');

/**
 * Aritech ATS app.
 *
 * The app-level class owns shared, app-wide resources: the vendored (ESM)
 * protocol library and the ConnectionManager, which keeps a single
 * AritechClient + AritechMonitor per physical panel, shared by all Area devices.
 */
class AritechAtsApp extends Homey.App {
  async onInit() {
    // The Aritech protocol library is vendored as ES modules under lib/aritech/.
    // The Homey app itself is CommonJS, so we load the library lazily via a
    // dynamic import() and cache the result for the rest of the app to use.
    this._aritechLib = null;

    /** @type {ConnectionManager|null} */
    this.connections = null;

    try {
      const lib = await this.getAritechLib();
      this.log(
        'Aritech protocol library loaded:',
        Object.keys(lib).sort().join(', '),
      );

      this.connections = new ConnectionManager({
        lib,
        log: (...args) => this.log('[connections]', ...args),
        error: (...args) => this.error('[connections]', ...args),
      });
    } catch (err) {
      this.error('Failed to load Aritech protocol library:', err);
    }

    this.log('Aritech ATS app has been initialized');
  }

  /**
   * Clean up all panel connections when the app stops.
   * @returns {Promise<void>}
   */
  async onUninit() {
    if (this.connections) {
      await this.connections.destroyAll().catch((err) => this.error('destroyAll failed:', err));
      this.connections = null;
    }
  }

  /**
   * Lazily import and cache the vendored Aritech protocol library.
   *
   * @returns {Promise<object>} The library's module exports (AritechClient,
   *   AritechMonitor, AritechError, ErrorCodes and the *State classes).
   */
  async getAritechLib() {
    if (!this._aritechLib) {
      this._aritechLib = await import('./lib/aritech/index.js');
    }
    return this._aritechLib;
  }
}

module.exports = AritechAtsApp;
