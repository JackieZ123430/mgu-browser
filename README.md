# MGU Browser

Ein experimenteller Browser für BMW MGU / iDrive 7: eine native, mit dem
iDrive-Controller bedienbare Oberfläche und eine getrennte Chromium-Engine
für echtes HTML, CSS und JavaScript.

**Version 0.10.0 – experimentelle Store-Pakete für MGU / iDrive 7, x86_64.**
Oberfläche, native Runtime und eine private Chromium-Engine werden gemeinsam
über einen Store-Katalog verteilt. Der eigene Code steht unter MIT.
**Die BMW-Lautsprecherausgabe ist noch nicht angebunden. YouTube- und
Abonnement-Streaming sind noch nicht als funktionierend bestätigt.**
Die Veröffentlichung ist ein Entwicklungsstand, keine Freigabe für alle
MGU-Firmwarestände. Geprüfte Bereiche und offene Punkte stehen unter [Tests](docs/TESTING.md).

[Headunit-Vorbereitung](docs/HEADUNIT_READINESS.md) · [Installationsplan](docs/INSTALLATION_PLAN.md) ·
[English overview](README.en.md) · [Roadmap](docs/ROADMAP.md) ·
[Entwicklung](docs/DEVELOPMENT.md) · [Architektur](docs/ARCHITECTURE.md) ·
[Credits](CREDITS.md) · [Drittanbieter](THIRD_PARTY_NOTICES.md)

## Installation und Updates über den MGU Store

`pllanaio/mgu-browser` als GitHub-Quelle hinzufügen und **Releases** auswählen.
Bei einer bereits angelegten Quelle auf `main` für die vollständigen Binärpakete
auf **Releases** wechseln. Anschließend den Browser installieren. Der Katalog
verknüpft die Pakete und ihre Abhängigkeiten:

| Paket | Version | Inhalt |
| --- | --- | --- |
| Browser | 0.10.0 | Native Oberfläche, iDrive-Bedienung, Tabs, Einstellungen |
| Browser Runtime | 0.10.0 | Backend, native IPC-/Bildmodule, begrenztes Profil-Dateisystem |
| Chromium Engine | 0.1.0 | Debian Chromium 156.0.8078.79 mit privaten Bibliotheken und Sandbox |

MGU Deploy, Renderer und Internet uplink kommen aus der offiziellen Store-Quelle.
Für Installation/Updates ausreichend freien persistenten Speicher vorhalten
(empfohlen mindestens 2 GiB), das Fahrzeug abstellen und stabil versorgen.
Bei der ersten Installation kann der Store einen Headunit-Neustart verlangen.
Details, Rückkehr und Grenzen: [MGU Store](docs/MGU_STORE.md).

Keine BMW-SDK-Dateien, SSH-Schlüssel, Profile, Cookies oder Widevine-CDMs werden
mitgeliefert. Das SDK ergänzt der Store aus der jeweiligen eigenen Headunit.
Die Release-Datei mit korrespondierenden Drittanbieterquellen gehört zu den
Lizenzunterlagen; sie muss nicht auf dem Fahrzeug installiert werden.

## Danke an die Projekte, die das ermöglichen

