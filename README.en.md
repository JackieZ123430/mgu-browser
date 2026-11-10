English | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md)

# MGU Browser — English overview

An experimental native browser UI for BMW MGU / iDrive 7, backed by a separate
Chromium process, with a local SDK app emulator for development.
Version 0.16.0 publishes an **experimental ID7/x86_64 Store catalog** with
the frontend, native runtime and private Chromium engine. Add
`pllanaio/mgu-browser` as a GitHub source and select **Releases** for complete
installation and updates. Existing `main` sources must switch to Releases
for these binary packages. The project's own code is now MIT licensed.

**BMW AudioManager/SmartX output is implemented; audible vehicle testing of this
version is pending. Protected streams need a separately authorized CDM. No
Widevine binary or BMW SDK is distributed, and provider playback is unconfirmed.**
See [installation, dependencies and rollback](docs/MGU_STORE.md).

The [full German README](README.de.md) describes features and verified limits.

## Simplified Chinese UI

Native controls follow the vehicle language. `zh-CN`, `zh-SG`, `zh-Hans`,
`zh-Hans-CN` and bare `zh` use Simplified Chinese; explicit Traditional Chinese
locale tags retain the English fallback. Technical date formats, URLs and
unknown website text are preserved. The on-screen keyboard keeps its existing
Latin layout; this translation does not add a Chinese IME.

Native menus use a sharp subset CJK atlas. A separate fallback atlas covers
GB2312 Chinese title characters, including titles such as 百度热搜; it is not a
complete Unicode CJK font. Both atlases fit the renderer's texture budget.
Website text is rendered separately by Chromium. The runtime now bundles the
complete public Noto Sans SC font with its OFL notice and verified source hash,
and includes the existing engine font configuration as a fallback. This keeps
the immutable engine 0.1.0 unchanged; update both frontend and runtime to obtain
both title and webpage fixes. Physical MGU checks are recorded separately from
local UI tests; this does not add a Chinese IME.

## Desktop browser functions in 0.16.0

Update **both Browser and Browser Runtime to 0.16.0**; Engine remains **0.1.0**.
Chromium now runs its ordinary browser on the built-in Ozone offscreen display.
Native User-Agent and Client Hints remain intact, including their actual engine
identity. WebGL uses the available software renderer. `navigator.webdriver`
remains true; this does not promise CAPTCHA removal or protected-provider playback.

| Area | Implemented behavior and boundary |
| --- | --- |
| Navigation | HTTP/HTTPS, custom ports, ordinary native networking and background tabs; certificate verification stays enabled. |
| Input | Native form controls, date/time, multiline text, modifiers, selection, copy/paste, drag and scrolling; bounded chunked large text. |
| Dialogs | Alert/confirm/prompt and native beforeunload stay/leave, including tab close without destroying a cancelled page. |
| Authentication | Explicit native HTTP Basic/Digest challenge replies bound to origin, realm and current tab/frame; Chromium's cross-site prompt policy stays in place. |
| Page find | Document, shadow-root and owned-frame matches, next/previous and case sensitivity while preserving the existing text selection. |
| Zoom | Native Chromium zoom at 100/125/150%, preserving physical raster resolution and pointer/scroll targeting, including owned cross-site frames. |
| Files | Download list and delivery through the authenticated phone connection; explicitly confirmed streamed phone uploads into the exact website file chooser, including cross-site frame targets. No arbitrary headunit file paths. |
| Permissions | Explicit website/frame-scoped decisions backed by Chromium's native permission state; missing vehicle devices remain missing. |
| Persistence | Encrypted cookies and site storage; localStorage/IndexedDB/CacheStorage/service-worker registration tested. Up to eight GET tab URLs and the active tab can be restored. |
| Media | Existing native JPEG, fullscreen, PCM pacing and controller features retained. Actual BMW output and protected services remain separately unqualified. |
| Desktop limits | No extension manager, print dialog or general desktop filesystem UI. Tab restore does not recreate form values, POST bodies or JavaScript state. |

Downloads retain up to 32 MiB each and 64 MiB total; uploads allow up to 16 MiB
each and 32 MiB staged, with bounded counts. Known oversized downloads are
cancelled and disk/progress checks enforce retained quotas; transient overshoot
between checks is possible. Files stay in the private persistent data directory
and transfer through the paired local phone service.

The work filesystem remains 384 MiB. Normal encrypted snapshots have a 64 MiB
budget. After writers stop, crashed-engine or larger profiles use a streamed
encrypted recovery with a 192 MiB budget and keep the last good normal archive.
Above the recovery budget or on a write failure, storage status reports failure
and preserves the still-present private working profile rather than silently
discarding it. That unsaved copy is not durable across backend restart or power
loss. Data Chromium had not flushed to files cannot be recovered; metadata uses
part of each budget, and atomic replacement temporarily needs additional disk.
See [tests and limits](docs/TESTING.md).

## CarLifeMedia, foreground and available resources in 0.15.0

The backend service removes its own RAM and task caps, raises regular CPU and
best-effort I/O priority, and sets no CPU quota or fixed CPU affinity. The
private 384 MiB filesystem still bounds profiles, cache and temporary files;
it is not a process-RAM limit. Physical resources and operating-system limits
still apply. No physical-headunit speed gain is asserted without measurement.

When the audio source is occupied, Browser may take over the verified
**287 / CarLifeMedia** source. It rechecks each connection identity, disconnects
only that source's routes, then creates its own 287-to-1024 connection. Other
sources and foreign SmartX lock files stay untouched. Release disconnects only
the newly owned connection; displaced routes are not automatically recreated.

