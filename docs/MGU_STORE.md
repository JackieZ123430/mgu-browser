# MGU Store repository source

Add `pllanaio/mgu-browser` as a GitHub source and select the **main branch**
(`branch:main`), rather than Releases. The root `mgu-repo.json` uses schema 1
and discovers the Browser from `apps/mgu_browser/app.json`.

The Store can now read the source and list the Browser. Its displayed version
comes from the app manifest on the selected branch. This change does not
publish the separate, newer development checkout or a Chromium binary.

## Build and dependencies

The Store invokes `tools/build_store.py` as an unprivileged Python build.
It supplies `oap-sdk` from a stock BMW donor on the owner's head unit and
sets `MGU_OUT`. The script downloads only the public idrive7-apps kit at a
pinned commit, verifies the archive SHA-256, and produces exactly one
frontend `.tgz`. It needs a working Internet uplink during this download.
No BMW SDK, account data, private fonts or browser profiles are published.
The kit's standard font atlases are used for this source-build path.
The upstream MIT notice is retained in the generated frontend package.

The Browser frontend requires the following installed components:

- `mgu-browser` runtime 0.9.2 or later, including the native helpers and
  private Chromium engine provisioned for that particular head unit;
- `mgu-uplink` 0.7.3 or later;
- `mgu-render` 0.6.11 or later;
- `mgu-deploy` 0.7.17 or later. The Store also adds its Python build requirement.

**The native runtime is not yet published as a generally installable tool
in this repository.** A clean car may therefore list the Browser and report
an unavailable runtime dependency. The manifest deliberately declares that
dependency: installing only the frontend would not create a working browser.
This source registration is not a complete native-runtime distribution or
a hardware qualification. Audio and provider playback still require their
separate integration and tests.

The build makes no SSH connection, installs nothing and requests no restart.
Installation remains the official Store/deploy tool's job.

References: [Store publishing contract](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md),
[idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps).
