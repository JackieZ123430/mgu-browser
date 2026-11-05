# Gemeinsamer Internet-Uplink auf der eigenen ID7-Headunit

Seit 5. November 2026 verwendet der private Hardware-Test das offizielle
Paket **mgu-uplink 0.7.3** aus dem veröffentlichten MGU-Store-Katalog.
MGU Store bleibt auf 0.9.21, die Browser-App auf 0.9.1. Der dazugehörige
Browser-Runtime wurde für diese Integration auf **0.9.2** aktualisiert.

Der alte Browser hatte Internet unabhängig vom Store eingerichtet. Deshalb
war im Store zunächst „Uplink down“ zu sehen und die WiFi-Auswahl fehlte.
Jetzt verwaltet ausschließlich der gemeinsame Uplink die WLAN-Verbindung.
Die Browser-Einstellungen reichen nur fest definierte Anfragen an diesen
Dienst weiter; sie starten keine zweite WLAN-/DHCP-/Routing-Verwaltung.

Auf diesem Broadcom-Gerät nutzt der veröffentlichte Uplink den
`car-supplicant`-Backend auf `wlan0`. Das gespeicherte Browser-Netz wurde
einmalig auf dem Gerät in die private Uplink-Konfiguration übernommen;
das Passwort wurde dabei nicht ausgegeben oder zum Laptop übertragen.
Die beiden alten und neuen Dienste dürfen vor dem erforderlichen Neustart
nicht gleichzeitig die alte Verbindung neu aufbauen.

## Browser-Integration

- Das Runtime-Paket meldet UID 3911 über `internet: true` und `uids` beim
  offiziellen Deploy-Werkzeug an. Die App selbst benötigt keinen direkten
  Internetzugriff, da Chromium im getrennten Backend läuft.
- Der bestehende Root-Broker akzeptiert weiterhin nur UID 3911 und die
  Operationen Status, Scan, Verbinden und Wiederverbinden.
- Status und validierte DNS-Adressen kommen aus den vom offiziellen
  Uplink geschriebenen Laufzeitdateien. SSIDs und Passwörter werden nicht
  in die Browser-Diagnosedatei geschrieben.
- DNS wird ausschließlich in der privaten Browser-Resolver-Datei aktualisiert.
  Der für die Mount-Namespace-Anbindung benötigte Inode bleibt erhalten.
  Die BMW-Systemresolver-Datei bleibt unverändert.
- Ohne gültige Online-Lease wird der Browser als offline gemeldet und
  erhält keine ungeprüften DNS-Inhalte. Das offizielle Routing sperrt
  den Internetpfad, solange der Uplink offline ist.
- Die alte Browser-Konfiguration bleibt für eine gezielt koordinierte
  Rückkehr erhalten. Eine Deinstallation des Uplinks ist keine geprüfte
  automatische Migration zurück zur alten Netzwerkkonfiguration.

## Geprüft

41 Tests unter unprivilegiertem Linux bestanden, darunter vier neue
Regressionsprüfungen für Lease-/DNS-Validierung, Inode-Erhalt, feste
Uplink-Anfragen, Passwort-Referenzlöschung, Symlink-Abweisung und
begrenzte Socket-Antworten. Auf der HU wurden sämtliche Runtime-JS-Dateien
unter Node 8 geprüft und native Module geladen.

Nach dem vom Nutzer ausgelösten Neustart: Uplink, Browser-Broker und
Backend aktiv. Uplink `online`, WiFi `online`, `car-supplicant`, Signal
−33 dBm zum Prüfzeitpunkt. Browser-DNS und HTTPS zu pllana.io erfolgreich
(HTTP 200). Der Nutzer bestätigt: **WiFi im MGU Store sichtbar und online**.

Ein zusätzliches eigenes, stummes WebM/VP8-Testvideo wurde mit der echten
Chromium-Engine unter UID 3911 im begrenzten Dienst-Dateisystem dekodiert:
18 Bilder, keine verworfenen Bilder, kein Medienfehler. Ein eigener
WebM-Test mit Opus-Tonspur lief ebenfalls bildseitig; die Engine meldete
jedoch `Unknown PCM default`. Die BMW-Lautsprecher sind dadurch weiterhin
nicht angebunden. Dies bestätigt keine YouTube-/DRM-Provider-Wiedergabe.

Das veröffentlichte Paket wird unter den Bedingungen des Upstream-Projekts
verwendet. Quelle und Anleitung:
https://github.com/robertnisipeanu/mgu-store/tree/main/native/mgu-uplink
