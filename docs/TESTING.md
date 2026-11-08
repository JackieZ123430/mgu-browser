# Teststand

## 0.15.0 — Ressourcen, Audioübernahme und SDK-Vordergrund

Die Backend-Unit hebt ihre eigenen RAM- und Taskobergrenzen mit
`MemoryLimit=infinity` und `TasksMax=infinity` auf. `CPUShares=8192`, `Nice=-10`
und best-effort-I/O-Priorität 0 bevorzugen Browserarbeit bei Konkurrenz.
Eine CPU-Quote, feste CPU-Zuordnung oder Echtzeitklasse wird nicht gesetzt.
Das private 384-MiB-tmpfs für Profile/Cache/TMPDIR bleibt unverändert und ist
keine Prozess-RAM-Obergrenze. Die Paketprüfung vergleicht die eingebauten
Units mit dem Quellstand; daraus folgt kein gemessener Geschwindigkeitsgewinn
auf einer MGU.

Die neue Policy darf ausschließlich Verbindungen der erneut als CarLifeMedia
bestätigten Quelle 287 verdrängen, unabhängig von deren bisheriger Senke.
Anschließend wird eine neue eigene Verbindung zu 1024 erzeugt. Regressionen
prüfen andere Quellen, ID-Wiederverwendung, Provider-/Fokuswechsel, begrenzte
Wiederholungen und das Freigeben ausschließlich der neuen eigenen ID.
Fremde SmartX-Lockdateien werden weiterhin weder verändert noch entfernt.

Die App fordert `ui.open('MAIN')` über die echte SDK-Schnittstelle an. Der
Vordergrund gilt erst nach beobachteter Sichtbarkeit und Fokus als bestätigt;
ein erfolgreicher Methodenaufruf allein genügt nicht. Der Release-Workflow
extrahiert das tatsächlich gebaute SDK-freie Frontend und führt dessen
SDK-UI-Smoke verpflichtend unter `en-GB` und `de-DE` aus. Nachgebildete
HMI-/AudioManager-Antworten prüfen Aufruf, Reihenfolge und Bestätigung,
belegen jedoch keinen tatsächlichen Fokuswechsel auf einer MGU.

Native Audio-Bridge, Videotakt, Decoder, Controller und Engine bleiben auf dem
0.14.0-Stand. Alle bestehenden PCM-/Vollbild-/Controller- und vollständigen
Root-/Node-8-/Chromium-Paketprüfungen bleiben verpflichtend. Endgültige
Testanzahlen und die Bindung an den Quellcommit folgen im Release-Bericht
nach dem abschließenden Quellfreeze; hier werden keine vorläufigen Erfolge
oder Fahrzeugnachweise behauptet.

Der frühere feste Vier-Renderer-Schalter entfällt. `browser_identity_smoke.js`
prüft auf einer eigenen Loopback-Seite tatsächliche HTTP-Header und Navigator-/
Client-Hints-Werte in mehreren Tabs: konsistente echte Chromium-Version, Linux,
Sprache und unveränderte Sandbox-/TLS-Prüfungen. Es wird keine Windows-Plattform
erfunden und kein positiver Anbieter- oder CAPTCHA-Erfolg daraus abgeleitet.

`chromium_persistence_smoke.js` prüft Cookie-Checkpoints vor einem harten
Engine-Prozessgruppenabbruch: Einwilligung, geänderte HttpOnly-/SameSite-Flags
bei unverändertem Wert und ein gültiges Secure-/HttpOnly-`__Host-`-Prüfcookie
werden wiederhergestellt. Änderungen an Flags und Partition-Scope fließen in
den Snapshot-Digest ein. Der lokale Loopback-Animationslauf zeigte 30,5 fps
und 17,2 % Bandübertragung gegenüber Vollbildern. Der Test verwendet eine eigene
Loopback-Seite, weil eine verwaltete Host-Policy `data:`-Navigation blockierte;
die Policy wurde nicht gelockert. Diese lokalen Werte sind keine YouTube- oder
MGU-Bildratenzusage und der Engine-Kill ist kein physischer Stromverlusttest.

