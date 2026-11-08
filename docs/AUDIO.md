# Fahrzeug-Audio in 0.15.0

Der Browser besitzt eine konkrete Anbindung an **SmartX/ALSA und den BMW AudioManager**
für ID7. Die öffentlich dokumentierte Kombination ist Quelle `CarLifeMedia` (287),
Lautsprechersenke 1024 und PCM `plug:smartx:CarLifeMedia_CF_48_STEREO`.
Das ist eine auf anderen ID7-Fahrzeugen erprobte Schnittstelle, keine Bestätigung
für jede Firmware oder die eigene Headunit. Die Audio-Pipeline wurde hier
mit echten Chromium-/ALSA-Prozessen und simuliertem AudioManager geprüft;
ein hörbarer Fahrzeugtest steht aus.

## Wiedergabe und Audiofokus

Bei hörbarer HTML-Audio-/Videowiedergabe oder laufendem WebAudio fordert die
sichtbare und fokussierte Browser-App den Kanal an. Hintergrundtabs werden
berücksichtigt. Ab 0.15.0 darf der Browser die ausdrücklich angeforderte
**Quelle 287 / CarLifeMedia übernehmen**: vorhandene Verbindungen genau dieser
Quelle können unabhängig von ihrer Senke getrennt werden, anschließend wird
die eigene Verbindung von 287 zur Lautsprechersenke 1024 aufgebaut.
Verbindungen anderer Quellen werden nicht getrennt.

Vor der Übernahme fordert die App über den echten SDK-Aufruf `ui.open('MAIN')`
ihren nativen Vordergrund an. Der Aufruf allein gilt nicht als Fokusnachweis:
Sichtbarkeit und Fokus müssen anschließend tatsächlich vom SDK gemeldet werden.
Vor jedem Trennen werden Verbindungs-ID, Quelle und Senke erneut geprüft.
Provider-Wechsel, wiederverwendete IDs, Fokusverlust und unbekannte Antworten
brechen den Vorgang ab. Wiederholungen und Wartezeiten sind begrenzt; es gibt
keine unendliche Schleife gegen einen anderen Audioclient.

Die App merkt sich den ursprünglichen Verfügbarkeitswert und ausschließlich
die selbst erzeugte Verbindungs-ID. Erst nach `CS_CONNECTED` öffnet der
Ausgabeprozess das PCM-Gerät. Bei Pause/Ende, Fokusverlust und normalem
Schließen endet die Ausgabe; nur die eigene Verbindung wird getrennt. Die
ursprüngliche Verfügbarkeit wird wiederhergestellt, soweit der Browser sie
geändert hat und kein anderer Teilnehmer die Quelle inzwischen benutzt.
Verdrängte frühere CarLifeMedia-Verbindungen werden nicht automatisch neu
aufgebaut. Nach der Übernahme besitzt der Browser ausschließlich seine neue
Verbindungs-ID. Provider-Neustarts und wiederverwendete IDs dürfen weder beim
Aufbau noch beim Freigeben eine Verbindung einer anderen Quelle treffen.
Nach einer Unterbrechung wird kein unbegrenztes Wiederverbinden gegen
Systemfokus erzwungen; pausieren und neu starten erlaubt eine neue Anforderung.

Die App besitzt einen begrenzten asynchronen Shutdown-Hook mit höchstens
1,5 Sekunden Cleanup-Zeit. Ein Prozessabsturz, harte Abschaltung oder eine
nicht antwortende Fahrzeug-API kann nicht mit einem normalen Schließen
gleichgesetzt werden. Das Schließen räumt ausschließlich die neue eigene
Verbindung auf, nicht pauschal alle Verbindungen von Quelle 287. Eine
Wiederherstellungsgarantie nach Stromverlust gibt es nicht.

Die passive AX-Zustandserkennung erreicht auch Videos in geschlossenen
Shadow-Playern, ohne deren Shadow Root zu öffnen. Das eigene Disney-ähnliche
Modell ist mit echten nichtschwarzen Bildern und PCM geprüft: Wiedergabe,
Mute/Unmute, Lautstärke null/Wiederherstellung, Pause/Fortsetzen und Ende
werden getrennt erkannt. Navigation und Tab-Schließen geben die Route frei.
Diese Zustandsprüfung bestätigt weder DRM-Freigabe noch Anbieterwiedergabe.

Ist die Erkennung kurzzeitig unbekannt, darf die App ausschließlich eine schon
bestehende Route für höchstens vier Sekunden seit der letzten bestätigten
hörbaren Aktivität halten. Ein Ablauf-Timer beendet diese Schonfrist; unbekannter
Zustand erwirbt keine neue Route. Bestätigte Pause/Mute/Ende, Fokusverlust und
Backend-Trennung geben sofort frei. Bei unerwarteter Backend-Trennung löscht
die Oberfläche außerdem das alte Bild; neue Backend-Bereitschaft lädt die
aktuelle URL beziehungsweise Startseite nur bei weiterhin aktiver App neu.

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

Browser und Browser Runtime gemeinsam auf 0.15.0 aktualisieren; Engine bleibt
0.1.0. Browser neu öffnen, eine Seite öffnen und unter
**Einstellungen → Medien & Streaming → Testton (1 s)** testen. Der Test startet
nur bewusst, leise und mit kurzer Ein-/Ausblendung. Anschließend ein normales
ungeschütztes Video mit Ton abspielen, pausieren, zwischen Tabs wechseln und
den Browser schließen. Eine belegte CarLifeMedia-Quelle soll jetzt gezielt
übernommen werden. Scheitern der verifizierte Vordergrund, die AudioManager-
Antworten oder der begrenzte Verbindungsaufbau, zeigt die App den Fehler.

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
- AudioManager-Fixtures prüfen die Übernahme ausschließlich von Quelle 287,
  Verbindungen zu verschiedenen Senken, unveränderte andere Quellen,
  wiederverwendete IDs, begrenzte Wiederholungen und Freigabe nur der neuen
  eigenen Verbindung. Die paketierte SDK-Oberfläche wird in Deutsch und
  Englisch auf tatsächliche Vordergrundanforderung und beobachteten Fokus
  geprüft. Nachgebildete HMI-/AudioManager-Antworten ersetzen keinen Fahrzeugtest.
- [Moonride, a834a14](https://github.com/JustAnotherPU/moonride/blob/a834a14/apps/jap_moonride/main.js)
  dokumentiert die ID7-Quelle und die AudioManager-Operationen.
- [Intel AVB-AudioModules](https://github.com/intel/AVB-AudioModules)
  dokumentiert den SmartX-Connector und dessen Gruppen-/Lock-Verhalten.
- [Öffentliche ID7-Audionotizen](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)
  beschreiben die gemessenen Folgen falscher Lock-Rechte.

Die Implementierung ist eigenständig MIT-lizenziert. Verwendet wurden
Protokoll- und Verhaltensinformationen; GPL-Programmcode und proprietäre
Firmware-Dateien wurden nicht übernommen.
