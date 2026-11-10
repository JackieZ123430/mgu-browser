[English](README.md) | [简体中文](README.zh-CN.md) | Deutsch

# MGU Browser

Ein experimenteller Browser für BMW MGU / iDrive 7: eine native, mit dem
iDrive-Controller bedienbare Oberfläche und eine getrennte Chromium-Engine
für echtes HTML, CSS und JavaScript.

**Version 0.16.0 – experimentelle Store-Pakete für MGU / iDrive 7, x86_64.**
Oberfläche, native Runtime und eine private Chromium-Engine werden gemeinsam
über einen Store-Katalog verteilt. Der eigene Code steht unter MIT.
**Die BMW-Audioanbindung ist implementiert, aber mit diesem Browserstand noch
nicht auf einer echten Headunit hörbar getestet. Geschützte Streams benötigen
ein separat autorisiert bereitgestelltes Widevine-Modul; Anbieterwiedergabe
ist nicht bestätigt.**
Die Veröffentlichung ist ein Entwicklungsstand, keine Freigabe für alle
MGU-Firmwarestände. Geprüfte Bereiche und offene Punkte stehen unter [Tests](docs/TESTING.md).

[Headunit-Vorbereitung](docs/HEADUNIT_READINESS.md) · [Installationsplan](docs/INSTALLATION_PLAN.md) ·
[English](README.md) · [简体中文](README.zh-CN.md) · [Roadmap](docs/ROADMAP.md) ·
[Entwicklung](docs/DEVELOPMENT.md) · [Architektur](docs/ARCHITECTURE.md) ·
[Credits](CREDITS.md) · [Drittanbieter](THIRD_PARTY_NOTICES.md)

## Installation und Updates über den MGU Store

`pllanaio/mgu-browser` als GitHub-Quelle hinzufügen und **Releases** auswählen.
Bei einer bereits angelegten Quelle auf `main` für die vollständigen Binärpakete
auf **Releases** wechseln. Anschließend den Browser installieren. Der Katalog
verknüpft die Pakete und ihre Abhängigkeiten:

| Paket | Version | Inhalt |
| --- | --- | --- |
| Browser | 0.16.0 | Native Oberfläche, iDrive-Bedienung, Tabs, Einstellungen |
| Browser Runtime | 0.16.0 | Backend, native IPC-/Bildmodule, begrenztes Profil-Dateisystem |
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
belegt keine Fehlerfreiheit. Die neue Prüfung verwendet eine echte sandboxed Chromium-Sitzung für Eingabe,
Pop-ups, Video und Audio-Ausgabe in einen lokalen Testsink. Der genaue Umfang
und die Grenzen stehen im [aktuellen Testbericht](docs/TESTING.md).

## 0.16.0: Browser-Funktionen und Desktop-Kompatibilität

**Browser und Browser Runtime gemeinsam auf 0.16.0 aktualisieren; Engine bleibt
0.1.0.** Chromium läuft nun im normalen Browsermodus mit seinem eigenen
Ozone-Offscreen-Display. User-Agent und Client Hints stammen unverändert aus
der echten Engine; WebGL zeichnet über den vorhandenen Software-Renderer.
`navigator.webdriver` bleibt wahr. Das ist keine Tarnung und garantiert weder
CAPTCHA-Freiheit noch Netflix-, Disney+- oder Widevine-Wiedergabe.

