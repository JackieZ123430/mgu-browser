# MGU Browser 0.13.0 – Performance, dauerhafte Cookies und Handy-Fernbedienung

Die Eingaben sind auf Commit `9c1433a` gesperrt (`publication.json`,
`source-inputs.json`). Sobald dieser Ordner auf `main` landet, baut, prüft und
veröffentlicht der Workflow „Publish audited Browser release“ die Pakete und
schaltet danach den Store-Katalog um. Vorher ist im Store nichts zu sehen.

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
- Native JPEG-Dekodierung: ~1,2–1,3 ms pro 1280×384-Frame (unveränderter, geprüfter Decoder aus 0.10.0).
- Werbe- und Trackerblocker (Einstellungen, standardmäßig ein): bekannte
  Werbe-/Analyse-Hosts werden gar nicht geladen.
- Hintergrund-Tabs werden eingefroren (Skripte/Timer stehen), außer sie
  spielten beim Verlassen Audio/Video. Seiten erhalten
  `prefers-reduced-motion`, was Animationen und Bildaktualisierungen spart.
- Backend-Dienst: CPUQuota 300 %, Nice 0 (vorher 200 %, Nice 10).
- Frontend und Laufzeit handeln das Bildformat aus: Ein Update in beliebiger
  Reihenfolge zeigt nie ein schwarzes Bild.

## Handy-Fernbedienung

Einstellungen → „Mit Handy steuern (QR)“. Live-Bild, Tippen, Scrollen,
Text/Passwörter eingeben, Links senden, Tabs wechseln. Details und
Sicherheitsmodell: [docs/REMOTE.md](../../docs/REMOTE.md).
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
- `test/chromium_remote_smoke.js`: echter Chromium-Lauf der Handy-Fernbedienung
  (Token, Live-Bild, Tippen, Unicode-Text, nur HTTPS), eingefrorene
  Hintergrund-Tabs und Werbeblocker.
- QR-Codes der Versionen 1–10 wurden mit einem unabhängigen Decoder (OpenCV)
  geprüft, auch aus dem gerenderten iDrive-Panel.
