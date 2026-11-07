# MGU Browser — English overview

An experimental native browser UI for BMW MGU / iDrive 7, backed by a separate
Chromium process, with a local SDK app emulator for development.
Version 0.11.0 publishes an **experimental ID7/x86_64 Store catalog** with
the frontend, native runtime and private Chromium engine. Add
`pllanaio/mgu-browser` as a GitHub source and select **Releases** for complete
installation and updates. Existing `main` sources must switch to Releases
for these binary packages. The project's own code is now MIT licensed.

**BMW speaker output is not connected yet. YouTube and subscription-provider
playback are not confirmed. No Widevine CDM or BMW SDK is distributed.**
See [installation, dependencies and rollback](docs/MGU_STORE.md).

The [full German README](README.md) describes features and verified limits.

## New in 0.11.0

Ordered rotary input, visible page focus, correct Enter/Space activation,
shadow/same-origin frame form detection, tracked popup tabs preserving opener
relationships, repaired headless fullscreen and inline media actions.
Settings → Media & streaming now includes playback/fullscreen actions and
an explicit one-second audio test. Actual Chromium output to a configured
Linux ALSA test sink is verified; BMW speaker routing remains unimplemented.
See [audio](docs/AUDIO.md) and [tests](docs/TESTING.md).

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
Media is enabled in the backend. An earlier private build rendered muted test
video on the author's MGU; the new packaging still needs hardware qualification.
Chromium does not provide a CDM or BMW audio routing.

Version 0.9.0 adds opt-in encrypted session and HTTP-cache persistence, separate
site/cache/history clearing, and an explicit origin-bound password manager.
Windows DPAPI wraps the laptop key; the MGU backend has a portable master-password
mode with PBKDF2-SHA256 and AES-256-GCM. Both share the same storage format and
browser code. Real-MGU qualification is pending. Clean shutdown is required to
save the latest state; sudden power loss is not fully covered. Website-provided
video controls take precedence, with native controls used only as fallback.
Proprietary SDK files, credentials, vehicle data, firmware dumps and CDMs are
excluded. Original code is MIT licensed; dependencies retain their licenses,
with matching native source archives supplied beside the release binaries.

## Credits and collaboration

Special thanks to **[cauliflowermossgrape and idrive7-apps contributors](https://github.com/cauliflowermossgrape/idrive7-apps)**
for the app kit, native rendering/controller foundations and emulator, and to
**[Robert Nisipeanu, IterioDev and MGU-Store contributors](https://github.com/robertnisipeanu/mgu-store)**
for the store, renderer, deployment/update infrastructure and shared internet uplink.
Store integration and shared uplink are implemented; packages were tested with
the official deployer's isolated fixture. No affiliation or endorsement is claimed.

See [credits](CREDITS.md), [roadmap](docs/ROADMAP.md),
[development](docs/DEVELOPMENT.md) and [architecture](docs/ARCHITECTURE.md).

The 0.9.1 audit foundation prepared bounded storage, metadata and shutdown.
Version 0.10.0 adds Store package distribution. Disney sign-in survived an
emulator restart, but provider controls and real-HU DRM remain unqualified.
See [head-unit readiness](docs/HEADUNIT_READINESS.md).
