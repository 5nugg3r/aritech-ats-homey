'use strict';

const Homey = require('homey');
const { guessZoneType, capsForType } = require('../../lib/zone-type');
const { buildPanelConfig } = require('../../lib/panel-config');

/**
 * Per-type tile icons (motion/generic use the driver's default icon.svg). Set
 * at pairing from the guessed type. Paths are relative to the driver's
 * `assets/` folder, and the tile icon is fixed after pairing.
 * @type {Record<string, string>}
 */
const ZONE_ICONS = {
  contact: '/contact.svg',
  fire: '/fire.svg',
};

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
    this.zoneBypassedTrigger = this.homey.flow.getDeviceTriggerCard('zone_bypassed');
    this.zoneRestoredTrigger = this.homey.flow.getDeviceTriggerCard('zone_restored');

    this.homey.flow.getConditionCard('zone_is_bypassed')
      .registerRunListener(async (args) => args.device.getCapabilityValue('zone_active') === false);

    this.homey.flow.getActionCard('zone_bypass')
      .registerRunListener(async (args) => args.device.setBypass(true));
    this.homey.flow.getActionCard('zone_restore')
      .registerRunListener(async (args) => args.device.setBypass(false));

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
        // The panel does not report a zone's type; default it from the name and
        // give the device the matching capability set (user-overridable later
        // via the 'sensor_type' setting).
        const type = guessZoneType(zoneName);
        const device = {
          name: zoneName,
          data: {
            id: `${info.serial || config.host}:zone:${zone.number}`,
          },
          capabilities: capsForType(type),
          settings: {
            sensor_type: type,
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
        if (ZONE_ICONS[type]) device.icon = ZONE_ICONS[type];
        return device;
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
    return buildPanelConfig(data);
  }
}

module.exports = AtsZoneDriver;
