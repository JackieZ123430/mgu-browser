# Sicherheit und private Daten

Dies ist ein experimenteller Entwicklungsstand. Er enthält keine Firmware,
BMW-SDK-Dateien, Kontodaten, Schlüssel, WLAN-Profile oder Fahrzeugmitschnitte.
Die öffentliche Kopie wird aus einer ausdrücklichen Dateiliste erzeugt;
private Arbeitsverzeichnisse und lokale Git-Historie werden nicht übernommen.

## Verteilungsgrenze

BMW-eigene Implementierungen, extrahierte App-Bundles, SDK-Module, Firmware,
Schriftdateien und Schlüssel gehören weder in den Git-Baum oder seine Historie
noch in Release-Anhänge. API-Aufrufe im eigenen Code ersetzen kein mitgeliefertes
SDK: der Store erzeugt dieses erst lokal aus dem Donor der jeweiligen Headunit.
Die öffentlichen Pakete werden ohne diesen Donor gebaut und geprüft.

Für 0.10.0 werden Quellbaum und öffentliche `main`-Historie auf solche Pfade,
BMW-Copyright-Kennzeichnungen und Übereinstimmungen mit dem lokalen SDK geprüft.
Die Kit-JavaScript-Dateien im Frontend werden byteweise dem gepinnten öffentlichen
MIT-Kit zugeordnet. Die Engine wird ausschließlich aus nachgewiesenen Debian-
Paketen und deren korrespondierenden Quellen zusammengestellt. Ein Bericht
liegt bei den Release-Dateien. Diese technischen Prüfungen sind keine rechtliche
Freigabe sämtlicher Abhängigkeiten durch deren Autoren.

## Vorhandene Laufzeitgrenzen

- Unprivilegierte Browserprozesse mit aktiver Chromium-Sandbox und TLS-Prüfung.
- CDP über geerbte Pipes; keine öffentlich erreichbare Debugging-Schnittstelle.
- Privater Unix-Socket, begrenzte Nachrichten und Linux-Benutzerprüfung.
- Lebensdauer an App-Fokus und Heartbeat gebunden; temporäre Browserprofile.
- WLAN-Geheimnisse im vorbereiteten Dienst in einer Root-eigenen Datei mit
  Modus 0600; Antworten und Renderer-Texte geben das Passwort nicht zurück.
- Laptop-Emulator ausschließlich auf Loopback; kein automatischer Fahrzeugzugriff.

Dies sind Implementierungsmerkmale, keine abgeschlossene externe Sicherheitsprüfung.
Die Headunit-Integration, Berechtigungsdialoge und die Hardware-Qualifikation
des neuen Speichers benötigen weitere Arbeit. URL-Schutz und temporäre Profile
sind kein Ersatz für vollständige Website-/Netzwerk-Isolation; Tabs teilen Cookies.

0.9.0 bietet verschlüsselte opt-in Persistenz und einen getrennten Passworttresor.
Windows DPAPI beziehungsweise ein Masterpasswort schützt den Archivschlüssel.
Autofill ist an den exakten HTTPS-Ursprung gebunden und sendet kein Formular ab.
Es gibt keine automatische Übernahme bereits verwendeter Passwörter. Siehe
docs/ARCHITECTURE.md für Speichergrenzen und den noch offenen Stromverlust-Fall.

Keine Geheimnisse, Lizenzantworten, Schlüsselmaterial, VINs oder Browserprofile
in öffentliche Issues einstellen. Einen Fehler zunächst mit einer kleinen
bereinigten Reproduktion beschreiben und für sensible Details einen privaten
Meldeweg mit dem Projektinhaber abstimmen.