Beide Tests sind im Treiber `fullscreen_audio_package_smoke.py` zusätzlich zu
den bisherigen drei Pakettests verpflichtend: fünf echte Node-8-/Engine-/
Native-JPEG-Prüfungen vor Veröffentlichung. Die neue SDK-Suite prüft außerdem
belegte Quelle, Fokusbestätigung/-verweigerung, Pause/Wiederaufnahme und
Schließen; veraltete asynchrone Audioantworten dürfen keinen neuen Besitzer
überschreiben. Endgültige Paketläufe und Testanzahlen folgen nach Quellfreeze.

Öffentliche Netflix-/Disney-Seiten luden. Eine reservierte synthetische E-Mail
kam mit alter und neuer UA weiter; der gemeldete allgemeine Netflix-Kontofehler
wurde nicht reproduziert und wird nicht als behoben behauptet. `/login` ist der
E-Mail-Einstieg; anfänglich versteckte Passwort-DOM-Felder beweisen keinen
sichtbaren Passwortdialog. Geschützte Anbieterwiedergabe wurde nicht bestätigt.
Das eigene Disney-ähnliche geschlossene Shadow-Player-Modell reproduzierte
`audible=false` trotz laufender unmuted Wiedergabe. Die passive AX-Korrektur
bestand echte Host-Chromium-/Native-JPEG-/PCM-Prüfungen mit Wiedergabe,
Mute/Unmute, Lautstärke null/Wiederherstellung, Pause/Fortsetzen und Ende.
Navigation und Tab-Schließen geben die Ausgabe frei; die Shadow Root bleibt
geschlossen. Der Pakettreiber verlangt elf Audio-/Videostufen: sechs bisherige,
vier geschlossene Wiedergabestufen und einen Flags-/Ende-/Cleanup-Nachweis.
Die fünf Skriptprüfungen einschließlich Identität und Cookie-Hard-Kill bleiben
pflichtig; endgültige gebaute Paketergebnisse folgen nach dem Quellfreeze.

Die Oberfläche darf einen unbekannten Zwischenzustand höchstens vier Sekunden
seit zuletzt bestätigter hörbarer Aktivität überbrücken und dabei nur eine
bereits bestehende Route halten. Ein Ablauf-Timer verhindert unbegrenztes
Halten; aus unbekanntem Zustand wird keine Route neu erworben. Zusätzliche
Regressionen prüfen unerwartete IPC-Trennung: `blocked` löst Route und altes
Bild, erneutes `ready` aktiviert das Nachladen der aktuellen URL/Startseite
nur bei sichtbarer/fokussierter App. Das ist kein Anbieter-/CDM-Nachweis.

Der bekannte Proxy-403 verhinderte zuvor Live-YouTube-Tests. Eine tatsächliche
Google-Suche lieferte hier auch mit konsistenter UA HTTP429 und eine
Netzwerkverkehr-/CAPTCHA-Seite. Es gab keine CAPTCHA-Interaktion. Google
entscheidet darüber serverseitig; eine garantierte Abschaltung oder automatische
Lösung wird nicht angeboten. Browser-Identität und gespeicherte Cookies belegen
keine Serverfreigabe. Endgültige Ergebnisse und offene Fehler stehen im
Release-Bericht.


## 0.14.0 — Videotakt und Vollbild

Ein Vergleich mit derselben veröffentlichten Engine 0.1.0, Node 8.16.2,
Ubuntu 18, nativer JPEG-Dekodierung und ALSA 1.1.3 isoliert den Audiofehler:
Nur der native Audio-Helfer wurde zwischen den Läufen geändert.