| Bereich | Stand und Grenze |
| --- | --- |
| Webseiten | HTTP/HTTPS und eigene Ports; normale native Netzwerkabläufe und Hintergrundtabs. Zertifikatsprüfungen bleiben aktiv. |
| Eingabe | Native Browser-Ereignisse für Formulare, Auswahllisten, Datum/Zeit, mehrzeiligen Text, Modifikatoren, Auswahl, Kopieren/Einfügen, Drag und Scrollen; große Texte werden begrenzt in Blöcken übertragen. |
| Seitendialoge | Alert, Bestätigung, Texteingabe und Verlassen-/Schließen-Rückfrage; Ablehnen erhält den ursprünglichen Tab. |
| Anmeldung | Native HTTP-Basic-/Digest-Challenges mit ausdrücklicher Antwort; Origin, Realm und aktueller Tab/Rahmen werden gebunden. Chromiums Grenzen für Cross-Site-Anmeldeaufforderungen bleiben bestehen. |
| Seitensuche | Treffer in Dokument, Shadow Roots und eigenen Frames; Weiter/Zurück und Groß-/Kleinschreibung ohne Zerstören der vorhandenen Textauswahl. |
| Zoom | Nativer Chromium-Zoom 100/125/150 %, mit unveränderter physischer Bildauflösung und angepassten Treffern/Scrollpunkten, auch in eigenen Cross-Site-Frames. |
| Dateien | Downloads im Browser und Abruf über die gekoppelte Telefonseite; Website-Dateiauswahl nimmt ausdrücklich bestätigte Telefon-Uploads an, auch in getrennten Cross-Site-Frames. Kein beliebiger Zugriff auf Headunit-Dateipfade. |
| Berechtigungen | Native Chromium-Zustände und explizite Entscheidungen je Website/Frame; vorhandene Kamera, Mikrofon, Standort oder Benachrichtigungs-Hardware werden dadurch nicht erzeugt. |
| Speicherung | Verschlüsselte Cookies und Website-Daten; lokale Tests decken localStorage, IndexedDB, CacheStorage und Service-Worker-Registrierung ab. Profil-Tabs werden als höchstens acht GET-Adressen samt aktivem Tab wiederhergestellt. |
| Medien | Die bisherigen nativen JPEG-, Vollbild-, Video- und PCM-Funktionen bleiben enthalten. BMW-Lautsprecher und geschützte Anbieterstreams benötigen weiterhin getrennte Nachweise. |
| Desktop-Grenzen | Kein Erweiterungsmanager, Druckdialog oder vollständiges Desktop-Dateisystem. Formulare, POST-Anfragen und JavaScript-Zustand werden durch URL-Tab-Restore nicht wiederhergestellt. |

Dateien liegen privat unter dem Browser-Datenverzeichnis: höchstens 32 MiB je
Download und 64 MiB behaltene Downloads; Uploads höchstens 16 MiB je Datei und
32 MiB gleichzeitig bereitgestellte Daten, mit begrenzter Anzahl. Transfers
benutzen die authentifizierte lokale Telefonverbindung. Downloads werden bei
bekannter Übergröße beziehungsweise bei Fortschritts-/Dateiprüfungen abgebrochen;
zwischen diesen Prüfungen sind kurzfristige Überschreitungen möglich.

Das Profil-Dateisystem bleibt auf 384 MiB begrenzt. Normale verschlüsselte
Snapshots haben 64 MiB Budget; vollständige Datenbank-/WAL-Sätze werden nach
beendeten Schreibern bei Engine-Absturz oder größerem Profil in eine gestreamte,
verschlüsselte Wiederherstellung mit 192 MiB Budget gesichert. Der letzte gute
normale Snapshot bleibt erhalten. Bei größerem Umfang oder Schreibfehlern
erscheint ein Speicherfehler; die noch vorhandene private Arbeitssitzung wird
nicht still gelöscht. Sie ist ohne erfolgreiche Sicherung nicht über einen
Backend-Neustart oder Stromverlust hinweg geschützt. Noch nicht von Chromium
auf Dateiebene geschriebene Änderungen können nicht nachträglich gerettet werden.
Metadaten brauchen einen Teil der Budgets; atomare Ersetzung benötigt vorübergehend
zusätzlichen persistenten Speicher. Aktuelle Prüfungen: [TESTING.md](docs/TESTING.md).

## 0.15.0: CarLifeMedia, Vordergrund und verfügbare Ressourcen

