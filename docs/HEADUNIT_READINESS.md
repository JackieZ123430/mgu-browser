# Headunit-Vorbereitung 0.9.1

Historischer Prüfstand der privaten Basis. Die Veröffentlichung 0.10.0 hat
einen gesonderten [Store-Installationsweg](MGU_STORE.md) und [Teststand](TESTING.md).
Ihre neue Paketintegration wurde noch nicht auf der echten HU installiert.

Status: **Privater Hardware-Test auf der eigenen Headunit; keine allgemeine Installationsfreigabe.**
Am 5. November 2026 wurden App und Backend 0.9.1 mit dem offiziellen
MGU-Deploy-Werkzeug zusammen installiert. MGU Store 0.9.21 ist ebenfalls
installiert. Die Node-8-/N-API-Prüfung auf diesem Gerät ist bestanden.
Ein privates, auf 384 MiB und 32768 Inodes begrenztes tmpfs (bis 0.12: 128 MiB) für das aktive
Profil, HOME, Cache und temporäre Dateien wird vor der Rechteabgabe angelegt.
Es ist nodev/nosuid/noexec und besteht nur im Mount-Namespace des Dienstes.
Die bestehende private Chromium-Engine wurde anhand ihres SHA-256 bestätigt.
Der neue Code liegt in einem getrennten Versionsordner; MGU Deploy erstellt
vor den Änderungen Snapshots der betroffenen Dateien und Dienstkonfigurationen.
Ein tatsächlicher Wiederherstellungsversuch und die nachfolgenden
Hardware-Tests bleiben gesondert nachzuweisen. Ein
SDK-App-Emulator ist kein vollständiges ID7-Systemabbild. Ein erfolgreicher
Desktop-Stream belegt weder MGU-Audio noch MGU-DRM oder den physischen Controller.

Auf diesem Gerät ist der grundlegende Live-Test inzwischen bestanden:
Hotspot verbunden, DNS/HTTPS aus dem Browser-Benutzerkonto mit HTTP 200
bestätigt, neue Oberfläche sichtbar. Der Nutzer bestätigt Website-Darstellung
und iDrive-Bedienung. Damit sind weder alle Gesten noch Medien-DRM oder Audio
qualifiziert. Eine alte Statusdatei musste von 0600 auf root:12443/0640
migriert werden, damit der Backend-Dienst Verbindungswechsel lesen kann.

## Änderungen aus der Prüfung

- Native JSON-Nachrichten sind in beide Richtungen auf 64 KiB begrenzt.
  Zu große Ergebnisse liefern eine begrenzte Fehlermeldung statt den Socket zu
  zerstören. Titel sind UTF-8-begrenzt; unterstützte Adressen haben höchstens
  4096 UTF-8-Bytes. Acht Tab-Metadaten passen damit in ein Paket.
- Verlauf und Lesezeichen haben begrenzte Einträge und zusammen ein
  Speicherbudget von 256 KiB. Am Limit werden zuerst die ältesten Verlaufseinträge,
  anschließend erforderlichenfalls die ältesten Lesezeichen entfernt. Schreibfehler werden angezeigt.
- Profil-Dekompression begrenzt den ausgegebenen Datenstrom ausdrücklich;
  sie setzt keine neuere `maxOutputLength`-Implementierung voraus.
  Profil-I/O, Kompression und größere Verschlüsselungsabschnitte geben den
  Ereignis-Thread frei. Der tatsächliche MGU-Durchsatz bleibt zu messen.
- Löschen und erneutes Starten sind geordnet. Ein beschädigtes Sitzungsarchiv
  kann ausdrücklich zurückgesetzt werden, ohne den Passworttresor zu löschen.
- Chromium erhält zuerst einen normalen Schließbefehl, danach nötigenfalls
  SIGTERM und schließlich SIGKILL ausschließlich an seine eigene Prozessgruppe.
  Nach Signal-Abbruch oder nicht erfolgreichem Prozessende wird kein möglicherweise inkonsistentes Profil
  archiviert. Falls der Prozess trotzdem nicht endet, wird ein weiterer Start
  blockiert und ein Backend-Neustart verlangt; aktive Dateien werden dann
  weder archiviert noch gelöscht.
- Medien-Suche hat feste Knoten-, Komponenten- und Control-Limits.
  Dreh-/Druckaktionen werden geordnet; Controls haben ein eigenes Suchbudget.
  Die Controller-Auswahl verwendet eine explizite Markierung bzw. die
  Accessibility-Knoten-ID. Eine Seite darf den DOM-Fokus auf „Zurück“ setzen,
  ohne dadurch die ausgewählte Aktion zu ersetzen. Ein Provider-Retest steht aus.
- Produktionsdiagnosen erfassen keine Seitentitel, URL-Pfade, Textauszüge oder
  JavaScript-Fehlertexte mehr. Vorhandene ältere Diagnosen werden durch diese
  Änderung nicht automatisch gelöscht.
- DHCP-Netze, die mit anderen Interfaces kollidieren, werden vor der ersten
  Routing-/Firewall-Änderung abgewiesen. Die gemeinsame BMW-WLAN-Nutzung muss
  trotzdem auf der tatsächlichen Anlage geprüft werden.
