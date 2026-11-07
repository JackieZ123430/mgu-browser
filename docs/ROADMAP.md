# Roadmap

Die Reihenfolge beschreibt Entwicklungsschwerpunkte, keine verbindlichen
Termine. „Vorbereitet“ bedeutet vorhandenen Code, nicht Freigabe auf echter MGU.

## 1. Anmeldung und Streaming zuverlässig machen

- [ ] Netflix: den Fehler vor dem Passwortschritt eingrenzen und einen
  vollständigen, normalen Konto- und Wiedergabeablauf prüfen.
- [x] Disney+: Profil-PIN mit Controller-Tastatur, sichtbare Wiedergabe,
  Vollbild und Wiedergabe/Pause im Laptop-Emulator prüfen.
- [ ] Disney+: Spulen, Ton und unterschiedliche Player-/Inhaltstypen weiter qualifizieren.
- [ ] YouTube: Suche, Videos, Formulare, Cookie-Dialoge, Vollbild und
  Controller-Navigation systematisch mit unterschiedlichen Seitenlayouts testen.
- [ ] Prime Video und Paramount+: Anmeldung und Wiedergabe separat qualifizieren.
- [ ] Anbieterfehler verständlich anzeigen und Codec-, EME-, Lizenzserver-,
  Netzwerk- und reine Darstellungsprobleme auseinanderhalten.
- [ ] Anbieterspezifische Einschränkungen bei Browser, Betriebssystem, Konto,
  Codec, DRM und Auflösung dokumentieren. Widevine allein garantiert keine Freigabe.
- [ ] Den Abstand zwischen Desktop-Chrome unter WSL und der älteren MGU-Laufzeit
  vermessen, bevor geschützte Wiedergabe auf der Headunit zugesagt wird.

Ziel sind reguläre Wiedergabewege mit berechtigten Benutzerkonten und zulässig
bereitgestellten Komponenten. CDMs, Lizenzantworten oder Schlüsselmaterial
werden nicht Teil von App-Paketen oder Testberichten.

## 2. Audio und BMW-Medienintegration

- [x] AudioManager-/SmartX-Anbindung mit eigener Verbindung, begrenzter PCM-Bridge
  und lokalem Ende-zu-Ende-Test ab 0.12.0 implementieren.

- [ ] Audio-Quelle, Audio-Fokus, Lautstärke, Unterbrechungen und hörbare Ausgabe
  über die Fahrzeuglautsprecher nachvollziehbar nachweisen.
- [ ] Prüfen, ob der BMW-Medienplayer für geeignete Medien verwendet werden kann.
  Normale Dateien/Streams und DRM-gebundene Website-Player getrennt bewerten;
  eine universelle Übergabe aller Website-Medien wird nicht vorausgesetzt.
- [ ] Bei App-Wechsel, Telefonat und Sitzungsende Wiedergabe korrekt pausieren
  beziehungsweise beenden und den Audio-Fokus zurückgeben.
- [ ] Testton-Ergebnisse und echten Wiedergabeerfolg sauber unterscheiden.
  Die Annahme einer Datei durch eine API belegt noch keine hörbare Ausgabe.

## 3. Bedienung wie ein Browser, angepasst an iDrive

- [ ] Echte Touchpad-Ereignisse des iDrive-Controllers zuordnen.
- [ ] Cursorbewegung über die Touchfläche, Tippen zum Klicken und
  Zwei-Finger-Wischen zum Scrollen auf Hardware prüfen.
- [ ] Lange URLs, Formulare, PIN-Felder, Pop-ups und komplexe Menüs mit Drehen,
  Drücken und Touch konsistent bedienbar machen.
- [ ] Native Auswahlfelder und weitere Browserdialoge im projizierten Seitenbild
  zuverlässig darstellen oder durch passende native UI unterstützen.
- [ ] Spracheingabe für URL, Suche und Textfelder evaluieren. Dafür fehlen
  bislang eine qualifizierte BMW-Sprachschnittstelle und ein vollständiger Ablauf.
- [x] Inline-Medienaktionen und Vollbild für offene Shadow-DOMs und Frames desselben Ursprungs erweitern; sandboxed Chromium lokal getestet.
- [ ] Tableiste und Browserleiste bei vielen Tabs und langen Titeln weiter verfeinern.
- [ ] Weitere App-Sprachen, Schriftsätze und Tastaturlayouts gemeinsam mit
  Muttersprachlern ergänzen. Regionale Formate aus der Systemsprache beibehalten.

## 4. Leistung und Stabilität auf echter MGU