| Messung bei jeweils 2,002 s Echtzeit | Bisheriger Helfer | Korrigierter Helfer |
| --- | ---: | ---: |
| Fortschritt der Videouhr | 1,429786 s | 1,996097 s |
| Geschriebene PCM-Daten | 274.176 Byte | 385.920 Byte |
| Frische nichtschwarze Bilder | 43 | 60 |

Der bisherige Leser nahm pro Zeitschritt weniger PCM als der Produzentenblock
auf und verlangsamte dadurch die Medienuhr. Der korrigierte Helfer puffert den
vollständigen Block und taktet Ausgabe beziehungsweise Verwerfen weiter in
begrenzten Abschnitten. Auch bei freigegebenem Audiokanal muss die Videouhr
nahe an Echtzeit bleiben, ohne Daten in die Ausgabesink zu schreiben.

Ein separater Vergleich mit künstlich 70 % Verbraucherdruck lieferte in beiden
Läufen 89 Bilder. Das Bevorzugen des neuesten codierten Bildes vor der Dekodierung
senkte dabei Node-CPU-Zeit von 389 auf 252 ms (etwa 35 %) und Dekodierungen von
241 auf 89 (etwa 63 %). Dies ist ein definierter lokaler Lastvergleich, keine
allgemeine Bildraten-, Hardwarebeschleunigungs- oder Websitezusage.

`test/chromium_fullscreen_audio_smoke.js` prüft gleichzeitig tatsächliche neue,
nichtschwarze Pixel, Fortschritt der Videouhr, nichtstilles PCM und den
Audiozustand: inline, hinter 7.000 Vorlagenelementen, im Vollbild, nach
Viewport-Wechsel, nach Verlassen des Vollbilds sowie mit freigegebener Ausgabe.
Der erste Abschnitt prüft die Echtzeitrate über zwei Sekunden statt nur
„Wiedergabe läuft“ aus dem DOM abzulesen. Der bisherige Stand scheiterte zudem
hinter den vielen Vorlagenelementen an einer falschen `audible=false`-Meldung.

`test/media_fullscreen_smoke.js` reproduziert mit eigenem Farbvideo einen
verschachtelten Player mit zulässigem nullhohem Zwischencontainer. Die alte
globale Vollbildregel machte dessen Video unsichtbar. Geprüft werden die native
Website-Schaltfläche und Browser-Aktion, Bild-/Viewport-Geometrie, bewegte
farbige Projektionsbilder, Verlassen des Vollbilds sowie iframe-/Shadow-Player.
Providerähnliche Klassennamen sind eigene DOM-Fixtures, kein Live-YouTube-Test.

`test/controller_video_smoke.js` vergleicht 16 Drehschritte und anschließendes
Drücken über echtes Unix-IPC, während das eigene Video läuft. Ungebündelt sind
16 Fokus-Anfragen, gebündelt eine nötig; beide Wege müssen dieselbe abschließende
Schaltfläche aktivieren. Videofortschritt und native JPEG-Dekodierung werden
mitgeprüft. Die Zeit bis zur Aktivierung wird gemeldet; ein fragiles Verhältnis
zwischen den Laufzeiten ist keine Bestehensbedingung. Die Queue hält höchstens
32 wartende Aufträge einschließlich Druckbarrieren; pro zusammengefasstem
Drehauftrag werden maximal 64 Schritte behalten. Tests prüfen Grenzfälle,
Richtungswechsel, Druckreihenfolge und Abbruch veralteter Tab-/Navigationsarbeit.
Unbegrenzte Eingabefolgen werden ausdrücklich nicht vollständig gespeichert.

Der Pakettreiber `test/fullscreen_audio_package_smoke.py` verwendet den
gebauten Backend-Code, dessen echtes natives JPEG-Modul und Audio-Helfer,
gepinnte Engine 0.1.0, Node 8 und öffentliche alte ALSA in einem isolierten
Ubuntu-18-Container. Er hält Chromium sandboxed, bindet Eingaben nur lesbar ein
und braucht keine BMW-Bibliotheken oder externen Streamingkonten. FFmpeg
erzeugt das eigene begrenzte Testvideo auf dem Host. Endgültiger Quellcommit,
Paketlauf und Testanzahlen werden im Release-Bericht nach dem Quellfreeze
festgehalten; vorläufige Messungen ersetzen diesen Abschluss nicht.

