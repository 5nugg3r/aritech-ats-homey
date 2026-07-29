---
name: homey-app-development
description: "Build, debug, and extend Homey Apps (Athom) with the Apps SDK v3 / Homey Compose. USE WHEN: working on a Homey app — drivers & devices, pairing or repairing flows, custom pairing/repair views, device settings (onSettings), capabilities, Flow cards, the app manifest / .homeycompose layout, the Homey CLI (run/install/validate/version), or diagnosing why a pairing/repair view shows 'unknown_error_getting_file', why a view does not prefill, or why settings/flow changes are ignored. Covers the file layout and gotchas that are easy to get wrong. DO NOT USE FOR: Zigbee/Z-Wave stack internals or non-Homey Node.js apps."
license: Reference notes distilled from https://apps.developer.homey.app (official Homey Apps SDK docs).
---

# Homey App Development (Apps SDK v3 / Homey Compose)

Authoritative, high-signal reference for building Homey apps. When a detail is not
covered here, fetch the matching `.md` page from the docs index in the last
section — every page is available as Markdown by appending `.md` to its URL.

## Golden rules & verified gotchas

These are the things that are easy to get wrong (some learned the hard way):

- **Custom PAIRING view HTML** lives in `drivers/<driverId>/pair/<viewId>.html`.
- **Custom REPAIR view HTML** lives in `drivers/<driverId>/repair/<viewId>.html`
  — a separate `repair/` folder, NOT `pair/`. Putting it in `pair/` makes Homey
  fetch `.../drivers/<id>/repair/<viewId>.html` → **404 → `unknown_error_getting_file`**.
- **Repair views may not fire `onHomeyReady`** (works for pair views). The script
  still runs and `Homey` is available globally — bootstrap off the global with a
  poll instead of relying on the callback (see Custom views section).
- **Device settings** are canonically defined in
  `drivers/<driverId>/driver.settings.compose.json` (a top-level JSON array).
  A `settings` array inside `driver.compose.json` is also accepted by Homey
  Compose, but the dedicated file is the documented location.
- `app.json` is **generated** by Homey Compose from `.homeycompose/` and the
  per-driver `driver.compose.json` / `driver.*.compose.json` files. Edit the
  compose sources, never hand-edit `app.json` (it is overwritten on build).
- `homey app run` runs in **development mode** and **uninstalls the app on
  Ctrl+C**. Devices added during a run are temporary. Use `homey app install`
  for a persistent install (there is **no `homey app uninstall` CLI command** —
  remove an installed app via the mobile app or Developer Tools).
- `setSettings()` called from code does **NOT** trigger `onSettings()`.
- Setting `id` prefixes are reserved: `homey:`, `zw_`, `zb_`, `mtr_`,
  `thread_`, `zone_`, `energy_`, `satellite_mode_`, `homekit_`.
- Validate often: `homey app validate --level debug` during development,
  `--level publish` / `--level verified` before shipping.

## Project structure (Homey Compose)

```
app.json                      # GENERATED — do not edit by hand
.homeycompose/
  app.json                    # app-level manifest source (id, version, name, …)
  flow/<trigger|condition|action>/<id>.json
  discovery/<id>.json
drivers/<driverId>/
  driver.compose.json         # driver manifest: class, capabilities, pair, repair, images
  driver.settings.compose.json# device settings (array) — Advanced settings UI
  driver.flow.compose.json    # driver-scoped Flow cards
  driver.js                   # Driver class (onPair, onRepair, onPairListDevices)
  device.js                   # Device class (onInit, onSettings, capability listeners)
  pair/<viewId>.html          # custom PAIRING views
  repair/<viewId>.html        # custom REPAIR views
  assets/                     # icon.svg, images/{small,large,xlarge}.png
locales/<lang>.json           # i18n strings (en.json required)
```

## Homey CLI (essentials)

- `homey app run` — dev mode in Docker, streams logs, **uninstalls on Ctrl+C**.
  - `--clean` wipes userdata/paired devices/settings (great for testing pairing).
  - `--remote` runs on the Homey; `--network host` helps LAN discovery.
