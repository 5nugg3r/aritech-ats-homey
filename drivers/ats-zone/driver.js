'use strict';

const Homey = require('homey');

/**
 * Default TCP port for the ATS automation/IP interface. Configurable on the
 * panel, so this is only a starting point in the pairing form.
 */
const DEFAULT_PORT = 32000;

/**
 * Driver for ATS zones. Each paired device represents one zone (detector) of a
 * panel and exposes it as a read-only sensor (motion / in-alarm / tamper).
 *
 * Zone devices share the same {@link PanelConnection} as the area devices of the
 * same panel (via the app's ConnectionManager), so adding zones does not open
 * extra sessions to the panel.
 */
class AtsZoneDriver extends Homey.Driver {
  async onInit() {
    this.log('ATS Zone driver initialized');
  }

  /**
   * Pairing:
   *  1. `connect` (custom view) collects connection details and emits `probe`.
   *  2. We connect once, validate credentials and enumerate zones.
   *  3. `list_devices` returns one device per zone for the user to select.
   *
   * @param {import('homey').Driver.PairSession} session
   */
  onPair(session) {
    /** @type {{ config: object, info: object, zones: Array }|null} */
    let discovered = null;

    session.setHandler('probe', async (data) => {
      const config = this._buildConfig(data);

      const app = this.homey.app;
      if (!app || !app.connections) {
        throw new Error('App is not ready yet, please try again');
      }

      this.log(`Pairing probe to ${config.host}:${config.port}…`);
      const result = await app.connections.probe(config);
      discovered = { config, info: result.info, zones: result.zones };

      this.log(
        `Probe OK: ${result.info.panelModel || 'panel'} "${result.info.panelName || '?'}", `
        + `${result.zones.length} zone(s)`,
      );

      return {
        panelName: result.info.panelName,
        panelModel: result.info.panelModel,
        zoneCount: result.zones.length,
      };
    });

    session.setHandler('list_devices', async () => {
      if (!discovered) return [];
      const { config, info, zones } = discovered;

      return zones.map((zone) => {
        const zoneName = zone.name || `Zone ${zone.number}`;
        return {
          name: zoneName,
          data: {
            id: `${info.serial || config.host}:zone:${zone.number}`,
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
            zoneNumber: zone.number,
            serial: info.serial || null,
          },
        };
      });
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

module.exports = AtsZoneDriver;