**Grenzen:** Live-YouTube war durch HTTP 403 des Test-Proxys blockiert. Die
lokalen Tests bestätigen weder alle fremden Player noch reale MGU-Lautsprecher,
Firmware-Fokuswechsel oder geschützte Anbieterwiedergabe. Die Start- und
Sicherheitsprüfungen aus 0.13.3 bleiben Teil der Veröffentlichung.


## 0.13.3 — vollständiger Backend-Start

Die veröffentlichten Runtime-Pakete 0.13.1 und 0.13.2 wurden mit echtem
Node 8.16.2 in isoliertem Ubuntu 18 gestartet. Beide beenden den nativen
Launcher mit Code 125, weil das 384-MiB-tmpfs gegen ein 128-MiB-Maximum
geprüft wird. Derselbe Aufbau erreicht mit dem korrigierten Launcher den
authentifizierten Backend-Socket. Verschiedene App-UIDs, die vorhandene
Audio-Gruppe und alte App-besitzende Ordner werden gesondert geprüft;
Sicherungsmarker alter Daten bleiben erhalten. Die Fixture ist kein Fahrzeug.

`test/runtime_service_smoke.py` führt den tatsächlichen Root-Launcher,
Mount-Namespace, tmpfs, Rechteabgabe, Node-8-Backend, native Module und
SO_PEERCRED-Prüfung aus. Ubuntu-Image und Node-Archiv sind gepinnt. Bei
synthetischer Engine-Prüffläche belegt der Test ausdrücklich nur den Start bis
zum Socket; eine Chromium-Rendering-Prüfung benötigt die echte Engine.
Keine Headunit oder proprietäre SDK-Bibliothek wird dafür verwendet. Mit der
gepinnten echten Engine 0.1.0 bestand das endgültige 0.13.3-Paket zusätzlich
alle vier vollständigen Startfälle bis zu einem echten 1280×384-RGBA-Bild
(1.966.080 Bytes) von sandboxed Chromium 156.0.8078.79. Das tatsächlich
installierte `check.sh` bestand jeweils; alte Datenmarker und der Zielinhalt
eines vorab platzierten Status-Symlinks blieben unverändert. In der lokalen
rootless-Docker-Umgebung ist nur der zusätzliche `/proc`-Eigentümernachweis
für die Aktivierung nicht ausführbar; die Aktivierungslogik wird separat
gegen die offizielle Deploy-Reihenfolge geprüft und im rootful CI ergänzt.


Weitere Regressionen prüfen die Wiederherstellung ausgefallener Dienste
über die unveränderte offizielle Deploy-Reihenfolge, das Beibehalten der
Neustartpflicht nach frischer recmgr-Registrierung sowie geschützte
Statusdateien und eine echte Backend-Bereitschaftsnachricht. Endgültige
Ergebnisse und Prüfgrenzen stehen im versionierten `test-results.json`.


## Update 0.12.0 — 7. November 2026

Die neue Audio-Pipeline ist eine konkrete Fahrzeug-Anbindung mit lokal
prüfbarem Ende-zu-Ende-Datenweg. Echtes sandboxed Chromium liefert über seine
private ALSA und eine begrenzte FIFO an den gebauten nativen Prozess; dieser
schreibt über System-ALSA in eine eigene Dateisink-Fixture. Nichtleere PCM-Daten,
Echtzeittakt, Verwerfen bei Pause, Wiederaufnahme ohne alten Ton, Prozessende
und ein stummer Fehlerfall werden tatsächlich geprüft. Die SmartX-Bibliotheken
und Lautsprecher der realen Headunit stehen in dieser Umgebung nicht bereit.