- `homey app install` — build + install persistently (no log stream).
- `homey app validate [--level debug|publish|verified]` — run/install/publish call it automatically.
- `homey app build` — production build (runs Compose + TS compile).
- `homey app version <patch|minor|major|x.y.z>` — bump version in app.json.
- `homey app driver create` — scaffold a driver.
- `homey app driver capabilities` / `homey app driver flow` — edit a driver.
- `homey app manage` — open the app in Developer Tools (to uninstall, view logs).
- `homey api diagnose` — debug why the CLI cannot reach the Homey.
- Requires Docker running (Early-2023+). If the socket is non-standard use `--docker-socket-path`.

## Drivers & Devices

`driver.js`:

```js
'use strict';
const Homey = require('homey');

class MyDriver extends Homey.Driver {
  async onInit() { this.log('driver init'); }

  // Quick path when you only use list_devices + add_devices templates:
  async onPairListDevices() {
    return [{ name: 'Device', data: { id: 'unique-stable-id' }, store: { /* … */ } }];
  }
}
module.exports = MyDriver;
```

`device.js`:

```js
'use strict';
const Homey = require('homey');

class MyDevice extends Homey.Device {
  async onInit() {
    this.registerCapabilityListener('onoff', (value) => this._setOnoff(value));
    const settings = this.getSettings();     // read current settings
    const store = this.getStoreValue('key'); // read persistent store
  }
  async onAdded() {}
  async onSettings({ oldSettings, newSettings, changedKeys }) { /* validate/apply; throw to reject */ }
  async onRenamed(name) {}
  async onDeleted() {}   // clean up (timers, sockets, shared connections)
  async onUninit() {}
}
module.exports = MyDevice;
```

- **Store** (`get/setStoreValue`) = hidden, persistent per-device data (credentials, ids). Set at pairing via the device's `store` object.
- **Settings** (`get/setSettings`) = user-visible *Advanced settings*.
- **Capabilities**: `registerCapabilityListener(cap, fn)`, `setCapabilityValue(cap, val)`, `getCapabilityValue(cap)`.
- **Availability**: `setAvailable()`, `setUnavailable(msg)`.
- **Warnings**: `setWarning(msg)` shows a non-blocking banner; `unsetWarning()` clears it.

### Device tile indicators (the status dot/icon next to a device)

Only **boolean `alarm_*`** and **number `measure_*`/`meter_*`** capabilities can be
shown as a device indicator. An **enum capability (e.g. `homealarm_state`) cannot
be an indicator** — so a device with only an enum shows no indicator. To surface a
state, mirror it to a boolean:

- All `alarm_*` booleans are grouped by default; the tile shows a **warning icon
  if any is `true`**. The user can instead pick one specific alarm as the indicator.
- A custom boolean capability (`.homeycompose/capabilities/<id>.json`) may set its
  own `icon`, `title`, `uiComponent`, and `insightsTitleTrue/False`.
- Classes `thermostat`, `light`, `lock`, `speaker` do not allow user indicator override.
- When adding capabilities to an existing driver, also `addCapability()` in
  `onInit` (guarded by `hasCapability()`) so already-paired devices get them.

## Pairing

Define the flow in `driver.compose.json`:

```json
"pair": [
  { "id": "connect" },
  { "id": "list_devices", "template": "list_devices", "navigation": { "next": "add_devices" } },
  { "id": "add_devices", "template": "add_devices" }
]
```

System templates: `list_devices`, `add_devices`, `login_credentials`,
`login_oauth2`, `pincode`, `loading`, `done`.

`onPair(session)` back-end:

```js
onPair(session) {
  session.setHandler('myEvent', async (data) => { /* … */ return result; });
  session.setHandler('list_devices', async () => ([ /* devices */ ]));
  session.setHandler('showView', async (viewId) => { /* fired when a view is shown */ });
}
```

## Repairing (reconfigure a paired device)

Enable in `driver.compose.json`:

```json
"repair": [ { "id": "repair" } ]
```

- Custom repair view HTML → **`drivers/<id>/repair/repair.html`** (the `repair/` folder!).
- Back-end handler:

```js
onRepair(session, device) {
  // `device` is the Homey.Device being repaired.
  session.setHandler('myEvent', async (data) => { /* update device.setStoreValue(...) */ });
  session.setHandler('disconnect', async () => { /* cleanup */ });
}
```