Der Backend-Dienst setzt keine eigenen RAM- und Taskobergrenzen mehr. CPU und
best-effort-I/O erhalten höhere Priorität; CPU-Quote und feste CPU-Zuordnung
werden nicht vorgegeben. Das private 384-MiB-Dateisystem begrenzt weiterhin
Profile, Cache und temporäre Dateien und ist keine Prozess-RAM-Grenze.
Physischer Speicher und die Grenzen des Betriebssystems bleiben maßgeblich;
eine gemessene Beschleunigung auf jeder Headunit wird daraus nicht abgeleitet.

Bei belegter Audioquelle darf der Browser jetzt gezielt **Quelle 287 /
CarLifeMedia** übernehmen. Verbindungen dieser Quelle werden nach erneuter
Identitätsprüfung getrennt; anschließend entsteht die eigene Verbindung zu
Senke 1024. Andere Audioquellen und fremde SmartX-Lockdateien bleiben unberührt.
Beim Freigeben wird ausschließlich die neue eigene Verbindung getrennt.

Die App fordert ihren nativen Vordergrund über das SDK an und wartet auf die
beobachtete Sichtbarkeit und den tatsächlichen Fokus. Eine bloße lokale
Fokus-Markierung reicht nicht. Wiederholungen sind begrenzt; Fehler oder
Fokusverlust stoppen die Anforderung. Details: [Fahrzeug-Audio](docs/AUDIO.md).

**Browser und Browser Runtime gemeinsam auf 0.15.0 aktualisieren.** Engine bleibt
**0.1.0**; Videotakt, Vollbild- und Controller-Verbesserungen aus 0.14.0 bleiben
unverändert enthalten. Reale Lautsprecher und Firmware-Fokus sind weiterhin
auf der Headunit zu prüfen.

Chromium entscheidet jetzt auch ohne die frühere feste Vier-Renderer-Grenze
über seine Prozesse. User-Agent und Client Hints melden konsistent die
wirkliche Chromium-Version und Linux. Cookie-Checkpoints erkennen geänderte
Flags und Partitionierung auch bei unverändertem Cookie-Wert; Einwilligung
und ein eigenes Secure-/HttpOnly-/Host-Cookie überstanden den harten
Engine-Abbruch im lokalen Test.

Geschlossene Shadow-Player werden nun passiv über ihren tatsächlichen
Medienzustand erkannt. Das eigene Disney-ähnliche Modell lieferte sichtbares
Video und nichtstilles PCM; Mute, Lautstärke null, Pause, Ende, Navigation und
Tab-Schließen geben die Route wieder frei. Ein unbekannter Zwischenzustand
kann nur eine bereits bestehende Route höchstens vier Sekunden halten und
keine neue Route erwerben. Bei Backend-Trennung werden Tonroute und altes
Bild verworfen; nach erneuter Bereitschaft lädt die aktive App ihre URL oder
Startseite neu.

Öffentliche Netflix-/Disney-Seiten waren erreichbar. Eine reservierte
Beispiel-E-Mail kam mit alter und neuer Kennung weiter; der gemeldete allgemeine
Netflix-Kontofehler wurde dadurch weder reproduziert noch als behoben bestätigt.
`/login` ist der Anmeldeeinstieg, zunächst mit E-Mail; ein verstecktes
Passwortfeld im DOM ist kein direkter Passwortdialog. Google entscheidet
serverseitig über CAPTCHA-Anforderungen. Eine echte Suche lieferte hier auch
mit konsistenter UA HTTP 429 und eine Netzwerkverkehr-/CAPTCHA-Seite; es fand
keine CAPTCHA-Interaktion statt. Der Browser kann diese Anforderung nicht
garantiert abschalten und löst sie nicht automatisch. Details: [Tests](docs/TESTING.md).

## 0.14.0: Videotakt, Vollbild und weniger Renderarbeit

Die Audio-Bridge verarbeitet vollständige PCM-Blöcke im richtigen Echtzeittakt.
Die Mediensuche erreicht Player auch hinter großen Seitenvorlagen und meldet
eine laufende Tonspur zuverlässig. Vollbild erhält das Layout der Website;
verschachtelte Player werden nicht mehr durch eine globale Höhenregel unsichtbar.
Bei ausgelasteter Bildübertragung wird das neueste Bild bevorzugt und überholtes
Material vor dem Dekodieren verworfen.

