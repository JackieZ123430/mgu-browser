# Third-party notices

## Included: parse5 6.0.1

Copyright (c) 2013–2019 Ivan Nikulin. MIT license.
The original package sources, package metadata and license are in
`vendor/parse5/`; `PROVENANCE.json` records the npm source and integrity.
`src/html5_parser.js` is the bundled legacy parser and retains the MIT notice.

## External: idrive7-apps app kit

[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)
provides the app kit and emulator used for development. Its published project
code is MIT-licensed; the license is retained in `licenses/idrive7-apps-MIT.txt`
for attribution. No kit or proprietary BMW SDK payload is redistributed here.
Obtain required SDK components separately and comply with their own terms.

## Referenced: MGU-Store

[robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)
credits Robert Nisipeanu and IterioDev and licenses its own code under
GPL-3.0-or-later. This repository links to it and plans compatibility; it does
not include MGU-Store source or grant rights to it. Any future incorporation
requires its original notices and applicable license terms.

## External runtime and test dependencies

- Chromium: source and third-party license notices belong to the selected build.
- Official Google Chrome and bundled Widevine: separately installed vendor
  products. No binary, CDM, signing material or license response is included.
- libjpeg-turbo: required by the local N-API JPEG decoder. Private build scripts
  copy the installed distribution's copyright file with its local library.
- Shaka Player 5.3.3: Apache-2.0; separately obtained npm test dependency with its
  original license retained beside it. No Shaka bundle is committed here.
- Sintel/Shaka demo content and public test license server: remote test resources,
  not redistributed by this repository.
- Ubuntu font files: Ubuntu Font Licence, with original notices required for
  separately obtained inputs and private generated atlases. No font binary or
  atlas is committed here.

The project's pending license decision does not replace these licenses.
