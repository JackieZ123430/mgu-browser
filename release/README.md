# Building the experimental Store release

Use a clean **Debian 12 Linux x86_64** host and an unprivileged build user.
Never build on the head unit; no vehicle connection or proprietary SDK is needed.
Install compiler dependencies separately:

```sh
sudo apt-get install python3 nodejs libnode-dev gcc musl-tools patchelf \
  chromium chromium-common chromium-sandbox fonts-dejavu-core libjpeg62-turbo-dev
MGU_OUT=/path/to/empty-frontend-output python3 tools/build_store.py \
  --app mgu_browser --version 0.16.0 --source apps/mgu_browser --release-package
```

Published engine: Chromium `156.0.8078.79-1~deb12u1`. Signed Debian repositories
move over time: use the exact versions in released `engine-provenance.json`
(and Debian snapshots if needed). Different inputs require a new engine version
and immutable prefix in `build.py`, never replacement bytes under the same version.

`build.py` copies the installed engine, resources and dynamic library closure,
records provenance and retains copyright notices. ELF changes are PT_INTERP and
DT_RPATH via patchelf to
`/var/opt/mgu-browser-engine/versions/0.1.0/engine/lib`. MIT native helpers use
static musl; N-API version-3 modules use the platform Node API. No BMW libraries,
firmware, profiles or Widevine are copied. The frontend verifies its pinned
public app kit and excludes `oap-sdk` entirely.

Enable authenticated **deb-src** entries matching the binary repositories and
refresh APT indexes, then run:

```sh
python3 release/collect_sources.py --out /path/to/engine-output \
  --sources-list /path/to/matching-debian.sources
```

The output directory must contain `engine-provenance.json`. The collector reads exact installed package
versions, verifies every download against signed APT source-index SHA-256/size
metadata and writes `corresponding-source-0.10.0.tar` without executing sources.
It includes libjpeg/musl. Debian `.dsc` and patches document upstream build
configuration; use Debian's source-package build process to reconstruct those
libraries/Chromium, then this packager. Original Ubuntu TTF sources are committed
under `assets/ui-fonts/` with their own notices.

## Frontend/runtime updates with the existing engine

Version 0.11.0 keeps the immutable engine 0.1.0 from release v0.10.0. Do not
rebuild it with another Debian version under the same component version. For
JavaScript-only runtime changes, the original Debian-12 native binaries can also
be reused on a different x86_64 build host:

```sh
gh release download v0.10.0 --repo pllanaio/mgu-browser \
  --pattern 'mgu-browser@0.10.0.tgz' --dir /path/to/input
python3 release/build.py --out /path/to/empty-runtime-output --runtime-only \
  --runtime-base /path/to/input/mgu-browser@0.10.0.tgz
```

The builder pins the complete published artifact's SHA-256, validates every
reused native payload against its manifest, and requires all four native C
sources to match commit `3c01fdfb600c38125ce2a874b77c1918521d7bf7`. It refuses
reuse after native edits. It records the base URL/digest and source hashes in
`runtime-provenance.json` and the installed runtime. Only native helpers,
N-API modules, libjpeg and their license files are reused; JavaScript, units,
checks and component metadata are rebuilt from the current source tree.

Publish the two 0.11.0 frontend/runtime artifacts and runtime provenance. Keep
the engine 0.1.0 entry and artifact URL in the Store catalog unchanged. Its
matching Debian/libjpeg/musl source archives remain available as
`corresponding-source-0.10.0.tar` in the retained v0.10.0 release. No replacement
engine or new third-party binaries are distributed by this update.

## Audio runtime 0.12.0

The audio update keeps the engine and three unchanged native helpers from the
immutable base, but rebuilds `backend-launch` and the new `audio-bridge` from
this repository's MIT sources. It never substitutes the old launcher after its
source changes. Prepare a public, pinned build sysroot without root or Docker:

```sh
python3 release/native_build.py --out /path/to/empty-native-sysroot
python3 release/build.py --out /path/to/empty-runtime-output --runtime-only \
  --runtime-base /path/to/input/mgu-browser@0.10.0.tgz \
  --native-sysroot /path/to/empty-native-sysroot
```

The sysroot is Debian's `musl-dev` 1.2.3-1, size/SHA-256 pinned against its signed
package index. The changed launcher links statically. The audio writer uses the
stock `/lib/ld-linux-x86-64.so.2`; the build refuses GLIBC imports above 2.27,
unexpected shared dependencies or a private engine RPATH.
The bridge explicitly retains `libdl.so.2` as a required library, because
glibc 2.27 keeps `dlopen` there even when a newer build host merges it into libc.
Source hashes, compiler flags/version, ELF imports and resulting binary hashes are recorded
in `runtime-provenance.json`. Firmware ALSA/SmartX is resolved on the owner's
headunit, and those libraries are never copied into the package. No Moonride
GPL source or Widevine binary is included.

