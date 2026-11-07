# Building the experimental Store release

Use a clean **Debian 12 Linux x86_64** host and an unprivileged build user.
Never build on the head unit; no vehicle connection or proprietary SDK is needed.
Install compiler dependencies separately:

```sh
sudo apt-get install python3 nodejs libnode-dev gcc musl-tools patchelf \
  chromium chromium-common chromium-sandbox fonts-dejavu-core libjpeg62-turbo-dev
python3 release/build.py --out /path/to/empty-output
MGU_OUT=/path/to/empty-frontend-output python3 tools/build_store.py \
  --app mgu_browser --version 0.11.0 --source apps/mgu_browser --release-package
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

After both packages and the updated catalog are assembled, validate them with
an independently checked-out Store source tree:

```sh
node test/store_package_smoke.js /path/to/mgu-store \
  /path/to/mgu_browser@0.11.0.tgz /path/to/mgu-browser@0.11.0.tgz \
  /path/to/catalog.json
```

This runs the real deploy artifact validator and updater catalog parser,
prepares the app with the Store's synthetic donor, loads both native modules,
and compares the packaged JavaScript with the current checkout. It does not
install anything or validate systemd/vehicle behavior.

## Publication

Publish the three `<id>@<version>.tgz` files, corresponding-source tar,
`engine-provenance.json`, test summary and `SHA256SUMS` in one versioned release.
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
