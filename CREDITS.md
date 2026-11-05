# Credits

## idrive7-apps

**[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)**
und alle Mitwirkenden stellen das App-Kit und die Grundlagen bereit, auf denen
diese Entwicklung aufbaut: native App-Flächen und Zeichenbefehle,
Controller-Anbindung, App-Struktur, Build-Werkzeuge und SDK-App-Emulator.
Die lokale Entwicklung begann mit dem Stand
`9b5e9cf8a49399939d51d3458fb29b6a3cec8346`.

Danke für die erhebliche Vorarbeit, eigene Apps auf der MGU überhaupt entwickelbar
zu machen. Der upstream veröffentlichte Code ist MIT-lizenziert. Die vollständige
Lizenz steht zur Zuordnung unter `licenses/idrive7-apps-MIT.txt`. Die extern
benötigten BMW-SDK-Bestandteile werden dadurch nicht automatisch mitlizenziert
und sind hier nicht enthalten.

## MGU-Store

**[robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)**,
**Robert Nisipeanu**, **IterioDev** und alle Mitwirkenden entwickeln den Store,
die App-Verteilung, Update-/Deployment-Infrastruktur, Renderer und den
gemeinsamen Internet-Uplink für das Community-Ökosystem.

Danke für die Grundlage einer praktikablen App-Veröffentlichung und für die
Arbeit an der gemeinsamen Laufzeit. Eine Abstimmung der Browser-Integration
ist geplant. Dieses Repository verteilt keinen MGU-Store-Code und behauptet
keine fertige Store-Zertifizierung oder Unterstützung durch dessen Autoren.
MGU-Store nennt GPL-3.0-or-later für seinen eigenen Code; dessen Bedingungen
bleiben bei einer späteren tatsächlichen Übernahme gesondert zu beachten.

## Weitere Bausteine

- Chromium und Google Chrome: Web-Engine und Browserprotokoll.
- Google Widevine: separat installierte DRM-Komponente des offiziellen
  Desktop-Chrome; nicht Bestandteil dieses Repositorys.
- Shaka Player und der öffentliche Sintel-Teststream: DRM-Integrationstest.
- libjpeg-turbo: lokaler nativer JPEG-Decoder; Bibliothek und Lizenz werden
  nur in privaten Build-Ausgaben bereitgestellt.
- parse5 / Ivan Nikulin: MIT-lizenzierter HTML-Parser für den früheren
  Lesemodus; Lizenz und Herkunftsnachweis liegen bei.
- Ubuntu-Schriftfamilie und Google Fonts: separat bereitgestellte Schriftdateien
  für die privat erzeugten Unicode-Atlanten.

Die eigene Browser-Integration und Oberfläche werden von
[Leon Pllana](https://github.com/pllanaio) entwickelt.
BMW und sämtliche Dienst-/Produktnamen bleiben Bezeichnungen ihrer jeweiligen
Rechteinhaber. Eine Projektverlinkung ist keine Aussage über Unterstützung,
Partnerschaft oder Gewährleistung durch Dritte.