AudioManager-Tests decken fremde/belegte Quellen, verifizierten Verbindungsaufbau,
eigene Verbindungs-IDs, Provider-Neustarts, unterbrochenen Fokus, verspätete
Antworten und geordnetes Freigeben ab. Der Paketbau prüft alle nativen ELF-
Importe auf GLIBC höchstens 2.27 und verwendet den statischen Launcher. Die
native Bridge importiert beim lokalen Build maximal GLIBC 2.17 und bindet
`libdl.so.2` ausdrücklich ein. Der tatsächlich paketierte Helfer bestand den
PCM-Test zusätzlich unter echtem Ubuntu-18-Loader, glibc/libdl 2.27 und ALSA
1.1.3. Die öffentlichen Testpakete sind per SHA-256 gepinnt; ihre Herkunft
wurde anhand des signierten Ubuntu-Paketindexes überprüft. Die alten
Bibliotheken werden nur isoliert zum Test geladen und nicht verteilt.

74/74 JavaScript-Kerntests bestanden ohne Auslassungen. Neun getrennte
Publisher-Tests prüfen unter anderem Tag-Bindung, Konsistenz und Katalog-Rollback.

Neue Tests prüfen außerdem den maximal 1,5 Sekunden langen Shutdown-Cleanup,
Einschränkungen auf rootgeschützte CDM-Konfiguration, Manifest-/ELF-Prüfungen,
Sitzungsarchive ohne Audio-/CDM-Laufzeitdateien und HTML-/WebAudio-Aktivität über
Tabs. Der echte DRM-Test bestätigt EME/ClearKey, aber ohne CDM erwartungsgemäß
`Widevine: NotSupportedError`. Es wurde kein positiver Widevine-/Anbieter-
Wiedergabetest vorgetäuscht. Die finalen Anzahlen und konkreten Befehle stehen
im versionierten `test-results.json` der Veröffentlichung.

Die CI baut die neuen nativen MIT-Helfer selbst und prüft Quellen/Compiler-
Provenienz, ABI und die tatsächlich gepackte Audio-Bridge vor Veröffentlichung.
Abweichende vertrauenswürdige Compiler können andere Binärbytes liefern; die
Prüfsummen beziehen sich deshalb auf genau die anschließend geprüften und
hochgeladenen Artefakte. Der Katalog wird zuletzt umgeschaltet. Der reale
Store-Parser, die Donor-Aufbereitung und der Vergleich der gepackten JS-Dateien
mit dem Quellstand bleiben Teil der Paketannahme.

**Offen bleiben reale Lautsprecher, ganze Fahrzeug-Lebenszyklen und geschützte
Anbieterwiedergabe mit einem autorisierten CDM.** Die neuen lokalen Prüfungen
sind kein Nachweis für jede MGU-Firmware. Download-/Berechtigungsdialoge sowie
alle fremden Frame-/Shadow-Formulare sind weiterhin keine vollständig fertigen
Desktop-Browserabläufe.


## Update 0.11.0 — 7. November 2026

Prüfumgebung: unprivilegierter Linux-x86_64-Benutzer, Node 24.22.1,
Chromium 156.0.8078.79 (Debian 13). Chromium läuft mit eigener Sandbox,
privaten temporären Profilen und ohne TLS-Ausnahmen. Die neuen Engine-Fixtures
benötigen keine Konten oder Fahrzeugverbindung. FFmpeg erzeugt originale
Testvideos; der Audio-Test schreibt in einen begrenzten lokalen ALSA-Testsink.