- **[cauliflowermossgrape und das idrive7-apps-Team](https://github.com/cauliflowermossgrape/idrive7-apps)**:
  Das App-Kit, der native Zeichenablauf, die Controller-Anbindung und der
  SDK-App-Emulator bilden die Entwicklungsgrundlage dieses Browsers.
- **[Robert Nisipeanu, IterioDev und die Mitwirkenden von MGU-Store](https://github.com/robertnisipeanu/mgu-store)**:
  Der Store schafft die Infrastruktur für App-Verteilung, Updates, Rendering
  und Internetzugang. Die Paketinstallation verwendet dessen Deploy-/Katalogformat;
  der Browser verwendet den gemeinsamen Internet uplink.

Dies ist ein eigenständiges Community-Projekt von
[Leon Pllana](https://github.com/pllanaio), kein offizielles BMW-Produkt.
Die Verlinkungen bedeuten keine Freigabe oder Unterstützung durch die genannten
Teams. Ausführliche Zuordnung und Lizenzhinweise stehen in [CREDITS.md](CREDITS.md).


## Grundlage und Prüfstand

Die Prüfung hat Profil-I/O, Lösch-/Neustart-Rennen, Prozessende, begrenzte
Metadaten, Datenmengen und Medien-Fokus überarbeitet. Sechs historische
Fahrzeug-Einstiegsskripte wurden stillgelegt. Die neue lokale Vorbereitung
erzeugt weiterhin ein separates Quell-Prüfpaket. Die Store-Veröffentlichung
hat einen eigenen Paketbau unter `release/`, SHA-256-Prüfsummen und einen
Katalog. Die Basis 0.9.1/Runtime 0.9.2 wurde auf der eigenen ID7-Headunit mit
Webseiten und iDrive erprobt. Die neue Paketintegration muss davon getrennt
bewertet werden; Audio, DRM, physische Touchpad-Gesten und Fahrzeug-Lebenszyklus
bleiben offen.

Die automatisierten Ergebnisse und ihre Grenzen stehen unter
[Tests](docs/TESTING.md). Ein Quellcode-Audit ersetzt keinen Hardwaretest und
belegt keine Fehlerfreiheit. Die echte Chromium-Prüfung der neuen Player-Auswahl
ist durch die zusätzliche Audit-Isolation blockiert und noch offen.

## Was der Browser heute kann

### Echte Webseiten und eine native Browserleiste

Webseiten laufen in einer echten Chromium-Sitzung, nicht in einer selbst
geschriebenen HTML-Textansicht. Die App zeigt die gerenderten Seitenbilder
innerhalb ihrer nativen Oberfläche. Die gesamte Fläche unterhalb der
iDrive-Statusleiste wird genutzt; die störende zusätzliche linke Zurück-Spalte
wird durch das App-Layout nicht benötigt.

Die kompakte Leiste enthält Zurück, Vorwärts, Startseite, Neu laden beziehungsweise
Laden abbrechen, Adresse, Lesezeichen, Verlauf, Seitensteuerung, Einstellungen,
Lesemodus und Schließen. Die Adressanzeige folgt auch Navigationen innerhalb
einer Website. Ein Domainname erhält automatisch HTTPS; freier Text wird als
Suchanfrage geöffnet.

### Tabs, Startseite und eigene Seiten

- Bis zu **acht Tabs** öffnen, auswählen und einzeln schließen.
- Tabs behalten ihren eigenen Seitenzustand, JavaScript-Kontext und Verlauf.
  Sie teilen sich ein Browserprofil und dessen Cookies; es sind keine
  voneinander isolierten Kontocontainer.
- Drehen und Drücken wechselt auch zwischen nativen Tab-Bedienelementen.
- Beim Schließen des letzten Tabs erscheint ein neuer leerer Tab.
- Eine eigene Startseitenadresse lässt sich in den Einstellungen festlegen.
  Ohne feste Startseite erscheinen häufig besuchte Seiten, Lesezeichen und Verlauf.
- Lesezeichen, Besuchsübersicht, Startseite und Darstellungseinstellungen
  werden lokal gespeichert.
- **X in der Browserleiste beendet die Browsersitzung und verlässt die App.**

### iDrive, Touch und Texteingabe

| Eingabe | Verhalten |
| --- | --- |
| Drehen | Native Schaltflächen oder fokussierbare Website-Elemente auswählen |
| Drücken | Auswahl aktivieren |
| Controller nach links | Zur Browserleiste beziehungsweise zu den Tabs zurückkehren |
| Nach oben/unten neigen | In der aktiven Webseite scrollen |
| Nach rechts neigen | Tastatur für das ausgewählte Webseitenfeld öffnen |
| Touchscreen | Schaltflächen und Webseiten direkt bedienen; Wischen scrollt |

Die **Adressleiste selbst** öffnet die seitliche Tastatur. Es gibt keinen
zusätzlichen Knopf „URL eingeben“. Dieselbe native Tastatur unterstützt
Webseitenformulare, maskierte Passworteingaben sowie Buchstaben, Zahlen und
Sonderzeichen. Controller und Touch können zur Zeichenauswahl verwendet werden.
ASCII-Eingaben erzeugen Tastaturereignisse, damit auch Felder mit eigener
Tastenverarbeitung erreichbar sind; Unicode-Zeichen verwenden Texteingabe.

Die Touchfläche des realen iDrive-Controllers ist ein gesondertes Vorhaben:
**Cursorsteuerung, Tippen zum Klicken und Zwei-Finger-Scrollen auf dieser
Touchfläche sind noch nicht nachgewiesen.** Touchscreen-Bedienung und das
Mausmodell des Emulators ersetzen diesen Hardwaretest nicht.

### Darstellung, Sprache und Zeichensatz

- Seitenzoom mit 100, 125 und 150 Prozent.
- Lesemodus sowie optional automatisch ausgeblendete Browserleiste.
- Systemsprache über die SDK-Schnittstelle `CurrentVehicleUnits`, einschließlich
  Sprachwechselereignissen; im Laptop-Emulator über die Anzeigesprache des Starters.
- App-Texte derzeit Deutsch und Englisch; andere Systemsprachen erhalten
  überwiegend englische Ersatztexte; noch fehlende dynamische Übersetzungen können Deutsch bleiben.
- Tastaturlayouts für Deutsch, Englisch, Französisch, Spanisch, Italienisch und Russisch.
- Unicode-Schriftatlanten für zusätzliche lateinische, griechische und kyrillische
  Zeichen, einschließlich ä, ö, ü und ß.
- Chromium-Sprache, `Accept-Language` und regionale Browserformate folgen dem Sprachcode.

Die Schriftatlanten basieren auf Ubuntu-Schriften. Es werden keine BMW-Schriften
aus der Headunit extrahiert oder mit diesem Repository verteilt.

### Netzwerk und mobiler Hotspot

Die App besitzt eine vorbereitete Einstellungsoberfläche für SSID, maskiertes
WPA-Passwort, Verbinden, Wiederverbinden und einen HTTPS-Erreichbarkeitstest.
Die vorbereitete Netzsuche liefert SSID, Signalstärke und Verschlüsselung;
Auswahl eines Netzes übernimmt dessen Namen in die Verbindungseinstellungen.

Der dazugehörige eng begrenzte Unix-Socket-Dienst und der Scan-Parser sind im
Quellcode enthalten und mit Testdaten geprüft. **Die neue Netzwerkoberfläche
und der neue Dienst sind noch nicht auf einer echten Headunit installiert
und qualifiziert.** Der Laptop-Emulator verwendet die Internetverbindung des
Laptops und scannt keine Fahrzeugantenne.

MGU-Store bietet inzwischen bereits einen gemeinsamen Internet-Uplink.
Dessen Wiederverwendung und die Vermeidung konkurrierender WLAN-Konfigurationen
gehören ausdrücklich zur Integrationsplanung.

## Video und geschützte Inhalte: genauer Teststand

Im **Laptop-Backend** ist Videowiedergabe aktiviert. HTML-Video-Vollbild nutzt
die ganze Displayfläche, auch den Bereich der sonst sichtbaren Statusleiste.
`object-fit: contain` erhält das vollständige Bild ohne Abschneiden. Bei
abweichenden Seitenverhältnissen können Balken bleiben.

Im Vollbild haben erkannte Website-Steuerungen Vorrang. Drehen/Drücken bedient
dann die Seite; eine zweite Browser-Kontrollleiste wird nicht eingeblendet.
Die Erkennung berücksichtigt HTML-Video-Controls und gängige beschriftete
Player-Schaltflächen. Ungewöhnliche Player können weitere Anpassungen benötigen.
Ohne eigene Website-Steuerung bleiben native Fallback-Aktionen verfügbar: Wiedergabe/Pause,
zehn Sekunden zurück/vor, Stumm/Ton und Vollbild verlassen. Drehen wählt,
Drücken aktiviert; links/rechts neigen spult. Die Bedienung erscheint bei
Controller-Aktivität und bleibt bei Pause sichtbar.

Die lokale Linux-Engine kann den offiziellen Google-Chrome-Build mit seinem
unveränderten Widevine-CDM verwenden. Als technische Basis wurden eine
Widevine-Lizenzantwort, nutzbare Schlüssel, dekodierte Frames und sichtbare
Bilder eines öffentlich freigegebenen **Sintel/Shaka-Teststreams** geprüft.
Das ist kein Nachweis der Unterstützung jedes Abonnementdienstes.

| Dienst / Funktion | Tatsächlich geprüfter Stand |
| --- | --- |
| Eigenes HTML-Video | Wiedergabe, Vollbild und Controller-Aktionen im Emulator geprüft |
| Öffentlicher Widevine-Teststream | Verschlüsselte Wiedergabe in isolierter lokaler Chrome-Sitzung bestätigt |
| YouTube | Direktzugriff vorhanden; umfassender Wiedergabe- und Audiotest offen |
| Netflix | Anmeldeseite erreichbar; allgemeiner Fehler nach E-Mail-Eingabe, noch vor dem Passwortschritt |
| Disney+ | Anmeldung bleibt nach vollständigem App-/Engine-Neustart erhalten. Bild/Vollbild funktionieren. Zuverlässige Auswahl der eigenen Player-Buttons per iDrive ist noch nicht bestätigt; der letzte sichtbare Test blieb auf „Zurück“. |
| Prime Video | Direktzugriff vorhanden; angemeldete Wiedergabe noch nicht geprüft |
| Paramount+ | Direktzugriff vorhanden; angemeldete Wiedergabe noch nicht geprüft |
| Fahrzeuglautsprecher | Audio-Routing und hörbare Wiedergabe auf der MGU noch nicht bestätigt |
| Geschützte Wiedergabe auf echter MGU | Nicht bestätigt; Laptop-Ergebnisse sind nicht auf die Headunit übertragbar |

**Die Headunit-Quellkonfiguration in `backend/server.js` aktiviert Medien jetzt
mit `mediaDisabled: false`.** Damit entfallen die vom optionalen Sperrmodus
ausgelöste Medien-CSP, das pauschale Abfangen von Media-Anfragen und die Sperre
der Videoaktionen. Diese Quelländerung ist noch nicht auf der realen Headunit
installiert oder dort getestet. Sie liefert keine fehlenden Codecs, keine
Widevine-Komponente und keine BMW-Audio-Anbindung nach.
Diese Veröffentlichung ändert weder Fahrzeugcodierung
noch Firmware. Chrome, Widevine und SDK-Binaries werden nicht mitgeliefert und
nicht in ein öffentliches `.mgu`-Paket kopiert.

## Architektur und Datenschutz

Die native App spricht über einen privaten Unix-Socket mit einem getrennten
Backend. Linux `SO_PEERCRED` begrenzt den Zugriff auf den vorgesehenen Benutzer.
Chromium läuft unprivilegiert mit aktivierter Sandbox. CDP verwendet geerbte
Pipes, keinen öffentlich erreichbaren Debugging-Port. TLS-Prüfungen bleiben aktiv.
Ein nativer JPEG-Decoder überträgt gerenderte Frames an den SDK-Renderer.

Fokusverlust beziehungsweise ein ausgefallener App-Heartbeat beendet die Sitzung.
Aktive Chromium-Profile sind temporär; seit 0.9.0 können sie beim sauberen
Beenden **verschlüsselt gesichert und beim nächsten Start wiederhergestellt**
werden. „Angemeldet bleiben“ und „HTTP-Cache behalten“ sind getrennte,
anfangs deaktivierte Einstellungen. Wiederhergestellt werden unter anderem
Cookies einschließlich Session-Cookies, Local Storage und sonstiger Website-Speicher.
Anbieter können eine Sitzung weiterhin ablaufen lassen oder erneut prüfen.

Unter **Datenschutz & Logins** lassen sich Website-Daten mit Abmeldung,
HTTP-Cache und App-Verlauf getrennt löschen; die Verlaufsaufzeichnung ist
abschaltbar. Bekannte Token-/Anmeldeparameter werden aus Verlauf-URLs entfernt.
Lesezeichen und App-Verlauf bleiben eigenständige lokale App-Daten.

Die integrierte Passwortverwaltung bietet bewusst ausgelöstes Speichern aus
einem ausgefüllten Formular, Ausfüllen auf exakt demselben HTTPS-Ursprung und
Löschen einzelner Zugänge. Sie sendet das Anmeldeformular nicht automatisch ab
und speichert keine Passwörter ungefragt. Seitenübergreifende oder mehrstufige
Formulare und Frames benötigen weitere Arbeit.

**Laptop:** Windows DPAPI schützt den lokalen Speicherschlüssel; Sitzungsarchiv
und Passworttresor werden mit AES-256-GCM verschlüsselt.
**MGU-Backend:** derselbe Speicher hat einen plattformunabhängigen
Masterpasswort-Modus mit PBKDF2-SHA256, zufälligem Salt und 600.000 Iterationen.
Das Masterpasswort wird maskiert eingerichtet und nach Backend-Neustart erneut
zum Entsperren benötigt. Dieser Code ist für die Headunit vorgesehen, aber
noch nicht auf deren realer Laufzeit qualifiziert.

Die Sicherung ist auf 64 MiB Profildaten und 16 MiB je Datei begrenzt. Eigene
Chromium-Passwort- und Verlaufsdatenbanken werden nicht archiviert. Ein harter
Stromverlust oder Absturz kann Änderungen seit dem letzten sauberen Beenden
verlieren; eine konsistente periodische Sicherung ist noch offen.
Details: [Architektur](docs/ARCHITECTURE.md) und [Sicherheit](SECURITY.md).

## Entwicklung und Mitarbeit

Der lokale SDK-App-Emulator bildet Zeichenprotokoll, App-Fläche und
Controller-Eingaben nach. Er emuliert weder die komplette BMW-Firmware noch
BMW-Medienplayer, Audio-Routing oder sämtliche Fahrzeugdienste.

Der Einstieg und die Voraussetzungen stehen in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Proprietäre SDK-Bestandteile und
lokale Build-Abhängigkeiten müssen separat bereitgestellt werden.

```sh
node --test test/*.test.js
```

Nach dem privaten SDK-Paketbau prüft `node test/chromium_ui_smoke.js` die native
Oberfläche. Zusätzliche WSL-Integrationstests prüfen Engine, Medien, Formulare
und Widevine mit eigenen temporären Sitzungen. Sie benötigen die vorbereitete
lokale Umgebung und sind keine Fahrzeugtests.

Die [Roadmap](docs/ROADMAP.md) beschreibt konkret, was geplant oder gewünscht
ist: zuverlässiges Streaming, Fahrzeug-Audio, echte Touchpad-Gesten,
Spracheingabe, bessere Leistung und weitere Hardware-Qualifikation der
MGU-Store-Verteilung. Ideen sind keine Zusage fertiger Funktionen.

Für Fehlermeldungen bitte Version, Emulator oder reale MGU, reproduzierbare
Schritte und bereinigte Fehlermeldung angeben. Keine Zugangsdaten, VINs,
Privatschlüssel oder unbereinigten Browserprofile in Issues einstellen.

## Inhalt und Lizenzstand

Veröffentlicht werden Browser-Quellen, native Hilfsprogramme, Store-Pakete
mit Chromium, Lizenzunterlagen, Tests und Build-/Emulatorwerkzeuge. Nicht enthalten sind
Firmware-Dumps, BMW-SDK-Dateien, Schlüssel, WLAN-Profile, Kontodaten,
Browsersitzungen, Diagnosemitschnitte oder Widevine-CDMs.

Der eigene Projektcode steht unter **MIT** und darf entsprechend genutzt und
weiterentwickelt werden. Drittanbieter behalten ihre jeweiligen
Lizenzen; siehe [LICENSE](LICENSE), [LICENSE.md](LICENSE.md) und
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
