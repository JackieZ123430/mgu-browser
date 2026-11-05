# Installation through MGU Store

Add **`pllanaio/mgu-browser`** as a GitHub source and choose **Releases**.
Switch existing `branch:main` sources to Releases, refresh and install Browser.
The `catalog` release supplies schema-2 `catalog.json`, including HTTPS artifact
URLs, byte sizes and SHA-256 values.

| Component | Version | Purpose |
| --- | --- | --- |
| `mgu_browser` | 0.10.0 | SDK-free OAP frontend and iDrive UI |
| `mgu-browser` | 0.10.0 | Native backend, IPC and uplink broker |
| `mgu-browser-engine` | 0.1.0 | Debian Chromium 156.0.8078.79 and private libraries |

The frontend requires runtime 0.10.0, engine 0.1.0, `mgu-uplink` 0.7.3,
`mgu-render` 0.6.11 and `mgu-deploy` 0.7.17 or newer. Keep the official Store
source enabled for the last three. The Store installs dependencies automatically.
This release targets **ID7 / Linux x86_64**, not ID8 or other architectures.

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
enabled. Temporary profiles use a private 128 MiB noexec/nosuid tmpfs.

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