| Prüfung | Nachweis |
| --- | --- |
| Kerntests | 49/49 bestanden, keine Auslassungen (`node --test test/*.test.js`) |
| iDrive-Eingabe | Echte Tab-Reihenfolge, sichtbarer Fokus, Enter/Space-Aktivierung, Checkboxen, geordnete Unicode-Eingabe, offene Shadow-DOMs und gleichursprüngliche Frame-Formulare; Auswahlfelder/Regler per Drücken/Drehen |
| Fenster/Tabs | Originaler Popup-Target, Opener-Kommunikation, window.close, target=_blank/noopener, Tab-Limit, Shutdown-Rennen und Fehler-Rückkehr |
| Video | Generierte VP8/Opus- und H.264/AAC-Dateien: dekodierte Frames und AAC-Daten, Inline-Wiedergabe/Pause/Spulen/Stumm, Vollbild mit vollständigem Bild und Vollbild-Ende |
| Website-Player | Native Controls, deaktivierte/versteckte Schaltflächen, Player mit eigenständigem DOM-Fokus, Regler und offene/geschlossene Komponenten |
| Audio | Tatsächliche nichtleere PCM-Samples aus Chromium über ALSA-Datei-Fixture; ausdrücklich kein Lautsprecher-Nachweis |
| Node 8.16.2 | Syntax der ausgelieferten JavaScript-Module und echte Chromium-Sitzung mit Fokus/Aktivierung und AudioContext lokal geprüft |
| Sitzungswiederherstellung | Echte verschlüsselte Archive über zwei saubere Engine-Neustarts, Session-Cookie erhalten; keine Akkumulation unsichtbarer Tabs |
| Native Oberfläche | Frisch gebautes SDK-freies Frontend: Controller-Routing, Tabs, Tastatur, maskierte Geheimnisse, Medienaktionen, Audio-Test und Zielgrenzen |
| Store-Pakete | Echter MGU-Deploy-0.8.4-Artefaktprüfer, Updater-Katalogparser und synthetische Donor-SDK-Vorbereitung; Dateien gegen aktuellen Quellcode verglichen, beide N-API-Module geladen |

Die Paketprüfung installiert keine Dienste. Die unveränderten nativen Dateien
werden aus dem SHA-256-geprüften 0.10.0-Artefakt übernommen, die Engine 0.1.0
bleibt bytegleich. Installations- und Rollback-Ergebnisse der Vorversion unten
sind keine erneute Ausführung mit 0.11.0. Der Release-Bericht nennt die genaue
Store-Quellrevision und die Paketprüfsummen.

**Weiterhin offen:** BMW-Lautsprecher/Audiofokus, Provider-Logins und DRM,
physisches iDrive-Touchpad, plötzlicher Stromverlust, Fahrzeug-Standby sowie
die neue Installation auf einer echten MGU. Native Dateiauswahl/Downloads,
Website-Berechtigungsdialoge und Texteingabe in Cross-Origin-Frames sind
kein vollständig implementierter Desktop-Browserablauf. Die allgemeinen
Engine-Fixtures bestätigen keine bestimmte YouTube-/Disney-/Netflix-Sitzung.
Sie ersetzen auch keinen Sicherheitscheck einer künftig aktualisierten Engine.


## Store-Pakete 0.10.0

Am 5. November 2026: **43 von 43 Quelltests unter unprivilegiertem Linux
bestanden, keine Auslassung**. Hinzu kamen dynamische App-UID-Ermittlung,
Manager-Dateirechte und der gemeinsame Uplink. Die SDK-freie Oberfläche enthält
lizenzierte Unicode-Atlanten. Paketprüfung und Installation verwenden den echten
MGU-Deploy 0.7.17 mit synthetischem Donor in einer privaten Mount-Namespace.
Die tatsächlich gepackte Runtime und sandboxed Chromium rendern dort mit
App-UID 13001; Runtime-Update und Rollback werden über Deploy ausgeführt.
Systemd/Manager sind dabei simuliert. Details und Grenzen: [Store-Pakete](MGU_STORE.md).

**0.10.0 wurde noch nicht auf einer echten HU installiert.** Die folgenden
Hardware-Ergebnisse betreffen ausschließlich die frühere private Basis.
Lautsprecherausgabe, Provider-DRM und Fahrzeug-Lebenszyklus bleiben offen.

