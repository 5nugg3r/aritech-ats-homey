'use strict';

const Homey = require('homey');

/**
 * Aritech ATS app.
 *
 * The app-level class owns shared, app-wide resources. In a later phase this is
 * where the ConnectionManager (a single AritechClient + AritechMonitor per
 * physical panel, shared by all Area devices) will live.
 */
class AritechAtsApp extends Homey.App {
  async onInit() {
    this.log('Aritech ATS app has been initialized');
  }
}

module.exports = AritechAtsApp;
