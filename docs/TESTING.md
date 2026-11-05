# Veröffentlichungsprüfung — 5. November 2026

Die bereinigte Quellkopie wurde vor dem ersten Upload separat geprüft:

| Prüfung | Ergebnis |
| --- | --- |
| JavaScript-Kerntests unter Windows | 27 Tests: 26 bestanden, 1 Linux-spezifischer Test übersprungen |
| Linux-WLAN-Profil/Broker-Tests | Beide Tests bestanden, einschließlich des unter Windows übersprungenen Tests |
| Paketbau mit separat vorhandenem lokalem SDK und Font-Eingaben | Erfolgreich; Binärpaket bleibt privat und wird nicht veröffentlicht |
| Native SDK-Oberfläche | Tabs, Tastatur, Controller-Routing, Hotspot-Maskierung, Vollbild-Aktionen und App-Ende bestanden |
| Isolierter echter Engine-Eingabetest | Normale Texte, Sonderzeichen, Unicode und eigene Keydown-PIN-Verarbeitung bestanden |
| Isolierter echter Engine-Speichertest | Verschlüsselter Profilneustart, persistente/Session-Cookies, Local Storage, HTTP-Cache, getrenntes Löschen und Passwort-Speichern/-Ausfüllen/-Löschen bestanden |
| Plattformschutz | Windows-DPAPI-Schlüssel-Rundlauf sowie portable Masterpasswort-Einrichtung und erneutes Entsperren geprüft |
| Vollbild-Priorität | Native/Website-Controls-Erkennung und Fallback-Routing mit eigenen Videofeldern und nativer SDK-Oberfläche geprüft |
| Lokales Backend / IPC | Echte Frames, Tabs, Verlauf, Benutzerprüfung, Fokus/Heartbeat und Profilbereinigung bestanden |
| Headunit-Medienkonfiguration | `mediaDisabled: false` im Quellstand; echte MGU-Laufzeit, Codecs, DRM und Fahrzeug-Audio nicht qualifiziert |
| Disney+-Kontotest im sichtbaren Emulator | Anmeldung, Profil-PIN, sichtbare Videowiedergabe, Vollbild und Controller-Wiedergabe/Pause erfolgreich |
| Netflix-Kontotest | Allgemeiner Fehler bereits nach E-Mail-Eingabe; keine erfolgreiche Anmeldung |
| Veröffentlichungskontrolle | Ausdrückliche Quell-Dateiliste; private Arbeitsdaten und SDK-/Build-Ergebnisse ausgeschlossen |

Der frühere öffentliche Widevine-Teststream wurde separat mit Lizenzantwort,
nutzbaren Schlüsseln und sichtbaren Frames geprüft. Provider-Logins und
Screenshots werden nicht als öffentliche Testdaten abgelegt. Der Disney+-Test
belegt keine bestimmte Auflösung, keine Fahrzeug-Audioausgabe und keine
Kompatibilität der realen MGU. Die neuen Speicher-/Fallback-Funktionen sind
lokal mit eigenen Testdaten geprüft; ein erneuter vollständiger Disney+-Test
nach diesen Änderungen und ein Test auf echter MGU stehen noch aus.
