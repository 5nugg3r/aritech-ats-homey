# aritech-ats-homey

A [Homey](https://homey.app/) app that integrates Aritech / ATS **Advisor Advanced** alarm panels (IP based) over your local network.

Monitor and control your panel directly from Homey: arm and disarm areas, follow area and zone status in real time, and build Flows around your security system.

> This is an unofficial, community-developed app. It is not affiliated with, endorsed by, or supported by Aritech or KGS (Kidde Global Services).

## Features

- **Arm / disarm areas** — full arm and part-arm, mapped to Homey's native alarm state.
- **Live status** — area and zone state pushed in real time (COS events).
- **Alarm indicators** — intrusion, fire, tamper, panic, medical and duress.
- **Flow cards** — triggers, conditions and actions for arming, force-arm, night-arm and inhibiting/uninhibiting zones.
- **Repair** — reconfigure a paired device (host/port/credentials) without removing it.
- **Readable errors** — panel, network and encryption-key problems are shown as clear messages instead of raw codes.
- **Optional per-device debug logging** — off by default.

## Requirements

- An Aritech ATS Advisor Advanced panel with a network (IP) connection.
- The **automation / IP protocol enabled** on the panel (installer/license).
- The panel **encryption key** and a login:
  - PIN for **x500** panels, or
  - username and password for **x700 "everon"** panels (`ATSxxxxA-IP-MM`).

## Installation

Install from the Homey App Store (once published), or run locally during development:

```bash
homey app run
```

## Development

- Built with the Homey Apps SDK v3 / Homey Compose; `app.json` is generated from `.homeycompose/` and per-driver compose files.
- Validate: `homey app validate --level debug` (or `--level publish`).
- The ATS protocol is implemented by the vendored [`aritech-js`](https://github.com/sebakerckhof/aritech-ha) library (`lib/aritech/`).

## License

[AGPL-3.0-or-later](LICENSE). The vendored `aritech-js` source is included with attribution.
