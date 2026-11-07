Experimenteller ID7/x86_64-Stand für Live-Tests über den MGU Store.

- iDrive: sichtbarer Website-Fokus, geordnete Dreh-/Druckeingaben, reparierte Enter-/Checkbox-Aktivierung; Auswahlfelder und Regler per Drücken/Drehen bearbeiten.
- Website-Pop-ups und neue Fenster als Tabs, einschließlich Opener-Kommunikation und Rückkehr nach window.close.
- Repariertes Headless-Vollbild; Inline-Video-/Audiosteuerung und robustere Website-Player-Auswahl.
- Unter Einstellungen → Medien & Streaming: Wiedergabe/Pause, Video-Vollbild, Audio-Ausgangsstatus und bewusst ausgelöster Testton (1 s).

**BMW-Lautsprecherausgabe ist weiterhin nicht angebunden.** Echte Chromium-Ausgabe wurde an einem lokalen Linux-ALSA-Testsink nachgewiesen; dies bestätigt keinen Fahrzeugton. Geschützte Streamingdienste, physisches Touchpad und Fahrzeug-Lebenszyklus bleiben ungeprüft. Ein vollständiger Desktop-Browserablauf für Downloads/Berechtigungsdialoge und alle eingebetteten Formulare ist noch nicht fertig.

**Update:** Browser schließen, Quelle pllanaio/mgu-browser auf Releases stellen, Katalog aktualisieren und Browser **sowie Browser Runtime auf 0.11.0** aktualisieren. Engine bleibt unverändert 0.1.0. Danach neu öffnen. Bitte Formular, neuen Tab, Video/Vollbild und Testton getrennt prüfen.

**Validierung:** 49/49 Kerntests; sieben echte sandboxed Chromium-Smokes einschließlich H.264/AAC und PCM-Audio; Node-8.16.2-Syntax und echter Engine-Start; finale native UI; offizieller Store-Artefaktvalidator/Katalogparser und synthetische SDK-Donor-Vorbereitung. Keine Installation auf einem Fahrzeug für diesen Stand. Details: test-results.json und docs/TESTING.md.

Die nativen Dateien werden unverändert aus dem hashgeprüften 0.10.0-Paket übernommen; runtime-provenance.json dokumentiert die Eingaben. Die Engine und ihre zugehörigen [Drittanbieterquellen](https://github.com/pllanaio/mgu-browser/releases/tag/v0.10.0) bleiben dort unverändert verfügbar. Kein BMW-SDK, Widevine, Konto oder Profil wird verteilt.
