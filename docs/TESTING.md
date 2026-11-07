# Teststand

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
