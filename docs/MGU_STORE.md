# Installation through MGU Store

Add **`pllanaio/mgu-browser`** as a GitHub source and choose **Releases**.
Switch existing `branch:main` sources to Releases, refresh and install Browser.
The `catalog` release supplies schema-2 `catalog.json`, including HTTPS artifact
URLs, byte sizes and SHA-256 values.

| Component | Version | Purpose |
| --- | --- | --- |
| `mgu_browser` | 0.14.0 | SDK-free OAP frontend and iDrive UI |
| `mgu-browser` | 0.14.0 | Native backend, IPC and uplink broker |
| `mgu-browser-engine` | 0.1.0 | Debian Chromium 156.0.8078.79 and private libraries |

The frontend requires runtime 0.14.0, engine 0.1.0, `mgu-uplink` 0.7.3,
`mgu-render` 0.6.11 and `mgu-deploy` 0.7.17 or newer. Keep the official Store
source enabled for the last three. The Store installs dependencies automatically.
This release targets **ID7 / Linux x86_64**, not ID8 or other architectures.

## Update to 0.14.0: video and fullscreen

Close Browser, refresh the Releases source and update **both Browser and
Browser Runtime to 0.14.0**. Engine remains **0.1.0**; no replacement engine,
firmware ALSA library or CDM is distributed. The new audio helper fixes slow
PCM producer pacing. Fullscreen keeps site-player geometry, large pages retain
playing-media detection, and overloaded frame delivery avoids obsolete decodes.

After reopening, compare ordinary inline video, site/full-browser fullscreen,
resize/exit and audible playback separately. Local exact-engine/native-JPEG/PCM
tests are described in [TESTING.md](TESTING.md); they do not qualify every
provider or actual BMW speakers. Existing startup recovery, legacy migration,
controller input and phone-remote features remain included. Rotary requests
coalesce while preserving press ordering; the queue is bounded to 32 pending
jobs and 64 detents per merged rotary job, with excess/stale work cancelled.
Follow a Store
headunit-restart request after fresh recmgr registration.

## From a private 0.9.x installation or the `branch:main` channel

The runtime (`mgu-browser`) and engine (`mgu-browser-engine`) exist only as
release packages. With a `branch:main` source the Store therefore reports
`needs mgu-browser … which no source has`. Remove the source and add
`pllanaio/mgu-browser` again with **Releases**.

A runtime installed privately with mgu-deploy (0.9.x) has no Store origin.
The Store updates such a component from the only source that lists its id,
so the Releases source takes it over; no manual uninstall is needed. From
0.13.1 the runtime also deletes the unused 0.9.x engine folder
`/var/opt/mgu-browser/engine` once the versioned Store engine is installed.

## 0.13.3: native backend exits 125

The published 0.13.1 and 0.13.2 runtimes reproduce this failure even on a
clean installation: the launcher mounts 384 MiB, then its stale 128 MiB
post-drop check refuses the mount. No backend socket can be created. A shared
native constant now defines both the mount size and its maximum check. The
384 MiB quota and noexec/nosuid/nodev isolation are retained.

Refresh Releases and update **both Browser and Browser Runtime to 0.14.0**.
Engine stays **0.1.0**. Activation can recover stopped services only after
trusted current-boot recmgr evidence proves both Browser service names were
loaded. Fresh registration or unavailable evidence produces a Store reboot
request instead of a risky hot start. Follow that restart request, then reopen
the browser. No manual service command or firmware file edit is needed.

The root launcher publishes bounded startup diagnostics through a protected
status file. An explicit child readiness signal replaces the elapsed-time guess.

## Historical 0.13.2: folders from a private 0.9.x installation

"Browser-Dienst noch nicht bereit" without end: the runtime setup refused
folders the private 0.9.x installation had created under another owner
(`/var/opt/mgu-browser/data`, `work`, `network`), and the backend unit had
`Restart=no`, so it stayed down. From 0.13.2 such folders are moved aside
(`<name>.legacy-<time>`, never deleted), setup problems are retried, the unit
restarts always, and `/run/mgu-browser/status.json` reports each step; the
app shows that reason instead of the generic message.

## Update to 0.13.0

Refresh the Releases source and update **Browser** (the Store installs Browser
Runtime 0.13.0 first). The engine stays 0.1.0. New: about 30 fps with
changed-region updates, cookies and consent survive ignition-off without a
master password, ad/tracker blocking, frozen background tabs and the phone
remote control ([REMOTE.md](REMOTE.md)). Frontend and runtime negotiate the
frame format, so an update in either order never shows a black page.
The runtime opens TCP 39123 on the WLAN interfaces for the phone remote.

## Update to 0.12.0

Close Browser, refresh the Releases source and update both Browser and Browser
Runtime to **0.12.0**. Chromium Engine remains **0.1.0**. The runtime builds a
new static privilege launcher and native audio bridge from the published MIT
sources; unchanged helpers/codec still come from the hash-verified 0.10.0 base.
Native source hashes, compiler flags and GLIBC ABI imports are recorded in
`runtime-provenance.json`. No firmware audio library or CDM is redistributed.