- `Homey.createDevice()` is **not** available during repair (device already exists).
- Use repair to fix credentials/host after they change, without deleting the device.
- **Repair ≠ re-pair.** Repair reconfigures an *existing* device (update its store
  and reconnect); it does not add/re-add the device.
- **Prefilling a repair view is fiddly** — see the view bootstrap note below.
  Reliable pattern: push current values from the back-end on `showView` via
  `session.emit('connection', data)` and have the view listen with
  `Homey.on('connection', …)`, and also expose a `getConnection` request handler
  as a fallback. Keep secrets blank (blank on save = keep current stored value).

## Custom pairing / repair views (front-end API)

The view HTML runs in an iframe. `Homey` is normally provided via the global
`onHomeyReady(Homey)` callback, and you **must call `Homey.ready()`** or the view
never finishes loading.

```html
<script type="application/javascript">
  function onHomeyReady(Homey) {
    // Listen for backend pushes BEFORE ready() so nothing is missed.
    Homey.on('someEvent', (data) => { /* … */ });

    Homey.ready();                       // REQUIRED — tells Homey the view is ready

    Homey.emit('getData', {})            // request → resolved by session.setHandler('getData')
      .then((result) => { /* … */ })
      .catch(() => {});
  }
</script>
```

**VERIFIED GOTCHA — repair views may never get `onHomeyReady`.** On some Homey
versions the `onHomeyReady(Homey)` callback is **not called for custom REPAIR
views** (it works for PAIR views). The `<script>` still runs and `Homey` is
available as a **global**, so the view initialises but your `onHomeyReady` body
never executes. Use a bootstrap that supports both the callback and the global,
and runs setup once:

```html
<script type="application/javascript">
  var didSetup = false;
  function setup(homey) {
    if (didSetup) return; didSetup = true;
    window.Homey = homey;
    homey.on('connection', prefill);   // receive backend push
    homey.ready();                      // REQUIRED
    homey.emit('getConnection', {}).then(prefill).catch(function(){}); // fallback request
  }
  function onHomeyReady(homey) { setup(homey); }        // pair views / some versions
  (function waitForHomey() {                             // repair views / global fallback
    if (didSetup) return;
    if (typeof Homey !== 'undefined' && Homey && typeof Homey.ready === 'function') { setup(Homey); return; }
    var n = 0, t = setInterval(function () {
      if (didSetup) { clearInterval(t); return; }
      if (typeof Homey !== 'undefined' && Homey && typeof Homey.ready === 'function') { clearInterval(t); setup(Homey); }
      else if (++n > 50) clearInterval(t);
    }, 100);
  })();
</script>
```

Front-end methods: `Homey.emit(event, data): Promise`, `Homey.on(event, cb)`,
`Homey.showView(id)`, `Homey.nextView()`, `Homey.prevView()`, `Homey.done()`
(close session), `Homey.setTitle/Subtitle`, `Homey.alert/confirm`,
`Homey.showLoadingOverlay/hideLoadingOverlay`, `Homey.createDevice(obj)` (pair only),
`Homey.setViewStoreValue(viewId, key, value)`, `Homey.__(key)` (i18n).

Back-end ↔ front-end:
- Front-end `Homey.emit(evt, data)` → back-end `session.setHandler(evt, cb)`; the
  handler's return value resolves the front-end promise.
- Back-end `session.emit(evt, data)` → front-end `Homey.on(evt, cb)`.
- Homey notifies the back-end of the active view via `session.setHandler('showView', cb)`.

Debugging view issues:
- `unknown_error_getting_file` → the view HTML is missing at the path Homey
  requests. Check `pair/` vs `repair/` folder and that `<viewId>.html` matches the
  manifest `id`. Confirm the built file exists under `.homeybuild/drivers/<id>/{pair,repair}/`.
- View shows only static HTML, no prefilled/dynamic data → the front-end↔back-end
  channel isn't delivering. First find out *how far* it gets, in this order:
  1. Does the `<script>` run at all? Set an input value unconditionally at the
     end of the script (e.g. a marker string) — if you don't see it, the script
     isn't executing.
  2. Does `onHomeyReady` run? Set a marker as its first line. **If the script
     runs but `onHomeyReady` does not, it's the repair-view gotcha above — use
     the global `Homey` bootstrap.**
  3. Add a `this.log` inside the back-end `session.setHandler(...)` and a
     `session.setHandler('showView', …)` log to confirm the back-end side fires
     and what data it has.