Schnelle iDrive-Drehfolgen werden ohne zusätzliche Wartefrist zusammengefasst;
Drücken folgt den vorherigen Drehschritten. Ein zusammengefasster Auftrag ist
auf 64 Drehschritte, die Warteschlange auf 32 Aufträge einschließlich
Druckbarrieren begrenzt. Überzählige oder durch Navigation veraltete Eingaben
werden verworfen; eine unbegrenzte Eingabefolge wird nicht vollständig gepuffert.

Im isolierten Test mit derselben Engine und allein korrigiertem Audio-Helfer
lief die Videouhr in 2,002 Sekunden von zuvor 1,430 auf 1,996 Sekunden;
43 wurden zu 60 gelieferten Bildern. Ein separater Test mit künstlich 70 %
Verbraucherdruck lieferte weiterhin 89 Bilder bei 389 → 252 ms Node-CPU-Zeit.
Das sind lokale Vergleichswerte, keine Bildratenzusage für jede Website oder MGU.
Details und Grenzen stehen unter [Tests](docs/TESTING.md).

**Browser und Browser Runtime gemeinsam auf 0.15.0 aktualisieren.** Engine bleibt
**0.1.0**. Die Start-, Migrations-, iDrive- und Handy-Funktionen aus 0.13 bleiben
enthalten. Live-YouTube konnte hier wegen eines Proxy-403 nicht geprüft werden;
Fahrzeugton und geschützte Anbieterwiedergabe bleiben gesondert zu testen.

## 0.13.3: „Browser-Dienst noch nicht bereit“

In 0.13.0–0.13.2 wurde das Arbeitsdateisystem auf 384 MiB vergrößert, die
anschließende native Grenzprüfung blieb jedoch bei 128 MiB. Dadurch endete der
Backend-Start mit Code 125, bevor die Oberfläche eine Verbindung aufbauen konnte.
Ab 0.13.3 verwenden Mount und Prüfung denselben Grenzwert. Die Isolation und
Speichergrenze bleiben erhalten.

Die Korrektur bleibt in **0.15.0** enthalten; Chromium Engine bleibt
**0.1.0**. Ein bereits ausgefallener Dienst wird beim Update erneut gestartet,
wenn seine Registrierung für diesen Boot nachgewiesen ist. Andernfalls fordert
der Store den nötigen Headunit-Neustart an. Die Diagnose meldet „läuft“ erst
nach einer echten Bereitschaftsnachricht des Backends.

## Neu in 0.12.0

- Konkrete BMW-Audioanbindung über AudioManager und SmartX: Ausgabe erst nach
  bestätigter Verbindung, Freigabe bei Pause/Fokusverlust/Schließen. Bereits
  benutzte CarLife-Kanäle wurden damals nicht übernommen; ab 0.15.0 gilt die
  oben beschriebene gezielte Übernahme von Quelle 287.
- Eigener unprivilegierter Audio-Prozess verbindet Chromiums private ALSA mit
  der vorhandenen Fahrzeug-ALSA. Echte PCM-Daten, Puffergrenzen, Wiederaufnahme
  ohne alten Ton und ein stummer Fehlerfall sind lokal geprüft.
- Begrenzter asynchroner App-Shutdown erlaubt geordnetes Aufräumen.
- Registrierung eines separat bereitgestellten, autorisierten Linux-x86_64-CDM
  mit Pfad-/Manifest-/ABI-Prüfung und klareren DRM-Statusmeldungen.

Unter **Einstellungen → Medien & Streaming** zeigt die App den Audiozustand;
**Testton (1 s)** fordert den Fahrzeugkanal vor der Tonerzeugung an. Eine
bestätigte Verbindung ist noch kein Nachweis hörbarer Lautsprecher. Details:
[Audio](docs/AUDIO.md), [DRM](docs/DRM.md), [Tests](docs/TESTING.md).

## Neu in 0.11.0