The frontend's AudioManager interfaces are optional so a unit lacking them
can still install the browser. Audio activation requires a recognized unused
CarLifeMedia source, the existing `mgu_alsa` group and stock SmartX plugin.
It never steals another source connection or repairs foreign locks. Test the
explicit tone, video/pause, tab switch and app close on the target headunit.
Details and hardware limits: [audio](AUDIO.md). Protected playback additionally
requires a separately authorized module; see [DRM](DRM.md).

## Update to 0.11.0

Refresh the Releases source, close Browser, and update **both Browser and
Browser Runtime to 0.11.0**. The Chromium Engine stays at immutable **0.1.0**;
its original artifact and corresponding sources remain in release v0.10.0.
The frontend uses new runtime commands, so a frontend-only branch build against
runtime 0.10.0 is insufficient. Reopen Browser after both updates.

Live checks: rotate/press on a link, checkbox and text field; open a link in a
new tab; play an unprotected video; enter/exit fullscreen; then use Settings →
Media & streaming → Test tone (1 s). Record audible/not audible separately from
successful tone generation. BMW speaker integration remains open. See [audio](AUDIO.md).

## Installation and updates

Keep the vehicle parked, stably powered and in diagnostic mode for deployment.
Allow at least **2 GiB free persistent storage** for extraction and retaining a
previous engine version. The first install may require a restart requested by
the Store for service registration. In Browser → Settings → Wi-Fi, connect the
hotspot through the shared Internet uplink. The browser does not create a
competing DHCP/routing/firewall stack.

No SDK is in the frontend archive: Deploy generates it from a stock BMW donor
already on the owner's head unit. No Chrome, Widevine CDM, credentials, browser
profiles, cookies, SSH keys or BMW firmware are distributed.

The runtime uses UID **3911** and refuses a conflicting named system account.
It discovers the frontend's actual UID from trusted manager registration,
rather than assuming 12443. An unrelated app already named `mgu_browser` must
be resolved before using this binary release; binary releases cannot be renamed
by the Store. Arbitrary private development installations need migration review;
the release does not promise to adopt legacy files or service scripts.

## Isolation and rollback

Engines live under `/var/opt/mgu-browser-engine/versions/<version>/engine`.
Their interpreter and library paths point to that immutable version. BMW system
libraries are not replaced. Setup validates the engine and root-owned setuid
sandbox; Chromium and the backend run unprivileged with sandbox/TLS checks
enabled. Temporary profiles use a private 384 MiB noexec/nosuid tmpfs (128 MiB up to 0.12).

Close Browser before updating. Updates/rollback use the official deployer's
version directories and `current` links. Roll back the affected component in
Store/deploy if an update fails; runtime rollback does not automatically roll
back a separately updated frontend or engine. The initial release has no earlier
public version to restore. Engine activation restarts an active backend;
rollback also resumes one stopped by engine deactivation. Removal stops only
the browser's backend and retains user data; privacy settings provide deletion.
Do not delete an engine used by a running browser or interrupt deployment power.

## Verification and limits

The packages were installed with **mgu-deploy 0.7.17** in an isolated Linux
fixture with a synthetic donor. The real packaged backend and sandboxed Chromium
started with dynamically allocated app UID **13001**, rendered a frame and
created a tab. Runtime update/rollback were exercised. Systemd, app manager and
vehicle services in this fixture are simulated; whole-car boot, recovery-manager,
power loss and every firmware version are not qualified by that test.

Earlier private frontend 0.9.1/runtime 0.9.2 displayed websites and accepted
iDrive on the author's ID7. **The new 0.10.0 package integration has not yet
been installed on a real vehicle. BMW speaker output is not implemented.
YouTube/subscription-provider playback is unconfirmed; no CDM is included.**
See [testing](TESTING.md).

The historical 0.11.0 update reuses the exact hash-verified native helpers, N-API modules
and JPEG library from 0.10.0. Their C sources must match the pinned original
hashes before the builder accepts this path. JavaScript, frontend and metadata
are rebuilt; the engine is not repackaged from a newer build host. The new
release includes `runtime-provenance.json` identifying these inputs.

## Source channel and licenses

`mgu-repo.json` remains for frontend development on `branch:main`. Its bounded,
unprivileged `tools/build_store.py` verifies a pinned public MIT app kit and
uses the Store-supplied donor SDK. This channel does not distribute the large
engine; use **Releases** for a complete clean install.

Original code is MIT licensed; dependencies keep their licenses. The versioned
release supplies `corresponding-source-0.10.0.tar` containing matching Debian
source archives/patches and a source index with sizes/hashes. This is a license
asset, not a vehicle install package. See [build instructions](../release/README.md)
and [third-party notices](../THIRD_PARTY_NOTICES.md).

References: [Store publishing contract](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md),
[idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps).