- Prefer app-specific event names (e.g. `getConnection`) over generic ones like
  `load`/`save`, which can collide with internal events.

## Device settings

Canonical file `drivers/<id>/driver.settings.compose.json` (a JSON array):

```json
[
  { "id": "host", "type": "text", "label": { "en": "IP address" }, "value": "" },
  { "id": "port", "type": "number", "label": { "en": "Port" }, "value": 80, "min": 1, "max": 65535 },
  { "id": "secret", "type": "password", "label": { "en": "Password" }, "value": "" },
  { "type": "group", "label": { "en": "Login" }, "children": [ /* … */ ] }
]
```

Types: `text` (optional `pattern` regex), `password`, `textarea`, `number`
(`min`/`max`/`step`/`units`), `checkbox`, `dropdown` (`values: [{id,label}]`),
`group` (`children`), `label` (read-only). Add `"highlight": true` to surface a
setting during pairing.

Apply changes in `device.js`:

```js
async onSettings({ oldSettings, newSettings, changedKeys }) {
  // Validate; throw new Error('reason') to REJECT and revert with a message.
  // Return an optional string to show as a success notice.
}
```

Remember: programmatic `setSettings()` does not fire `onSettings()`.

## Flow cards

- App-level: `.homeycompose/flow/<trigger|condition|action>/<id>.json`.
- Driver-level: `drivers/<id>/driver.flow.compose.json`.
- Register/handle in code:

```js
// app.js or driver.js
const card = this.homey.flow.getActionCard('my_action');
card.registerRunListener(async (args, state) => { /* … */ });
// Triggers:
this.homey.flow.getDeviceTriggerCard('my_trigger').trigger(device, tokens, state);
```

Cards support `args` (input, incl. `type: "device"`, `autocomplete`) and `tokens` (output).

## App manifest & i18n

- App source: `.homeycompose/app.json` (`id`, `version`, `compatibility`,
  `sdk: 3`, `name`, `description`, `category`, `permissions`, `images`, …).
- i18n: string fields are `{ "en": "…", "nl": "…" }`; `locales/<lang>.json`
  holds keys used via `Homey.__('key')`. `en.json` is required.

## LAN / discovery

- Apps reach LAN devices over Wi-Fi. Use `.homeycompose/discovery/<id>.json`
  strategies (mDNS-SD, SSDP, MAC/ARP) and `this.homey.discovery.getStrategy(id)`.
- Raw TCP/UDP via Node's `net`/`dgram`. There is no built-in TLS requirement.

## Documentation index (fetch the `.md` when unsure)

Base: https://apps.developer.homey.app  · Full index: `/llms.txt` · Full corpus: `/llms-full.txt`

- Getting started: `/the-basics/getting-started.md`
- CLI reference: `/the-basics/getting-started/homey-cli.md`
- App & Manifest: `/the-basics/app.md`, `/the-basics/app/manifest.md`
- Internationalization: `/the-basics/app/internationalization.md`
- Permissions: `/the-basics/app/permissions.md`
- Persistent storage: `/the-basics/app/persistent-storage.md`
- Drivers & Devices: `/the-basics/devices.md`
- Pairing: `/the-basics/devices/pairing.md` (+ `/system-views.md` and each view)
- Custom pairing views: `/advanced/custom-views/custom-pairing-views.md`
- Capabilities: `/the-basics/devices/capabilities.md`
- Energy: `/the-basics/devices/energy.md`
- Settings: `/the-basics/devices/settings.md`
- Best practices: `/the-basics/devices/best-practices.md`
- Flow: `/the-basics/flow.md` (+ `/arguments.md`, `/tokens.md`)
- Widgets: `/the-basics/widgets.md`
- Homey Compose: `/advanced/homey-compose.md`
- Custom views / App settings: `/advanced/custom-views.md`, `/advanced/custom-views/app-settings.md`
- Web API: `/advanced/web-api.md`
- Wi-Fi & discovery: `/wireless/wi-fi.md`, `/wireless/wi-fi/discovery.md`
- Guidelines & publishing: `/app-store/guidelines.md`, `/app-store/publishing.md`
- SDK API reference (classes/methods): https://apps-sdk-v3.developer.homey.app
