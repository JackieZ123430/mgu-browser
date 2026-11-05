# Building the experimental Store release

Use a clean **Debian 12 Linux x86_64** host and an unprivileged build user.
Never build on the head unit; no vehicle connection or proprietary SDK is needed.
Install compiler dependencies separately:

```sh
sudo apt-get install python3 nodejs libnode-dev gcc musl-tools patchelf \
  chromium chromium-common chromium-sandbox fonts-dejavu-core libjpeg62-turbo-dev
python3 release/build.py --out /path/to/empty-output
MGU_OUT=/path/to/empty-frontend-output python3 tools/build_store.py \
  --app mgu_browser --version 0.10.0 --source apps/mgu_browser --release-package
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