- Geordnete iDrive-Eingaben mit sichtbarem Website-Fokus; Drücken aktiviert
  auch Schaltflächen und Checkboxen. Formulare in offenen Shadow-DOMs und
  Frames desselben Ursprungs öffnen die native Tastatur.
- Website-Pop-ups und Links in neuen Fenstern erscheinen als Tabs. Der originale
  Fensterbezug für Anmeldung und Rückkehr zur aufrufenden Seite bleibt erhalten.
- Repariertes HTML-Vollbild im Headless-Betrieb; eingebettete Videos und
  Audioelemente können auch ohne vorheriges Vollbild gesteuert werden.
- Unter **Einstellungen → Medien & Streaming** stehen Wiedergabe/Pause,
  Video-Vollbild, Audio-Ausgangsstatus und ein expliziter Testton bereit.

**Historischer Ton-Stand 0.11.0:** Diese Version prüft Linux-Ausgabe und Testton;
die konkrete Fahrzeug-Anbindung ist Teil von 0.12.0, siehe oben.

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
| Drehen | Native Schaltflächen oder Website-Elemente auswählen; im Bearbeitungsmodus Werte ändern |
| Drücken | Auswahl aktivieren; bei Auswahlfeldern/Reglern Bearbeitung starten bzw. beenden |
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
| Netflix | Öffentliche E-Mail-Anmeldung erreichbar; synthetischer Test kommt mit alter und neuer UA weiter. Gemeldeter allgemeiner Kontofehler nicht reproduziert oder als behoben bestätigt; kein direkter Passwortdialog. |
| Disney+ | Öffentliche Seite erreichbar. Frühere Laptop-Proben mit Anmeldung/Bild/Vollbild sind historisch; aktuelle Anbieterwiedergabe auf der MGU ist nicht qualifiziert. Die Audioerkennung des eigenen geschlossenen Shadow-Player-Modells ist lokal korrigiert und mit PCM/Mute/Pause/Ende geprüft; kein Anbieter-Wiedergabenachweis. |
| Prime Video | Direktzugriff vorhanden; angemeldete Wiedergabe noch nicht geprüft |
| Paramount+ | Direktzugriff vorhanden; angemeldete Wiedergabe noch nicht geprüft |
| Fahrzeuglautsprecher | AudioManager-/SmartX-Anbindung implementiert; hörbarer Test dieses Stands auf der MGU offen |
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
Aktive Chromium-Profile sind temporär. „Angemeldet bleiben“ ist standardmäßig
aktiv; der optionale HTTP-Cache bleibt getrennt und standardmäßig aus.
Website-Daten werden mit einem lokalen geschützten Geräteschlüssel verschlüsselt
und beim nächsten Start wiederhergestellt. Cookie-Checkpoints laufen bereits
während der Sitzung und erhalten auch Session-Cookies samt Flags und Scope.
Das übrige Profil einschließlich Local Storage wird beim sauberen Beenden
gesichert. Anbieter können eine Sitzung weiterhin ablaufen lassen oder erneut
prüfen; gespeicherte Cookies garantieren keine Freigabe einer Serverprüfung.

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
**MGU-Backend:** Website-/Cookie-Speicher nutzt einen lokalen, durch Dateirechte
geschützten Geräteschlüssel. Der getrennte Passworttresor hat zusätzlich einen
Masterpasswort-Modus mit PBKDF2-SHA256, zufälligem Salt und 600.000 Iterationen.
Das Masterpasswort wird maskiert eingerichtet und nach Backend-Neustart zum
Entsperren des Tresors benötigt. Die reale MGU-Laufzeit bleibt gesondert zu prüfen.

Die Sicherung ist auf 64 MiB Profildaten und 16 MiB je Datei begrenzt. Eigene
Chromium-Passwort- und Verlaufsdatenbanken werden nicht archiviert. Ein harter
Stromverlust oder Absturz kann Änderungen seit dem letzten Cookie-Checkpoint
beziehungsweise der letzten Profilsicherung verlieren. Der Engine-Hard-Kill-Test
ist keine Garantie für jeden tatsächlichen Stromverlust.
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
