# Audio-Ausgabe und Testton

Chromium kann HTML-Audio, Video-Ton und WebAudio an einen vorhandenen
Linux-Audioausgang ausgeben. Die Browser-App erzeugt **keine BMW-Audioquelle**
und bindet die Lautsprecher der MGU bisher nicht an. Ein erfolgreicher Testton
im AudioContext beweist deshalb allein noch keine hörbare Ausgabe im Fahrzeug.

Unter **Einstellungen → Medien & Streaming** zeigt die Audio-Prüfung, ob der
Backend-Benutzer einen PulseAudio-Unix-Socket oder ein ALSA-Wiedergabegerät
erreichen darf. Fehlende Geräte, fehlende Rechte und beobachtete
Chromium-Audiofehler werden als begrenzte Statuscodes gemeldet. Die Prüfung
öffnet keine Geräte und verändert weder Lautstärke noch Fahrzeugdienste.
Ein erreichbarer Socket oder Geräteknoten bestätigt noch keinen funktionierenden
Stream und keinen Weg zu den Lautsprechern.

**Testton (1 s)** startet ausdrücklich einen leisen 440-Hz-Ton mit kurzer
Ein-/Ausblendung. Dafür muss eine Webseite geöffnet und der Browser im
Vordergrund sein. Der Test schließt seinen AudioContext anschließend; parallele
Testtöne werden abgewiesen. Bitte den Test im abgestellten Fahrzeug ausführen
und hörbare Ausgabe selbst bestätigen. Bei Stille ist die Audioanbindung weiter
offen, selbst wenn der Browser die Tonerzeugung bestätigt. Die Fahrzeuglautstärke
wird durch den Test nicht verändert.

## Vorhandene Linux-Ausgabe auswählen

Der Browser verwendet standardmäßig Chromiums normale Audioauswahl. Für eine
bereits eingerichtete und separat geprüfte ALSA-Ausgabe kann ein Administrator
dem Backend-Dienst `MGU_BROWSER_ALSA_DEVICE` geben, beispielsweise mit einem
systemd-Override:

```ini
[Service]
Environment=MGU_BROWSER_ALSA_DEVICE=hw:0,0
```

Der Wert wird als einzelnes `--alsa-output-device`-Argument übergeben.
`hw:0,0` ist lediglich ein Beispiel, kein für die MGU belegter Gerätebezeichner.
Ein bestehender PulseAudio-Dienst kann über sein normales `PULSE_SERVER` und
seine vorhandene Zugriffsberechtigung verwendet werden. Der Browser startet
keinen Audiodaemon, verteilt keine Pulse-Cookies und erweitert keine Gruppen
oder Geräteberechtigungen. Die Chromium-Sandbox bleibt aktiv.

Die private Engine 0.1.0 liefert die verknüpften ALSA-/Pulse-Bibliotheken,
aber keine neue ALSA-Systemkonfiguration und keine BMW-Stream-Anbindung.
Benutzerdefinierte ALSA-PCMs benötigen daher die passende vorhandene
Konfiguration und gegebenenfalls Plugins. Das Setzen einer Umgebungsvariable
richtet diese Infrastruktur nicht ein. Änderungen an einem Systemdienst sollten
erst bei geschlossener Browser-App aktiviert werden.

## Nachgewiesener Stand

`node test/chromium_audio_smoke.js` prüft echtes Chromium unter einem
unprivilegierten Linux-Benutzer mit aktivierter Sandbox. Eine private
ALSA-Dateiausgabe mit gepuffertem FIFO-Verbraucher empfängt den expliziten
Testton. Der Test verlangt PCM-Daten mit von null verschiedenen Samples und
benötigt weder Netzwerk noch Lautsprecher. Das belegt Tonerzeugung und die
Ausgabe an diesen konfigurierten ALSA-Ausgang. Es belegt keine BMW-Lautsprecher,
keine Provider-Codecs und keine geschützten Streams.

Die öffentliche Dokumentation von
[idrive7-apps, Abschnitt 4.6](https://github.com/cauliflowermossgrape/idrive7-apps#46-media-cameras-and-the-drive-recorder)
beschreibt Fahrzeug-Audio über AVB und BMWs Stream-Handler. Im geprüften App-Kit
und im MGU Store wurde keine verwendbare öffentliche Lautsprecher-API gefunden.
Für die verbleibende Integration sind die tatsächlichen Audiointerfaces,
Audioquellen-/Fokusverwaltung und Berechtigungen der eigenen Headunit zu prüfen.
