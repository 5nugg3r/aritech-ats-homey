'use strict';

const Homey = require('homey');
const { DEFAULT_PORT, buildPanelConfig } = require('../../lib/panel-config');
const { isPrivateHost, requiresKeyReconfirmation } = require('../../lib/host-checks');

/**
 * Driver for ATS areas. Each paired device represents one area of a panel and
 * uses the native `homealarm_state` capability for arm/disarm.
 */
class AtsAreaDriver extends Homey.Driver {
  async onInit() {
    this.log('ATS Area driver initialized');
    this._registerFlowCards();
  }

  /**
   * Register Flow cards for zone events (device triggers), the zone-open
   * condition, and the area/zone actions. The `_true`/`_false` triggers for the
   * custom alarm capabilities are fired automatically by Homey.
   * @private
   */
  _registerFlowCards() {
    // Device trigger cards for zone events, fired from the device.
    this.zoneOpenedTrigger = this.homey.flow.getDeviceTriggerCard('zone_opened');
    this.zoneClosedTrigger = this.homey.flow.getDeviceTriggerCard('zone_closed');
    this.zoneAlarmTrigger = this.homey.flow.getDeviceTriggerCard('zone_alarm');
    this.zoneTamperTrigger = this.homey.flow.getDeviceTriggerCard('zone_tamper');
    this.zoneInhibitedTrigger = this.homey.flow.getDeviceTriggerCard('zone_inhibited');
    this.zoneUninhibitedTrigger = this.homey.flow.getDeviceTriggerCard('zone_uninhibited');
    this.exitDelayTrigger = this.homey.flow.getDeviceTriggerCard('area_exit_delay_started');
    this.entryDelayTrigger = this.homey.flow.getDeviceTriggerCard('area_entry_delay_started');
    this.exitDelayEndedTrigger = this.homey.flow.getDeviceTriggerCard('area_exit_delay_ended');
    this.entryDelayEndedTrigger = this.homey.flow.getDeviceTriggerCard('area_entry_delay_ended');

    // Condition: is a zone open?
    const zoneIsOpen = this.homey.flow.getConditionCard('zone_is_open');
    zoneIsOpen.registerRunListener(async (args) => args.device.isZoneOpen(Number(args.zone.number)));
    zoneIsOpen.registerArgumentAutocompleteListener('zone', async (query, args) => args.device.zoneAutocomplete(query));

    // Condition: is a zone bypassed?
    const zoneIsInhibited = this.homey.flow.getConditionCard('zone_is_inhibited');
    zoneIsInhibited.registerRunListener(async (args) => args.device.isZoneInhibited(Number(args.zone.number)));
    zoneIsInhibited.registerArgumentAutocompleteListener('zone', async (query, args) => args.device.zoneAutocomplete(query));

    // Condition: is the panel counting down an entry or exit delay?
    this.homey.flow.getConditionCard('area_in_delay')
      .registerRunListener(async (args) => args.device.isInEntryExitDelay());

    // Condition: can this area be armed right now?
    this.homey.flow.getConditionCard('area_is_ready_to_arm')
      .registerRunListener(async (args) => args.device.getCapabilityValue('ready_to_arm') === true);

    // Conditions: the two things that typically block arming.
    for (const [cardId, capability] of [['area_has_open_zones', 'zones_open'], ['area_has_zone_faults', 'zone_faults'], ['area_has_inhibited_zones', 'zones_inhibited']]) {
      this.homey.flow.getConditionCard(cardId)
        .registerRunListener(async (args) => args.device.getCapabilityValue(capability) === true);
    }

    // Actions: area arming variants.
    this.homey.flow.getActionCard('arm_night')
      .registerRunListener(async (args) => args.device.armNight());
    this.homey.flow.getActionCard('force_arm')
      .registerRunListener(async (args) => args.device.forceArm(args.mode));

    // Actions: zone inhibit / uninhibit, with a zone autocomplete argument.
    for (const [cardId, method] of [['inhibit_zone', 'inhibitZone'], ['uninhibit_zone', 'uninhibitZone']]) {
      const card = this.homey.flow.getActionCard(cardId);
      card.registerRunListener(async (args) => args.device[method](Number(args.zone.number)));
      card.registerArgumentAutocompleteListener('zone', async (query, args) => args.device.zoneAutocomplete(query));
    }
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
      const currentHost = device.getStoreValue('host');
      const newHost = String(data.host || '').trim() || currentHost;

      // Blank secret fields mean "keep the current value", which combined with a
      // new address would send the stored credentials to a different machine.
      if (requiresKeyReconfirmation(currentHost, newHost, data.encryptionKey)) {
        throw new Error(
          'You changed the panel address, so please re-enter the encryption key to confirm this is your panel.',
        );
      }
      if (!isPrivateHost(newHost)) {
        this.log(`Repair: ${newHost} is a public address; the ATS protocol is not meant to leave the local network`);
      }

      // Merge: a blank secret field means "keep the current value".
      const merged = {
        host: newHost,
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
    return buildPanelConfig(data);
  }
}

module.exports = AtsAreaDriver;
