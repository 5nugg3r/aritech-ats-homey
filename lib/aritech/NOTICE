# Vendored third-party library: aritech-js

This folder contains a **vendored (copied) subset** of the `aritech-js` library,
which implements the Aritech ATS ("Advisor Advanced") panel protocol in pure
JavaScript. It is used by this Homey app to talk to the panel over the local
network.

## Provenance

- **Upstream project:** https://github.com/sebakerckhof/aritech-js
- **Author:** Seba Kerckhof
- **Upstream version:** 1.5.0
- **Vendored from commit:** `de2f8bfeed6c5e6ac74fe764fe7a62d9f4b8ee01` (2026-04-27)

## License

The upstream repository ships a `LICENSE` file that is the **GNU Affero General
Public License v3.0** (AGPL-3.0), which is preserved here as `LICENSE`. This is
the license we treat as governing this vendored code, and it is why this Homey
app as a whole is distributed under AGPL-3.0-or-later.

> Note: the upstream `package.json` declares `"license": "ISC"`, which conflicts
> with the AGPL-3.0 `LICENSE` file and README. To stay on the safe/compatible
> side we honour the more restrictive AGPL-3.0 terms.

## What was copied (and what was not)

Copied (the runtime library and its dependencies):

- `index.js` (public entry point / exports)
- `aritech-client.js`, `aritech-monitor.js`, `aritech-utils.js`
- `messages.js`, `message-helpers.js`
- `event-parser.js`, `event-types.js`
- `AreaState.js`, `ZoneState.js`, `OutputState.js`, `TriggerState.js`,
  `DoorState.js`, `FilterState.js`
- `LICENSE` (AGPL-3.0)

Intentionally **not** copied:

- `aritech-cli.js` (command-line tool; the only file using `fs`/`path`/`url`)
- `config.*.json.example`, `package-lock.json`, `README.md`

## Modifications

The copied files are **verbatim**, unmodified. A local `package.json` with
`"type": "module"` was added so these files load as ES modules while the rest of
the Homey app remains CommonJS. The app loads this library via a dynamic
`import('../../lib/aritech/index.js')`.

## Runtime dependencies

Only Node.js built-ins: `net`, `events`, `crypto`. No external npm packages.