The app requests native foreground through the SDK and requires subsequently
observed visibility and focus. A local focus flag alone is insufficient.
Retries and waits are bounded; focus loss or invalid replies abort acquisition.
See [audio behavior and limits](docs/AUDIO.md).

Update **both Browser and Browser Runtime to 0.15.0**; Engine stays **0.1.0**.
The 0.14.0 video timing, fullscreen and controller improvements remain included.
Actual headunit speakers and firmware focus still require vehicle testing.

Chromium also chooses its renderer count without the earlier fixed four-process
cap. User-Agent and Client Hints consistently report the actual Chromium/Linux
identity. Cookie checkpoints now include flags and partition scope; authored
consent and Secure/HttpOnly/host-scoped cookies survived a hard engine kill.

Passive media-state reads now cover closed-shadow players. The authored
Disney-like fixture produced real nonblack video and PCM, with mute/zero volume,
pause/end/navigation/tab-close releasing the route. Unknown state may retain
only an existing route for up to four seconds and cannot acquire a new one.
A backend disconnect releases audio and clears the frozen picture; when ready
returns, an active visible/focused app reloads its URL or home page.

Public Netflix/Disney pages loaded. A reserved example email advanced with both
old and new UA, so the reported generic account error was not reproduced or
verified fixed. `/login` remains email-first; a hidden password DOM node is not
a direct password form. A real Google search still returned HTTP429 and a
network-traffic/CAPTCHA page with normalized UA; no CAPTCHA interaction was
performed. Google controls that server-side; Browser cannot guarantee its
removal and does not automatically solve challenges. See
[test evidence and limits](docs/TESTING.md).

## Video timing and fullscreen in 0.14.0

The audio bridge now accepts complete PCM blocks at the required real-time
rate. Media discovery reaches players behind large page templates, fullscreen
preserves the site's nested layout, and render backpressure discards obsolete
frames before decoding them.

Rotary bursts coalesce without an added debounce delay, and presses follow the
preceding detents. A merged rotary job is capped at 64 detents and the pending
queue at 32 jobs including press barriers. Excess or stale navigation input is
cancelled; unlimited bursts are not buffered in full.

With the same engine and only the native audio helper changed, an isolated
2.002-second test advanced the media clock by 1.996 seconds instead of 1.430,
with 60 delivered frames instead of 43. A separate artificial 70% consumer-pressure
test kept 89 delivered frames while Node CPU time fell from 389 to 252 ms.
These are scoped local comparisons, not universal website or MGU frame-rate claims.
See [test evidence and limits](docs/TESTING.md).

Update **both Browser and Browser Runtime to 0.15.0**; Engine remains **0.1.0**.
The startup fix, migration, iDrive and phone-remote features remain included.
Live YouTube testing was blocked by a proxy HTTP 403 in this environment.
Physical BMW audio and protected provider playback still need separate qualification.

## Startup fix in 0.13.3

Versions 0.13.0–0.13.2 mounted a 384 MiB working filesystem but still rejected
anything above 128 MiB after dropping privileges. The backend exited 125
before opening its socket. Mount and validation now share one limit. Updating
Browser and Runtime to 0.15.0 also recovers a stopped service where the current
boot registration permits it; otherwise Store requests a reboot. The engine
remains 0.1.0. Readiness now requires an actual backend notification.

## New in 0.12.0

Concrete AudioManager/SmartX routing with connection ownership, a separate
unprivileged firmware-ALSA writer, bounded PCM buffering and lifecycle cleanup.
Real Chromium-to-system-ALSA fixtures pass; physical BMW speakers remain a
vehicle test. A bounded async shutdown hook and optional authorized CDM
registration are included. See [audio](docs/AUDIO.md), [DRM](docs/DRM.md) and
[tests](docs/TESTING.md).

## Historical 0.11.0 changes

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
- System-language integration, German/English/Simplified Chinese UI and multiple keyboard layouts.
- Reading mode, page zoom and optional auto-hidden browser chrome.
- Uncropped video fullscreen with controller play/pause, seek, mute and exit.
- Prepared hotspot settings and Wi-Fi scanner/broker; real-hardware qualification pending.
- A local Windows/WSL development workflow using an externally supplied SDK kit.

## Streaming status

The official desktop Chrome build with its own unchanged Widevine CDM has
played an authorized public Shaka/Sintel encrypted test stream in an isolated
local session. This does not certify any subscription provider or the real MGU.
Current public Netflix and Disney pages load; that is not a protected-playback
or authenticated-account result. The reported Netflix generic error remains
unresolved; the public synthetic-email probe advanced with both UA versions.
Earlier Disney login/playback observations belong to a historical laptop test.
The authored closed-shadow player's audio-detection issue is locally corrected
and tested with real PCM plus mute/pause/end; this is no provider-playback result. YouTube, Prime Video, Paramount+ and audible vehicle output need
separate qualification.
Media is enabled in the backend. An earlier private build rendered muted test
video on the author's MGU; the new packaging still needs hardware qualification.
Chromium does not provide a CDM. Version 0.12.0 adds the separate BMW audio route.

Session/cookie persistence is now enabled by default with a protected local
site key; HTTP-cache persistence remains a separate opt-in. Cookie checkpoints
run during the session and include scope/flags; other profile storage is saved
on clean shutdown. Separate site/cache/history clearing and an explicit
origin-bound password manager are available.
Windows DPAPI wraps the laptop key; the MGU backend has a portable master-password
mode for the separate password vault with PBKDF2-SHA256 and AES-256-GCM.
Both share the same storage format and browser code. Real-MGU qualification is
pending. Changes after the last cookie checkpoint or profile snapshot can still
be lost; an engine hard-kill test does not qualify physical power failure. Website-provided
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