- [ ] CPU, Speicher, Frame-Latenz und Netzwerkverhalten auf Hardware messen.
- [ ] Frame-Takt, Seitenauflösung und Bildqualität anhand dieser Messungen abstimmen.
- [ ] Lange Sitzungen, wechselnde Tabs, große Seiten, schlechte Funkverbindung
  und wiederholte Navigation in begrenzten Tests qualifizieren.
- [ ] Browser-/Renderer-Abstürze lokal verständlich behandeln, ohne dauerhaft
  sensible Diagnosedaten zu sammeln.
- [ ] Verhalten bei App-Wechsel, Fokusverlust, Standby und Wiederaufnahme prüfen.
- [ ] Updates, Start/Stop und Rückkehr zur vorherigen Version reproduzierbar machen.

## 5. Internet und MGU-Store zusammenführen

- [ ] Mit Robert und den MGU-Store-Mitwirkenden die passende Integration abstimmen.
- [ ] Den bereits vorhandenen Store-Internet-Uplink als bevorzugte gemeinsame
  Grundlage prüfen. Konkurrenz zu dessen WLAN-Verwaltung vermeiden.
- [ ] Die Browser-Netzwerkoberfläche gegebenenfalls als Frontend eines gemeinsamen
  Dienstes verwenden, statt einen zweiten Verbindungsmanager zu installieren.
- [ ] Reale WLAN-Scans, Verbindung zu mobilen Hotspots und Wiederverbindung testen.
- [ ] Fehler bei Passwort, Empfang, DHCP und HTTPS-Erreichbarkeit verständlich melden.
- [ ] Eindeutige App-ID, `mguHmi`, Internet-Anforderungen, Backend-Abhängigkeiten
  und kompatible Paket-/Katalogstruktur definieren.
- [ ] Saubere Store-Installation, Update, Deinstallation und Rollback testen.
- [ ] Erst danach installierbare Releases veröffentlichen; kein ungeprüftes
  Paket oder Store-Katalog wird als fertige Veröffentlichung angeboten.

## 6. Dauerhafte Anmeldungen und Passwortverwaltung — Stand 0.9.0

Cookies beziehungsweise gültige Sitzungstoken können Anmeldungen erhalten;
der Browserverlauf allein kann das nicht. Cache beschleunigt erneute Aufrufe,
ersetzt aber weder eine Anmeldung noch eine vom Anbieter verlangte erneute Prüfung.

- [x] Dauerhafte Sitzungen ausdrücklich aktivieren und deaktivieren können, lokal getestet.
- [x] Cookies/Website-Daten, HTTP-Cache und Verlauf getrennt verwalten und löschen.
- [ ] Privatmodus beziehungsweise eine temporäre Sitzung ohne Übernahme anbieten.
- [ ] Speicherverbrauch des Caches begrenzen und Offline-/Neuladeverhalten erklären.
- [x] Passwortverwaltung mit geschütztem Speicher und ausdrücklichen
  Aktionen zum Speichern, Ausfüllen und Löschen implementieren und lokal testen.
- [x] Zugangsdaten streng an den HTTPS-Ursprung binden und keine Geheimnisse
  im Renderer, Verlauf, Diagnoseausgaben oder Repository speichern.
- [x] Windows-DPAPI-Adapter und plattformunabhängigen Masterpasswort-Modus implementieren.
- [ ] Masterpasswort-Modus, Speicherbedarf und Entsperrzeiten auf echter MGU qualifizieren.
- [ ] Konsistente periodische Sicherung für Absturz und plötzlichen Stromverlust entwickeln.
- [ ] Erweiterte mehrstufige Anmeldungen und Autofill in Frames unterstützen.

## 7. Weitere Browserfunktionen

- [ ] Bewusste, geschützte Speicherung und Löschung von Cookies/Logins evaluieren.
- [ ] Website-Datenverwaltung mit verständlichen Löschfunktionen.
- [ ] Download-Verhalten und zulässige Speicherorte definieren.
- [ ] Passwortverwaltung weiter verfeinern, unter anderem manuelles Sperren und mehrere Kontenabläufe.
- [ ] Bessere Lesezeichenverwaltung, Suche im Verlauf und Tab-Wiederherstellung.
- [ ] Berechtigungsdialoge für Mikrofon, Kamera und andere Website-Funktionen
  entwerfen, bevor entsprechende Schnittstellen angeboten werden.

## Was vor einer breiteren Freigabe fehlen darf

Ein Quellen-Repository darf Experimente und offene Punkte zeigen. Eine
installierbare Freigabe soll dagegen einen dokumentierten Hardware-Teststand,
klare Abhängigkeiten und Rechte für verteilte Bestandteile, einen nachvollziehbaren
Installations- und Rücknahmeweg sowie getrennte Ergebnisse je Streamingdienst haben.
Der eigene Projektcode steht unter MIT; Drittanbieter behalten ihre Lizenzen.
