# Sicherheit und private Daten

Dies ist ein experimenteller Quellcode-Vorabstand. Er enthält keine Firmware,
BMW-SDK-Dateien, Kontodaten, Schlüssel, WLAN-Profile oder Fahrzeugmitschnitte.
Die öffentliche Kopie wird aus einer ausdrücklichen Dateiliste erzeugt;
private Arbeitsverzeichnisse und lokale Git-Historie werden nicht übernommen.

## Vorhandene Laufzeitgrenzen

- Unprivilegierte Browserprozesse mit aktiver Chromium-Sandbox und TLS-Prüfung.
- CDP über geerbte Pipes; keine öffentlich erreichbare Debugging-Schnittstelle.
- Privater Unix-Socket, begrenzte Nachrichten und Linux-Benutzerprüfung.
- Lebensdauer an App-Fokus und Heartbeat gebunden; temporäre Browserprofile.
- WLAN-Geheimnisse im vorbereiteten Dienst in einer Root-eigenen Datei mit
  Modus 0600; Antworten und Renderer-Texte geben das Passwort nicht zurück.
- Laptop-Emulator ausschließlich auf Loopback; kein automatischer Fahrzeugzugriff.

Dies sind Implementierungsmerkmale, keine abgeschlossene externe Sicherheitsprüfung.
Die Headunit-Integration, permanente Logins, Berechtigungsdialoge und
Passwortverwaltung benötigen weitere Arbeit. URL-Schutz und temporäre Profile
sind kein Ersatz für vollständige Website-/Netzwerk-Isolation; Tabs teilen Cookies.

Keine Geheimnisse, Lizenzantworten, Schlüsselmaterial, VINs oder Browserprofile
in öffentliche Issues einstellen. Einen Fehler zunächst mit einer kleinen
bereinigten Reproduktion beschreiben und für sensible Details einen privaten
Meldeweg mit dem Projektinhaber abstimmen.
