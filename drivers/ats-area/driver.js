'use strict';

const Homey = require('homey');

/**
 * Default TCP port for the ATS automation/IP interface. This is configurable on
 * the panel, so it is only a starting point in the pairing form.
 */
const DEFAULT_PORT = 32000;

/**
 * Driver for ATS areas. Each paired device represents one area of a panel and
 * uses the native `homealarm_state` capability for arm/disarm.
 */
class AtsAreaDriver extends Homey.Driver {
  async onInit() {
    this.log('ATS Area driver initialized');
  }

  /**
   * Pairing:
   *  1. `connect` (custom view) collects connection details and emits `probe`.
   *  2. We connect once, validate credentials and enumerate areas.
   *  3. `list_devices` returns one device per area for the user to select.
   *
   * @param {import('homey').Driver.PairSession} session
   */
  onPair(session) {
    /** @type {{ config: object, info: object, areas: Array }|null} */
    let discovered = null;

    session.setHandler('probe', async (data) => {
      const config = this._buildConfig(data);

      const app = this.homey.app;
      if (!app || !app.connections) {
        throw new Error('App is not ready yet, please try again');
      }

      this.log(`Pairing probe to ${config.host}:${config.port}…`);
      const result = await app.connections.probe(config);
      discovered = { config, info: result.info, areas: result.areas };

      this.log(
        `Probe OK: ${result.info.panelModel || 'panel'} "${result.info.panelName || '?'}", `
        + `${result.areas.length} area(s)`,
      );

      return {
        panelName: result.info.panelName,
        panelModel: result.info.panelModel,
        areaCount: result.areas.length,
      };
    });

    session.setHandler('list_devices', async () => {
      if (!discovered) return [];
      const { config, info, areas } = discovered;
      const multi = areas.length > 1;

      return areas.map((area) => {
        const areaName = area.name || `Area ${area.number}`;
        return {
          name: multi ? `${info.panelName || 'ATS'} – ${areaName}` : areaName,
          data: {
            id: `${info.serial || config.host}:area:${area.number}`,
          },
          // Credentials are kept in the device store (not shown in the UI),
          // never in user-visible settings.
          store: {
            host: config.host,
            port: config.port,
            encryptionKey: config.encryptionKey,
            pin: config.pin || null,
            username: config.username || null,
            password: config.password || null,
            areaNumber: area.number,
            serial: info.serial || null,
          },
        };
      });
    });
  }

  /**
   * Repair: let the user update connection details (e.g. after the panel's IP
   * address changed) without deleting and re-adding the device. Secret fields
   * left blank keep their current stored value. On success the device is
   * reconnected with the new configuration.
   *
   * @param {import('homey').Driver.PairSession} session
   * @param {import('homey').Device} device
   */
  onRepair(session, device) {
    const currentConnection = () => ({
      host: device.getStoreValue('host') || '',
      port: device.getStoreValue('port') || DEFAULT_PORT,
      username: device.getStoreValue('username') || '',
    });

    // The repair view does not reliably receive the global onHomeyReady
    // callback, so it reads the current values two ways: it listens for this
    // push (sent when the view is shown) and also requests them via
    // 'getConnection'.
    session.setHandler('showView', async (viewId) => {
      if (viewId === 'repair') {
        session.emit('connection', currentConnection()).catch(() => {});
      }
    });

    session.setHandler('getConnection', async () => currentConnection());

    session.setHandler('saveConnection', async (data) => {
      // Merge: a blank secret field means "keep the current value".
      const merged = {
        host: String(data.host || '').trim() || device.getStoreValue('host'),
        port: data.port,
        encryptionKey: String(data.encryptionKey || '').trim() || device.getStoreValue('encryptionKey') || '',
        pin: String(data.pin || '').trim() || device.getStoreValue('pin') || '',
        username: String(data.username || '').trim() || device.getStoreValue('username') || '',
        password: String(data.password || '').trim() || device.getStoreValue('password') || '',
      };

      const config = this._buildConfig(merged);

      const app = this.homey.app;
      if (!app || !app.connections) {
        throw new Error('App is not ready yet, please try again');
      }

      // Validate reachability + credentials before persisting anything.
      await app.connections.probe(config);

      // Persist and reconnect with the new configuration.
      await device.applyNewConfig(config);
      return true;
    });
  }

  /**
   * Validate and normalise the connection form into an AritechClient config.
   * @private
   * @param {object} data - Raw form fields from the `connect` view.
   * @returns {object} Client config ({ host, port, encryptionKey, pin | username/password }).
   */
  _buildConfig(data = {}) {
    const host = String(data.host || '').trim();
    const port = Number.parseInt(data.port, 10) || DEFAULT_PORT;
    const encryptionKey = String(data.encryptionKey || '').trim();
    const pin = String(data.pin || '').trim();
    const username = String(data.username || '').trim();
    const password = String(data.password || '').trim();

    if (!host) {
      throw new Error('Host / IP address is required');
    }
    if (!/^\d+$/.test(encryptionKey) || (encryptionKey.length !== 24 && encryptionKey.length !== 48)) {
      throw new Error('Encryption key must be 24 digits (x500) or 48 digits (x700)');
    }
    if (!username && !pin) {
      throw new Error('Enter a PIN (x500) or a username and password (x700)');
    }

    const config = { host, port, encryptionKey };
    if (username) {
      config.username = username;
      config.password = password || username; // panel default: password = username
    } else {
      config.pin = pin;
    }
    return config;
  }
}

module.exports = AtsAreaDriver;
