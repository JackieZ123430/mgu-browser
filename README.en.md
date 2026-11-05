# MGU Browser — English overview

An experimental native browser UI for BMW MGU / iDrive 7, backed by a separate
Chromium process. Version 0.8.1 is being developed in a local SDK app emulator.
This is a **source preview, not a ready-to-install MGU-Store release**.

The [full German README](README.md) describes features and verified limits.

## Implemented locally

- Real HTML/CSS/JavaScript rendering, back/forward, reload/stop, editable URL bar.
- Up to eight tabs with separate page state and navigation histories.
- Configurable home page, frequent pages, bookmarks and history.
- Native controller and touchscreen navigation, side keyboard, Unicode and symbols.
- System-language integration, German/English UI and multiple keyboard layouts.
- Reading mode, page zoom and optional auto-hidden browser chrome.
- Uncropped video fullscreen with controller play/pause, seek, mute and exit.
- Prepared hotspot settings and Wi-Fi scanner/broker; real-hardware qualification pending.
- A local Windows/WSL development workflow using an externally supplied SDK kit.

## Streaming status

The official desktop Chrome build with its own unchanged Widevine CDM has
played an authorized public Shaka/Sintel encrypted test stream in an isolated
local session. This does not certify any subscription provider or the real MGU.
Netflix currently fails before its password step. Disney+ login has reached the
profile-PIN step and confirmed visible playback, fullscreen and controller
play/pause in the laptop emulator. YouTube, Prime Video and
Paramount+ require further qualification. Vehicle audio is also unconfirmed.
The production head-unit backend still disables media.

Browser profiles are temporary: closing/reloading loses cookies and logins.
Proprietary SDK files, credentials, vehicle data, firmware dumps, CDMs and
binary packages are excluded. An additional license for original project code
has not yet been selected; third-party components retain their own licenses.

## Credits and collaboration

Special thanks to **[cauliflowermossgrape and idrive7-apps contributors](https://github.com/cauliflowermossgrape/idrive7-apps)**
for the app kit, native rendering/controller foundations and emulator, and to
**[Robert Nisipeanu, IterioDev and MGU-Store contributors](https://github.com/robertnisipeanu/mgu-store)**
for the store, renderer, deployment/update infrastructure and shared internet uplink.
Store integration, including reuse of that uplink, is planned and has not been
validated. No affiliation or endorsement is claimed.

See [credits](CREDITS.md), [roadmap](docs/ROADMAP.md),
[development](docs/DEVELOPMENT.md) and [architecture](docs/ARCHITECTURE.md).