New helper bytes may differ between trusted compiler versions. Release
verification therefore locks the audited source commit and input hashes,
checks native ABI and functional fixtures, checks every distributed JavaScript
file against source, and generates exact archive/catalog hashes from that CI
build. It does not claim byte-identical native output across different compilers.

After committing and testing the source, save the current public catalog in
`release/0.16.0/previous-catalog.json`, add the release notes and local test report,
then lock inputs:

```sh
python3 release/publish.py lock-inputs --source . --metadata release/0.16.0 \
  --version 0.16.0
```

The generic Actions workflow reads that descriptor's complete source SHA,
rebuilds the changed helpers, runs the actual packaged Chromium/FIFO/ALSA
fixture through a pinned public Ubuntu 18 GLIBC 2.27/libasound 1.1.3 runtime,
and runs the Store's validator, then publishes immutable assets using the
job's repository-scoped token. Uploaded downloads are checked against the
generated hashes. It uploads and verifies the new catalog under a temporary
name before switching it last; the previous catalog is retained for recovery.
The published 0.11.0 artifacts and their locked workflow remain unchanged.

After both packages and the updated catalog are assembled, validate them with
an independently checked-out Store source tree:

```sh
node test/store_package_smoke.js /path/to/mgu-store \
  /path/to/mgu_browser@0.16.0.tgz /path/to/mgu-browser@0.16.0.tgz \
  /path/to/catalog.json
```

This runs the real deploy artifact validator and updater catalog parser,
prepares the app with the Store's synthetic donor, loads both native modules,
and compares the packaged JavaScript with the current checkout. It does not
install anything or validate systemd/vehicle behavior.

## Service startup and failed-update recovery, 0.13.3

The launcher uses one 384 MiB constant for both its private tmpfs mount and
capacity check. The packaged root-startup regression must exercise the native
launcher before any browser operation; JavaScript engine tests cannot catch a
native exit before IPC starts.

```sh
python3 test/runtime_service_smoke.py \
  --runtime /path/to/mgu-browser@0.16.0.tgz \
  --engine /path/to/mgu-browser-engine@0.1.0.tgz
node test/store_service_activation_smoke.js /path/to/mgu-store \
  /path/to/mgu-browser@0.16.0.tgz
```

The first command uses local Linux Docker, a digest-pinned Ubuntu 18 image and
hash-pinned Node 8, read-only inputs and a disposable container with SYS_ADMIN
for its private mounts. It checks clean/legacy installations, distinct app UIDs,
audio-group presence/absence, real privilege/mount isolation and authenticated
IPC. With the optional immutable engine it also requires sandboxed Chromium
and actual projected RGBA frames. It installs no host service and does not
qualify real systemd, SmartX or headunit behavior.

The second command runs the unchanged official Store restart policy and the
built runtime's activation helper with authored systemctl/ownership fixtures.
An update may recover an inactive/failed service only after both Browser names
were proven present in recmgr's current list and boot-loaded list. A new install
keeps the Store's mandatory first-reboot gate. The final runtime check waits up
to 15 seconds for protected, fresh status from the exact installed version and
the correctly owned backend socket; an old version's status is insufficient.

## Packaged media and desktop browser gate, 0.16.0

```sh
python3 test/fullscreen_audio_package_smoke.py \
  --runtime /path/to/mgu-browser@0.16.0.tgz \
  --engine /path/to/mgu-browser-engine@0.1.0.tgz
```

The host needs FFmpeg for a bounded, originally generated VP8/Opus clip and
OpenSSL for a disposable self-signed TLS refusal fixture. The workflow checks
these tools and installs FFmpeg only when absent. TLS test inputs are generated
in the ignored cache and mounted read-only; no production credential is used.
The driver shares the startup fixture's pinned Ubuntu 18/Node 8/engine inputs
and verifies the public old ALSA archive by size and SHA-256. It extracts the
actual runtime inside the disposable container, then runs both fullscreen
tests and the controller/video ordering test as UID 3911 using its native JPEG
addon and audio helper. It accepts no native/source override, exposes no
host-write bind and keeps Chromium sandboxed.