## Frühere Basis 0.9.1 / Runtime 0.9.2

Der abgeschlossene Quellcode-Audit lief ohne Fahrzeugverbindung, Provider-Aufrufe oder echte Profile.
Source-, PID-, Netzwerk- und Mount-Isolation, feste CPU-/RAM-/Datei-/Prozess-/
Zeitlimits und ausschließlich Dummy-Daten werden verwendet. Das Ziel und die
Werkzeuge sind schreibgeschützt; nur die zugewiesene Scratch-Fläche ist beschreibbar.

| Prüfung | Ergebnis |
| --- | --- |
| Ausgangsstand: automatisierte Kerntests | 27 von 27 unter isoliertem Linux bestanden |
| Überarbeiteter Stand: Kerntests und Regressionen | 37 von 37 bestanden (keine Auslassungen) |
| Native Addons | Offline geprüft und am 5. November zusätzlich unter HU-Node 8.16.2 geladen |
| Frischer SDK-Paketbau 0.9.1 | Erfolgreich; proprietärer Inhalt bleibt lokal |
| Native SDK-Oberfläche | Tabs, Tastatur, maskierte Hotspot-Eingabe, Vollbild-Routing, Zielgrenzen und App-Ende bestanden |
| Echte Engine nach Medien-Fix | Blockiert: Chromiums eigene verschachtelte Sandbox-Namespaces sind in der Audit-Isolation nicht verfügbar |
| Disney-Sitzung vor dem Audit | Nach vollständigem Schließen und neuem Engine-Prozess ohne Passwort/PIN erhalten |
| Disney eigene Player-Buttons | Letzter sichtbarer Test fehlerhaft; Quellfix benötigt erneuten Engine-/Provider-Test |
| Echte Headunit | Am 5. November auf ausdrücklichen Auftrag: MGU Store 0.9.21 sowie App/Backend 0.9.1 installiert; umfassende Hardware-Qualifikation offen |
| Begrenztes Arbeitsprofil | Auf der HU: UID/GID 3911, 134217728 Bytes, nosuid/noexec; private Mount-Namespace-Erstellung erfolgreich |
| Grundlegender Live-Test | Nutzer bestätigt neue Oberfläche, Website und iDrive-Bedienung; Hotspot sowie DNS/HTTPS aus UID 3911 mit HTTP 200 bestätigt |

Die 0.9.1-Regressionen betreffen UTF-8-Metadaten, Paketgrößen, begrenzte
Verlaufsdaten, parallel gestartetes Löschen/Öffnen, Archiv-Recovery, asynchrone
Profilverarbeitung, geordnete Masterpasswort-Einrichtung, einen unempfindlichen
Dummy-Prozess und DHCP-Subnetzkollisionen. Die Medien-Kontext- und Microtask-Prüfungen verwenden
Dummy-Protokollantworten und bestätigt keine echte Provider-Bedienung.

Die 37 Kerntests wurden nach den Anpassungen der Versionspfade erneut
unprivilegiert unter Linux bestanden. Die HU führte Syntaxprüfungen aller
ausgelieferten Backend-/Netzwerkmodule und Ladeprüfungen beider nativen Addons
aus; dies ist kein vollständiger Kerntest-Lauf unter Node 8.
Keine Prüfung externer aktueller Sicherheits-advisories ist durch den
offline ausgeführten Audit belegt. Store-
Integration, echte Touchpad-Eingabe, Lautsprecher, DRM, Schlafen/Aufwachen und
Rollback benötigen gesonderte Nachweise. Keine Firmware- oder Codierungs-
änderung des Fahrzeug-Codings fand statt. Die ausdrücklich beauftragte
Store-Installation verändert eigene Dienste und die App-Integration im MainApp.
Eine vollständige Fehlerfreiheitsgarantie ist kein Testergebnis.
