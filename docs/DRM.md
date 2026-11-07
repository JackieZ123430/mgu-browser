# DRM and an administrator-provisioned Widevine CDM

The public Chromium engine **0.1.0 contains no Widevine CDM**. Chromium's EME
API and H.264/AAC decoders are present; a proprietary key system is a separate
component. The default local check on Chromium 156 returns
`com.widevine.alpha: NotSupportedError`, while the standards ClearKey key system
is accepted. An account with a streaming provider does not install a CDM.

The browser can now register an **already authorized, separately provisioned
Linux x86_64 CDM directory** at the next engine start. It never downloads,
extracts, redistributes, patches or decrypts a CDM. Only use a module whose
license permits the intended installation and use. Device integration and
provisioning remain subject to Google's and the content provider's requirements.

## Headunit configuration

An administrator supplies the CDM outside the browser's temporary `work`
filesystem and creates this root-owned file:

`/var/opt/mgu-browser/cdm.json`

```json
{"directory":"/var/opt/mgu-browser-cdm/authorized-version"}
```

The configuration and module must be readable by backend UID 3911; root-owned
0644 files and 0755 directories are sufficient. A root-only 0600 configuration
will be rejected by the unprivileged runtime.

The supplied directory must contain its original `manifest.json` and
`_platform_specific/linux_x64/libwidevinecdm.so`. Every path component, the
manifest, library and configuration must be root-owned, without symlinks or
group/world write permission. The manifest must declare the version, CDM
module/interface/host versions and a compatible platform. The runtime checks
ELF format and x86_64 architecture without executing the library in Node.
Chromium performs the actual CDM ABI and loading checks in its existing sandbox.
These file checks do not authenticate a vendor signature or establish license
rights; provisioning is an administrator action.

Close the browser and restart its backend after changing the configuration.
No filename, native-library path or launch argument is accepted through the
website or app IPC. Deleting `cdm.json` disables the optional registration at
the next browser start. The Store's engine directory stays unchanged, so
installing or rolling back the Chromium engine does not overwrite the separate
module. The module needs its own authorized update process.

On a development laptop, an explicit `MGU_BROWSER_CDM_DIRECTORY` selects the
already provisioned directory for the emulator and the probes below. Its files
may belong to the current development user or root, with the same no-write and
no-symlink requirements. This environment variable is not a headunit app setting.

## What the browser checks

On Linux, Chromium discovers CDMs before locking down its zygote sandbox.
The runtime writes Chromium's fixed
`WidevineCdm/latest-component-updated-widevine-cdm` JSON hint into the new private
profile, pointing at the validated directory. It replaces a restored hint with
an empty selection if no directory is configured. It neither copies a native
module into the profile nor disables the sandbox or TLS verification.

The media check calls `requestMediaKeySystemAccess` and **`createMediaKeys`**.
Its result distinguishes:

- `no-cdm`, `configured`, or `configuration-rejected`: local provisioning state.
- `recognized`: the browser created a Widevine `MediaKeys` object.
- `unavailable`, `eme-unavailable`, `insecure-context`, or `timed-out`: capability
  check result, with a fixed DOM exception name when available.

The app does not receive native-library paths or page-provided error messages.
`protectedPlaybackVerified` remains false in a capability result. Creating
`MediaKeys` does not test a license, decryption, provider account, video output,
hardware robustness, HDCP, VMP, or vehicle speaker output.

## Local diagnostic and optional public test playback

```sh
node test/drm_engine_probe.js
node test/drm_engine_probe.js --require-widevine
```

The default probe serves its own loopback page, creates a fresh profile and
prints capabilities. It does not contact a license service. The second command
fails if a Widevine `MediaKeys` object cannot be created. Select an installed
browser with `MGU_BROWSER_BINARY` or the probe's positional binary argument.

An explicitly requested public Shaka/Sintel encrypted playback test is available
when an authorized CDM and a local official Shaka compiled player have already
been provided:

```sh
MGU_BROWSER_CDM_DIRECTORY=/absolute/authorized/cdm \
MGU_SHAKA_SCRIPT=/absolute/public/shaka-player.compiled.js \
MGU_DRM_OUTPUT=/absolute/diagnostic-output \
node test/drm_engine_probe.js --playback
```

Only `--playback` contacts the official public Shaka/Sintel stream and test
license endpoint named in `test/drm_fixture.html`. It requires advancing playback,
decoded frames, a successful license response, usable key status and nonblank
projected pixels before marking that particular test successful. It records no
license payloads, content keys or provider credentials. It has **not** been run
with an authorized CDM in this environment; no module is installed here.

`node test/chromium_drm_smoke.js` verifies local EME diagnostics and HTML/WebAudio
activity across tabs without a proprietary module or external service. Its
ClearKey check establishes API support, not protected subscription playback.

## Sources and remaining compatibility limits

- [Google Widevine overview](https://developers.google.com/widevine/drm/overview)
  lists Chromium and Linux Chrome among supported platforms and directs device
  integration/provisioning questions to Google.
- [Chromium CDM registration](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/media/cdm_registration.cc)
  describes Linux pre-zygote loading, bundled/component selection and manifest
  validation. These upstream paths can depend on build flags; the installed
  engine must still pass the actual capability check.
- [Chromium Linux hint implementation](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/media/component_widevine_cdm_hint_file_linux.cc)
  defines the `Path` hint. This integration uses that mechanism rather than
  Electron-specific command-line switches.
- [Shaka DRM configuration](https://shaka-project.github.io/shaka-player/docs/api/tutorial-drm-config.html)
  explains license server configuration and failures when a requested security
  level exceeds the browser's capabilities.

A service may reject the device, browser build, capture path, security level or
license request even after the CDM is recognized. Software CDM registration
adds no hardware-backed DRM or device certification. Provider compatibility and
real MGU playback still require separate, authorized testing.