The gate requires near-real-time video/PCM pacing, new nonblack frames through
large-DOM/fullscreen/resize/exit transitions, zero sink writes after releasing
audio, and preserved site-control/nested-player/iframe/shadow geometry. These
authored fixtures also require the same final control for 16 raw versus one
coalesced focus request while video advances. Controller timings are reported
without a speed-ratio threshold. The same driver additionally runs actual
Chromium/Linux HTTP/Client-Hints identity and cookie-checkpoint hard-kill tests,
for the five original mandatory package tests. Those authored loopback/DOM fixtures do not
certify live YouTube, subscription providers, CAPTCHA removal or BMW speakers.

The audio/video script now requires eleven stages, including passive closed-
shadow playing/unmute/volume-restored/resume state and muted/paused/ended/
navigation/tab-close cleanup. The frontend's unknown-state grace holds only
an existing route, expires after at most four seconds and cannot acquire from
unknown state. Packaged SDK tests also cover disconnect release/cleared frames
and ready-triggered reload while the app is visible and focused.

Nineteen more portable scripts make 24 mandatory script executions: dialogs,
native input, focused frame metadata, original PDF focus, phone controls,
HTTP/custom ports/TLS, permissions, files, site-data crash recovery, GET tab
restore, streamed recovery, find, embedded media, HTTP auth, native zoom,
live-tab reattachment, large raw/multipart upload and authenticated upload
retry and cold quiet-page viewport bootstrap. The driver counts completed scripts and checks the count against its
declared input list. It retains the 12 MiB CDP packet limit while discarding
unneeded duplicate request-body fields. Native server byte/hash checks prove
the original HTTP bodies remain intact. Permission grants and missing-device
assertions run only inside this isolated container. No device or host display
is exposed and no insecure TLS or disabled Chromium sandbox flag is added.

The native Ozone virtual screen is compared with an independent native target;
it need not resize with the browser window. The viewport gate separately
requires first-frame readiness without a manual corrective resize, physical
pixel bounds, native zoom and main/embedded hit testing. These checks do not
qualify real headunit display timing or protected streaming.

## Packaged UI integration gate, 0.16.0

The workflow also extracts the exact SDK-free frontend artifact and runs
`test/chromium_ui_smoke.js` with `MGU_UI_SMOKE_ROOT` pointing to its `javascript`
folder, once with `MGU_EMULATOR_LOCALE=en-GB` and once with `de-DE`. These
mandatory checks cover the native foreground API request and subsequently
observed visibility/focus alongside controller and shutdown behavior. The
The expanded UI also exercises native/phone prompts and the new browser
controls. The test supplies authored HMI/AudioManager replies; it does not claim a physical
headunit foreground or audible-speaker measurement. Existing native PCM,
video/fullscreen/controller and root-startup gates remain mandatory.

## Publication

For this runtime/frontend update publish the two new `<id>@0.16.0.tgz` files
and the generated verification/provenance/test metadata with `SHA256SUMS`.
The engine row keeps the exact public 0.1.0 URL, bytes, hash and corresponding
source/provenance from its original release. An engine change needs a new
engine version and its matching source/license material.
Drafts/prereleases are ignored by Store, so use a normal release prominently
marked experimental. Never replace a published component with different bytes
under an existing version. Keep previous assets and matching sources available.

Publish the `catalog` release's schema-2 `catalog.json` **last**. Its entries
contain exact size/hash and public versioned artifact URLs, ID7 support and the
app/runtime/engine/official-tool dependency graph. The frontend is a built OAP
package, not `build: unit`; its missing SDK is supplied locally by Deploy.
Validate using the actual updater parser and deployer. The source bundle is a
license asset, not a Store component. Verify uploaded digests.

Package acceptance uses mgu-deploy 0.7.17's external Linux fixture with simulated
manager/systemd and synthetic donor, followed by real packaged sandboxed Chromium
startup with a different app UID. It cannot qualify real-HU boot, power loss,
audio, touchpad or provider playback. See `docs/MGU_STORE.md` for the limits.


## Chinese website fonts

Runtime builds also bundle Noto Sans SC from the public Google Fonts source,
verified against the pinned SHA-256 in `release/browser_fonts.py`. A verified
local `.local/browser-fonts/NotoSansSC.ttf` can be reused for offline builds.
The runtime manifest hashes the font and its OFL notice, and runtime provenance
records the source URL, hash and license. Its `fonts.conf` adds the runtime font
directory and includes the existing engine configuration. No engine 0.1.0 bytes
are replaced. Installing the frontend alone fixes native title glyph coverage;
the runtime font bundle is required for Chinese webpage text.
