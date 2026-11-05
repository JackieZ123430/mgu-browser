# Teststand

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
