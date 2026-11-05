# Lokal entwickeln

## Voraussetzungen und Grenzen

Die JavaScript-Kerntests benötigen Node.js und keine Fahrzeugverbindung:

```sh
node --test test/*.test.js
```

Die native Oberfläche benötigt zusätzlich ein **separat beschafftes lokales
App-Kit mit den benötigten SDK-Bestandteilen**. Ausgangspunkt ist
[idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps), initial
Commit `9b5e9cf8a49399939d51d3458fb29b6a3cec8346`. Dieses Projekt liefert weder
`kit/` noch `oap-sdk/` mit. Ein neuerer Kit-Stand muss gesondert auf Kompatibilität
geprüft werden. Eine reine Git-Kopie dieses Repositorys kann deshalb nicht ohne
weitere Voraussetzungen die vollständige native App bauen.

## Windows / WSL

Die Werkzeuge erwarten WSL mit Debian-kompatibler x86-64-Laufzeit, Node.js,
Python 3, GCC, Node-Entwicklungsheadern, Chromium und libjpeg-turbo samt Headern.
Die Vorbereitung legt den unprivilegierten Linux-Benutzer `mgu-dev` und sein
privates Verzeichnis `~/bmw-emulator` an. Der Webserver bindet nur Loopback.
Es wird dabei keine SSH-Verbindung zu einem Fahrzeug geöffnet.

Vor dem Start in PowerShell die eigenen Pfade konfigurieren:

```powershell
$env:MGU_WSL_DISTRO = 'Debian'
$env:MGU_SDK_PATH = 'C:\Projects\idrive7-apps'
powershell -NoProfile -File tools/emulator.ps1 Start
```

`MGU_SDK_PATH` muss auf das Verzeichnis mit `kit/` und `oap-sdk/` zeigen.
Der Standard ist `Desktop\idrive7-apps`. Die `.cmd`-Starter verwenden dieselben
Umgebungsvariablen. Stop und Status:

```powershell
powershell -NoProfile -File tools/emulator.ps1 Stop
powershell -NoProfile -File tools/emulator.ps1 Status
```

Oberfläche: <http://localhost:8077/?panel=bottom>. Projektpfade mit Leerzeichen
und ein anderer SDK-Stand sind für eine portable Veröffentlichung noch gesondert
zu qualifizieren. Im Beispiel werden entsprechend einfache Pfade verwendet.

## Unicode-Schriften vorbereiten

`tools/build_browser_fonts.py` benötigt Python mit Pillow und lokal bereitgestellte
Ubuntu-Regular.ttf, Ubuntu-Bold.ttf und Ubuntu-Light.ttf sowie die unveränderten
Ubuntu-Dateien LICENCE.txt und COPYRIGHT.txt. Diese Eingaben gehören unter
`.local/browser-fonts/sources/`. Schriftdateien samt zugehöriger Lizenz aus
einer offiziellen Ubuntu-/Google-Fonts-Quelle beschaffen; sie werden hier nicht
mitgeliefert. Danach im Projektverzeichnis:

```sh
python3 tools/build_browser_fonts.py
```

Das Ergebnis liegt privat unter `.local/browser-fonts`. Die Vorbereitung und
der Paketbau übernehmen die erzeugten Atlanten in die private Kit-Kopie.
Dieser Schritt ist vor dem ersten Emulatorstart erforderlich.

## Engine und Widevine

Ist der offizielle Google Chrome mit seinem gebündelten Widevine unter
`/opt/google/chrome` installiert, wählt `dev/prepare.py` ihn für den Laptop.
Andernfalls wird Debian-Chromium verwendet, ohne damit Widevine zu versprechen.
Die Installation von Chrome und der Bezug weiterer Testabhängigkeiten sind
separate Schritte aus deren offiziellen Quellen; das Repository installiert
oder verteilt keine CDM-Datei.

Der Entwicklungsstand wurde mit Chrome 157.0.8103.38, Widevine 4.10.3112.0 und
Shaka Player 5.3.3 lokal getestet. Das sind dokumentierte Testversionen,
keine Zusage für andere Versionen oder Provider.

## Native App bauen und prüfen

Mit eingerichtetem SDK-Pfad und vorbereiteten Fonts:

```sh
python tools/build_oap.py
node test/chromium_ui_smoke.js
```

Der Builder erstellt `.build/` und `dist/` lokal. Die Ergebnisse enthalten
externe Bestandteile und sind **nicht automatisch zur öffentlichen Verteilung
bestimmt**. Der Quellcode-Vorabstand enthält keinen universellen Fahrzeug-Installer.

Der Emulator synchronisiert App- und `src/`-Dateien regelmäßig in seine private
Linux-Kopie. Änderungen laden die App neu; gemeinsame Backend-Änderungen starten
zusätzlich das lokale Backend neu. Dabei endet die temporäre Browsersitzung.
Während einer Anmeldung deshalb keine unnötigen Quelländerungen vornehmen.

## Bedienung im Emulator

Mausklick und Ziehen entsprechen Touchscreen-Eingaben. `[` und `]` oder das
Mausrad drehen den Controller; Enter drückt ihn, Pfeiltasten neigen ihn.
H und O steuern Home/App-Aufruf des Emulators. Physische Zeicheneingabe ist
kein transparenter Tastaturkanal: Formulare über die native App-Tastatur bedienen.

## Integrationstests

Die vorbereitete Linux-Umgebung stellt native Decoder, private Runtime-Dateien
und den Browser bereit. Die Tests erzeugen jeweils eigene temporäre Sitzungen:

- `test/emulator_input_smoke.js`: normale Texte, Groß-/Kleinschreibung,
  Sonderzeichen, Unicode und Felder mit eigener Keydown-PIN-Verarbeitung.
- `test/emulator_backend_smoke.js`: IPC, Benutzerprüfung, echte Frames,
  Navigation, Tabs, Fokus/Heartbeat und Profilbereinigung. Der Test benötigt
  für getrennte Testbenutzer root; der Browser selbst bleibt unprivilegiert.
- `test/emulator_media_smoke.js`: Sprachwechsel, Tabzustand und selbst erzeugtes Video.
- `test/drm_engine_probe.js`: öffentlich freigegebener Shaka/Sintel-Widevine-Test.

Beispiel aus WSL, im Projektverzeichnis:

```sh
node test/emulator_input_smoke.js
MGU_EMULATOR_MODE=1 node test/emulator_media_smoke.js
```

Diese beiden Aufrufe als `mgu-dev` ausführen. Der DRM-Test erwartet zusätzlich
das unveränderte npm-Paket `shaka-player@5.3.3` samt Lizenz privat unter
`.local/drm-test/node_modules/shaka-player`. Integrität gegen die offizielle
npm-Paketmetadatei prüfen. Das Paket wird nicht aus diesem Repository geladen.

Keine Kontodaten in Tests hinterlegen. Testberichte und Screenshots bleiben
unter `.local/`; echte Provider-Logins werden manuell und separat geprüft.
