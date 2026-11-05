# Third-party notices

Original MGU Browser code is MIT licensed (see `LICENSE`). Dependencies retain
their own terms; the MIT grant does not relicense fonts, libraries or the BMW SDK.

## Included: parse5 6.0.1

Copyright (c) 2013–2019 Ivan Nikulin. MIT license.
The original package sources, package metadata and license are in
`vendor/parse5/`; `PROVENANCE.json` records the npm source and integrity.
`src/html5_parser.js` is the bundled legacy parser and retains the MIT notice.

## Included frontend: idrive7-apps app kit

[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)
provides the app kit and emulator used for development. Its published project
code is MIT-licensed; the license is retained in `licenses/idrive7-apps-MIT.txt`
for attribution. The frontend includes public kit code at commit
`9b5e9cf8a49399939d51d3458fb29b6a3cec8346`, with its notice at
`javascript/kit/LICENSE.idrive7-apps`. Proprietary BMW SDK is omitted; the
Store supplies it locally from the owner's donor. Its own terms still apply.

## Referenced: MGU-Store

[robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)
credits Robert Nisipeanu and IterioDev and licenses its own code under
GPL-3.0-or-later. This repository implements its public package/IPC interfaces; it does
not include MGU-Store source or grant rights to it. Any future incorporation
requires its original notices and applicable license terms.

## Included Chromium and native dependencies

Engine 0.1.0 distributes Debian Chromium **156.0.8078.79-1~deb12u1**, resources,
sandbox and a private shared-library closure. Chromium has BSD-style terms and
many separately licensed components. `engine/licenses/` retains the installed
Debian copyright notices for every bundled package and referenced common license
texts. `engine/build-provenance.json` records versions and input/patched hashes.
LGPL/GPL dependencies remain separate programs/shared libraries under their
original licenses.

The same versioned release provides **`corresponding-source-0.10.0.tar`**:
exact matching original Debian source archives, patch archives and `.dsc` files,
plus `SOURCE_INDEX.json` with source versions and authenticated-index hashes and
sizes. It also includes runtime libjpeg-turbo and musl sources. These sources
are provided directly, rather than only linked externally. Rebuild instructions
and local ELF PT_INTERP/RPATH changes are in `release/README.md` and `build.py`.

Runtime libjpeg-turbo retains its copyright alongside the library. Launchers are
statically linked with **musl (MIT)** and retain `LICENSE.musl`; N-API modules
use the platform Node/libc dynamically. DejaVu Sans is included for Chromium,
with its terms in `fonts-dejavu-core.copyright` inside the engine.

## Included Ubuntu UI fonts

`assets/ui-fonts/` contains original Ubuntu Regular/Bold/Light TTF sources and
converted bitmap atlases named **Ubuntu derivative MGU Browser UI**. Copyright
2011 Canonical Ltd. The complete Ubuntu Font Licence 1.0, copyright and
conversion description are included there. The frontend retains the font
notices beside its atlases. These are not BMW fonts; MIT does not replace UFL.

## External test dependencies

- Official Google Chrome and bundled Widevine: separately installed vendor
  products. No binary, CDM, signing material or license response is included.
- Shaka Player 5.3.3: Apache-2.0; separately obtained npm test dependency with its
  original license retained beside it. No Shaka bundle is committed here.
- Sintel/Shaka demo content and public test license server: remote test resources,
  not redistributed by this repository.
