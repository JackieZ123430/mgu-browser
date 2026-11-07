# Fahrzeug-Audio ab 0.12.0

Der Browser besitzt eine konkrete Anbindung an **SmartX/ALSA und den BMW AudioManager**
für ID7. Die öffentlich dokumentierte Kombination ist Quelle `CarLifeMedia` (287),
Lautsprechersenke 1024 und PCM `plug:smartx:CarLifeMedia_CF_48_STEREO`.
Das ist eine auf anderen ID7-Fahrzeugen erprobte Schnittstelle, keine Bestätigung
für jede Firmware oder die eigene Headunit. Der Browserstand 0.12.0 wurde hier
mit echten Chromium-/ALSA-Prozessen und simuliertem AudioManager geprüft;
ein hörbarer Fahrzeugtest steht aus.

## Wiedergabe und Audiofokus

Bei hörbarer HTML-Audio-/Videowiedergabe oder laufendem WebAudio fordert die
sichtbare Browser-App den Kanal an. Hintergrundtabs werden berücksichtigt.
Die Firmware muss die erwartete Quelle als derzeit nicht verfügbar und ohne
bestehende Verbindung melden. Eine von CarLife, Moonride oder einer anderen
App benutzte Quelle wird nicht übernommen. Fehlende oder unbekannte
AudioManager-Antworten lassen die Anforderung scheitern.

Die App merkt sich den ursprünglichen Verfügbarkeitswert und ausschließlich
die selbst erzeugte Verbindungs-ID. Erst nach `CS_CONNECTED` öffnet der
Ausgabeprozess das PCM-Gerät. Bei Pause/Ende, Fokusverlust und normalem
Schließen endet die Ausgabe; nur die eigene Verbindung wird getrennt. Die
ursprüngliche Verfügbarkeit wird wiederhergestellt, soweit kein anderer
Teilnehmer die Quelle inzwischen benutzt. Provider-Neustarts und wiederverwendete
IDs dürfen keine fremde Verbindung trennen. Nach einer Unterbrechung wird kein
wiederholtes Verbinden gegen Telefon-/Systemfokus erzwungen; pausieren und
neu starten erlaubt eine neue Anforderung.

Die App besitzt einen begrenzten asynchronen Shutdown-Hook mit höchstens
1,5 Sekunden Cleanup-Zeit. Ein Prozessabsturz, harte Abschaltung oder eine
nicht antwortende Fahrzeug-API kann nicht mit einem normalen Schließen
gleichgesetzt werden. Es gibt kein pauschales Aufräumen aller Verbindungen
von Quelle 287 und keine Wiederherstellungsgarantie nach Stromverlust.

## Getrennte Audio-Laufzeiten

Chromium verwendet seine private ALSA-Bibliothek ausschließlich für eine
S16-LE-/48-kHz-/Stereo-Dateiausgabe in eine private FIFO. Ein eigener
unprivilegierter `audio-bridge`-Prozess lädt die **vorhandene System-ALSA** und
deren vorhandenes SmartX-Plugin über den Firmware-Loader. BMW-Bibliotheken
werden weder kopiert noch mit der privaten Chromium-libc vermischt.

Die FIFO und der interne Audiopuffer sind begrenzt. Die Ausgabe wird in
Echtzeit getaktet. Bei getrenntem Kanal oder Rückstau werden Samples verworfen,
sodass eine erneute Verbindung keinen alten Ton nachliefert. Browser-Ende
beendet den eigenen Hilfsprozess. Die native Bridge importiert höchstens
GLIBC-2.27-Symbole; der Privilegien-Launcher ist statisch gebaut. Die tatsächlich
gebauten Helfer und ihre Compiler-/ABI-Prüfungen stehen in der Release-Provenienz.

Die Runtime verwendet weiterhin UID 3911. Nur wenn die vorhandene Gruppe
`mgu_alsa` und die benötigte Firmware-Konfiguration erkannt werden, erhält
der Backend-Prozess diese primäre Gruppe; die registrierte App-Gruppe bleibt
für IPC erhalten. Der Audioprozess läuft ohne Root-Rechte. Es werden keine
Audio-Benutzer oder Gruppen angelegt und keine fremden Dienste umkonfiguriert.

SmartX verwendet einen gemeinsam beschreibbaren Stream-Lock unter
`/run/smartx/smartx_CarLifeMedia_CF_48_STEREO_p.lock`. Ein vorhandener Lock
muss eine reguläre Datei ohne weitere Hardlinks und mit Gruppe `mgu_alsa`
sowie Modus `0660` sein. Der Browser repariert, übernimmt oder entfernt keinen
fremden Lock. Der Hilfsprozess verwendet beim Öffnen `umask 0007`, damit ein
vom Plugin neu angelegter eigener Lock für die anderen Audioclients zugänglich
bleibt. Server-seitiger Shared Memory und Benachrichtigungs-FIFOs bleiben unverändert.

## Live-Test über den Store

Browser und Browser Runtime gemeinsam auf 0.12.0 aktualisieren; Engine bleibt
0.1.0. Browser neu öffnen, eine Seite öffnen und unter
**Einstellungen → Medien & Streaming → Testton (1 s)** testen. Der Test startet
nur bewusst, leise und mit kurzer Ein-/Ausblendung. Anschließend ein normales
ungeschütztes Video mit Ton abspielen, pausieren, zwischen Tabs wechseln und
den Browser schließen. Bei belegter Quelle erscheint eine entsprechende Meldung.

„Fahrzeug-Audiokanal verbunden“ bestätigt die AudioManager-Verbindung, nicht
hörbare Lautsprecher. Eine erfolgreiche Tonerzeugung allein reicht ebenfalls
nicht als Nachweis. Die Fahrzeuglautstärke wird nicht verändert.

Auf Desktop-Linux bleiben die normale Audioauswahl sowie eine ausdrücklich
konfigurierte `MGU_BROWSER_ALSA_DEVICE`-Ausgabe für Entwicklung erhalten.

## Nachweise und Herkunft

- `node test/chromium_vehicle_audio_smoke.js`: echtes sandboxed Chromium →
  private ALSA → FIFO → nativer Prozess → System-ALSA-Dateisink; nichtleere
  Audiosamples, begrenzte Ausgabe, verworfene Samples ohne alten Ton bei
  Wiederverbindung und Prozessbereinigung.
- AudioManager-Fixtures prüfen Kanalbesitz, belegte Quellen, verspätete
  Antworten, Provider-Neustart, Unterbrechungen und geordnetes Freigeben.
- [Moonride, a834a14](https://github.com/JustAnotherPU/moonride/blob/a834a14/apps/jap_moonride/main.js)
  dokumentiert die ID7-Quelle und die AudioManager-Operationen.
- [Intel AVB-AudioModules](https://github.com/intel/AVB-AudioModules)
  dokumentiert den SmartX-Connector und dessen Gruppen-/Lock-Verhalten.
- [Öffentliche ID7-Audionotizen](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)
  beschreiben die gemessenen Folgen falscher Lock-Rechte.

Die Implementierung ist eigenständig MIT-lizenziert. Verwendet wurden
Protokoll- und Verhaltensinformationen; GPL-Programmcode und proprietäre
Firmware-Dateien wurden nicht übernommen.