- Die Laptop-Vorbereitung gibt Root-Rechte vor SDK-Kopien, Compiler-Aufrufen und
  Konfigurationsschreibzugriffen ab. Sie verändert als Root nur den über einen
  No-follow-Deskriptor geöffneten privaten Hauptordner.
- Der App-Bau verwendet einen frischen Staging-Ordner und ausdrücklich
  ausgewählte App-Dateien; der historische HTML-Leser wird nicht mitgepackt.

## Offene Freigabepunkte

| Bereich | Benötigter Nachweis |
| --- | --- |
| Node / N-API / glibc | Auf diesem Gerät: Node 8.16.2 / N-API 4, beide Addons geladen; andere Geräte bleiben ungeprüft |
| Engine / Sandbox | Tatsächliche Sandbox-Aktivierung, passende Bibliotheken, Dateirechte und Kernel-Funktionen |
| Ressourcen | Wirksame Dienstlimits, Messungen unter MGU-Speicherdruck, keine Neustarts oder Watchdog-Auslösung |
| Datenträger | Arbeitsprofil-Grenze ab 0.13.0: 384 MiB (128 MiB-Grenze war auf diesem Gerät geprüft); Verhalten bei vollständig belegtem Profil und Speicherdruck noch offen |
| Netzwerk | Richtige Benutzer-IDs, freie Routing-Slots, kein fremdes Subnetz, CarPlay-/BMW-WLAN-Koexistenz |
| Medien | BMW-Lautsprecher, Codecs und zulässige passende DRM/CDM-Bereitstellung auf der Zielplattform |
| Bedienung | Disney-eigene Buttons nach dem Fix erneut testen; echte Dreh-/Druck-/Touchpad-Ereignisse separat prüfen |
| Fahrzeug-Lebenszyklus | Sauberes Schließen, Schlafen/Aufwachen und Unterbrechung der Versorgung; letzte Anmeldung kann seit dem letzten sauberen Ende verloren gehen |
| Installation | Gemeinsames Upgrade über MGU Deploy durchgeführt, Snapshots vorhanden; tatsächlicher Restore-Test noch offen |

Die WLAN-Lease-Anwendung verändert mehrere Netzwerkobjekte nacheinander.
Ein vollständiger Rückweg nach einem Fehler in einem Zwischenschritt ist noch
nicht implementiert oder getestet. Auf der eigenen Headunit wird die bereits
bestehende WLAN-Konfiguration für den ausdrücklich beauftragten Hardware-Test
weiterverwendet; dies ist keine allgemeine Netzwerk-/Recovery-Qualifikation.

Die Referenzwerte UID 3911 und UID 12443 sind Integrationsparameter dieser
Entwicklung, keine für alle BMW garantierten Kennungen. Die aktuelle Oberfläche
übersetzt Deutsch und Englisch; weitere Tastaturlayouts sind keine vollständigen
UI-Übersetzungen. Die Schriftatlanten stammen aus lokalen Build-Eingaben.
Display-Touch ist keine Implementierung des physischen iDrive-Touchpads.

Der Passworttresor ist ein ausdrücklich ausgelöstes Formular-MVP. Mehrstufige
Provider-Logins werden nicht als vollständig unterstütztes Autofill beworben.
Das aktive Chromium-Arbeitsprofil enthält während des Betriebs entschlüsselte
Daten im privaten flüchtigen Dateisystem. Alte Profile früherer Versionen
werden nicht automatisch gelöscht. Abrupter Stromverlust ist weiterhin nicht
qualifiziert. Sitzungsarchiv, Passworttresor und nativer Verlauf sind getrennte
Speicher; ein BMW-Fahrerprofil-Wechsel wird noch nicht automatisch zugeordnet.

## Lokale Vorbereitung

`tools/prepare_headunit.py --output <neuer Ausgabeordner>` erzeugt eine
Quell-ZIP, ein Versions-/SHA-256-Manifest und SHA256SUMS. Es verbindet sich mit
keinem Fahrzeug. Die Ausgabe bleibt `install_ready: false`. Binaries werden
nur lokal inventarisiert und nicht als qualifiziert übernommen. Private SDKs,
Fonts, Konten, Cookies, Diagnosen und historische Installationsskripte sind
nicht enthalten. Eine Prüfsumme identifiziert Bytes; sie ersetzt keine
vertrauenswürdige Signatur oder Hardware-Prüfung.

Die Leseprüfung `tools/hu_preflight.sh` wurde auf der eigenen Headunit
ausgeführt. Sie installiert nichts und
ändert keine Dienste, Routen oder Firmware. Weitere Schritte stehen in
[INSTALLATION_PLAN.md](INSTALLATION_PLAN.md).

Sechs bekannte historische Einstiege (`stage_native.py`, `install_native.py`,
`restage_app.py`, `update_browser.py`, `test_reader_on_hu.py`,
`test_native_https.py`) brechen jetzt vor jedem Import und vor jeder
Fahrzeugverbindung ab. Unveränderte Originale bleiben ausschließlich in einem
ignorierten lokalen Archiv. Andere historische Reparaturwerkzeuge sind weiterhin
kein unterstützter Installationsweg und werden nicht mitgeliefert.

App, Backend und Engine müssen als zusammengehöriger Stand geprüft werden.
Die App 0.9.1 allein auf einem alten Backend 0.6.1 ist nicht freigegeben.
