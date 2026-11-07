# MGU Browser 0.13.0 – Performance und dauerhafte Cookies

Noch nicht veröffentlicht. Die Store-Pakete entstehen wie bisher über
`release/build.py` und den Publish-Workflow; dieser Quellstand enthält keine
gebauten Artefakte.

## Darstellung und Bedienung

- Bildrate des Screencasts von höchstens ~14 fps (feste 70-ms-Drossel) auf
  30 fps angehoben.
- „Neuestes Bild gewinnt“: Ein Frame wird beim Start der Dekodierung bestätigt,
  Chromium kodiert den nächsten parallel. Veraltete Frames werden verworfen.
- Nur geänderte Bildzeilen werden übertragen (Backend → App → Renderer über
  `X_PIXELS`-Teilrechtecke). Unveränderte Bilder werden gar nicht gesendet.
  Gemessen mit echtem Chromium: 30,5 fps, 10–17 % der bisherigen Pixeldaten
  bei einer kleinen Animation.
- Keine Pufferkopien mehr pro Frame (IPC-Schreiben ohne `Buffer.concat`,
  CDP-Empfang ohne wiederholtes Zusammenfügen großer Nachrichten).
- Nativer JPEG-Decoder ohne „fancy upsampling“: ~1,3 ms pro 1280×384-Frame.
- Touch-Scrollen fasst Bewegungen zusammen statt Dutzende CDP-Aufrufe zu
  stapeln; Smooth-Scrolling ist abgeschaltet (keine Zwischenframes).
- Größerer Disk-/Medien-Cache, weniger unnötige Chromium-Hintergrunddienste,
  begrenzte Renderer-Prozesse.

## Cookies und Website-Daten

- Cookies, Cookie-Einwilligungen und Logins bleiben jetzt **ohne
  Masterpasswort** erhalten. Website-Daten sind mit einem gerätegebundenen
  AES-256-GCM-Schlüssel (`site-key.bin`, 0600, Dienstkonto) verschlüsselt.
  Das Masterpasswort schützt weiterhin den Passworttresor.
- „Angemeldet bleiben“ ist standardmäßig eingeschaltet. Gespeicherte
  Einstellungen aus 0.12 (Standard „Aus“) werden einmalig auf „Ein“
  migriert; eine danach getroffene Wahl bleibt erhalten.
- Cookies werden laufend gesichert (alle 10 s bei Änderungen, 2,5 s nach
  einer Eingabe, 3 s nach dem Laden einer Seite und beim Beenden). Damit
  überleben sie Zündung aus, Stromverlust und einen erzwungenen Abbruch.
  Mit echtem Chromium per SIGKILL der Engine geprüft.
- `--password-store=basic` macht die Chromium-Cookieverschlüsselung
  unabhängig von einem nicht vorhandenen Desktop-Schlüsselbund.
- Ein beschädigtes Archiv blockiert den Browserstart nicht mehr; es wird als
  `sessions.bin.damaged` beiseitegelegt.

## Tests

- `npm test`: neue Tests für Frame-Delta, Band-Wiederaufbau, Renderer-Upload,
  CDP-Parser und Cookie-Persistenz.
- `test/chromium_persistence_smoke.js`: echter Chromium-Lauf mit hartem
  Engine-Abbruch und Bildratenmessung.
