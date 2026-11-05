# Geplanter Übergang auf die echte MGU

Historischer Plan der privaten 0.9.1-Basis. Für die eigenständige Veröffentlichung
0.10.0 gilt [Installation über den Store](MGU_STORE.md). Die neue Paketintegration
ist gesondert unter [Tests](TESTING.md) beschrieben und noch nicht auf der HU installiert.

Stand 5. November 2026: Auf ausdrücklichen Auftrag wurden MGU Store 0.9.21
und Browser App/Backend 0.9.1 auf der eigenen Headunit installiert. Der
offizielle MGU-Deploy 0.7.17 übernimmt Versionierung, Datei-Hashes und
Snapshots vor den Änderungen. Die vorhandene Chromium-Engine bleibt erhalten;
der neue Browser-Code verwendet `/var/opt/mgu-browser/current`. Die alten
Backend-Dateien bleiben für die Wiederherstellung erhalten. Private
Installationsmanifeste und Protokolle liegen unter `.local/install-20261105/`.
Diese einmalige Installation ist keine allgemeine Hardware-Freigabe und
kein veröffentlichter Universal-Installer.

Diese Datei beschreibt außerdem den allgemeinen Freigabeweg. Sie ist kein
Installationsskript. Das Vorbereitungspaket allein darf nicht als vollständige
App-/Backend-/Engine-Installation behandelt werden.

1. **Unveränderlichen Stand bestimmen.** App-Version, Quellmanifest,
   `.mgu`-Datei, Backend, native Module, Engine und lokale SDK-/Toolchain-Eingaben
   müssen eindeutig zusammengehören. SHA-256-Prüfsummen am Ziel erneut
   vergleichen. Alte Dateien aus `dist` sind ohne zugehörigen Nachweis keine
   freigegebenen Artefakte.
2. **Laufzeit lesen.** Die vorbereitete Leseprüfung liefert Architektur,
   Node-/N-API-/glibc-Version, Ressourcen und ausgewählte Dateirechte.
   Zusätzliche Prüfung von Benutzer-/Gruppenzuordnung, wirksamer Sandbox und
   WLAN-/Routing-Koexistenz erfolgt mit den tatsächlichen Zielwerten. Bei einem
   unbekannten oder unpassenden Wert wird nicht installiert.
3. **Vorherigen Zustand erfassen.** Eigentümer und Modi aller betroffenen
   App-/Backend-/Engine-Dateien sowie die tatsächlich vorhandenen Dienste,
   Browser-Routing-Regeln und Browser-Firewall-Regeln privat dokumentieren.
   Nur die betroffenen Browser-Dateien zur Wiederherstellung sichern; keine
   Firmware-Dumps oder Kontodaten veröffentlichen. Rückkehr zu App 0.6.1 und
   dem dazugehörigen Backend muss als konkrete Möglichkeit geprüft werden.
4. **Upgrade implementieren und isoliert prüfen.** Neue Dateien in getrennte
   Versionsordner schreiben, erst nach vollständiger Prüfung aktivieren,
   Zustandsmigration bei Fehlern abbrechen und den vorherigen Stand behalten.
   Ein neuer Installer muss Eigentümer, No-follow-Pfade und Hashes selbst
   prüfen. Gemeinsame BMW-Dienste oder fremde Netzwerkrouten dürfen nicht
   pauschal ersetzt werden. Die private Installation verwendet jetzt den
   offiziellen MGU-Deploy-Installer; ein tatsächlicher Restore-Test ist offen.
5. **Hardware-Tests vor Freigabe.** Zunächst ohne Provider-Konto starten:
   eigener Testinhalt, Layout, Zurück zum iDrive, physischer Controller,
   Ressourcen und sauberes Ende. Danach Netzwerk und Audio, anschließend
   Provider-Login und Medien. Schlaf-/Aufwach- und Wiederherstellungstests
   kommen vor der Alltagsnutzung. Keine Erfolgsaussage aus dem Laptop ableiten.
6. **Rückkehr prüfen.** Bei einem Fehler App/Backend anhalten, ausschließlich
   zugehörige neue Browser-Änderungen zurücknehmen und die dokumentierte
   vorherige Version samt Dateirechten und Dienstkonfiguration wiederherstellen.
   Auf einer nicht mehr erreichbaren Headunit ist dies kein verlässlicher
   Fern-Rollback; deshalb muss der Recovery-Weg vor der ersten Änderung feststehen.

Die historischen Skripte `stage_native.py`, `install_native.py`,
`restage_app.py`, `update_browser.py` und die früheren Reparatur-/Probe-Skripte
sind **kein freigegebener Weg für 0.9.1**. Sie enthalten ältere Versions- und
Pfadannahmen, können das Fahrzeug unmittelbar verändern und teilweise einen
vollständigen Headunit-Neustart auslösen. Sie werden nicht in die neue
Vorbereitungs-ZIP aufgenommen.

Die Audit-Artefakte dokumentieren den abgeschlossenen Offline-Audit. Die
spätere ausdrücklich beauftragte Fahrzeug-Installation hat eigene Protokolle.
