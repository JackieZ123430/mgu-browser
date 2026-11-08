# Handy-Fernbedienung (QR-Code)

Ab 0.13.0 lässt sich der Browser vom Handy aus bedienen.

1. Im Browser **Einstellungen → Mit Handy steuern (QR)** wählen.
2. Den QR-Code mit der Kamera-App des Handys scannen.
3. Auf der geöffneten Seite:
   - **Link senden**: Adresse oder Suchbegriff eingeben, „Öffnen“ oder „In neuem Tab“.
   - **Bildschirm**: Live-Bild des Browsers. Tippen klickt im Fahrzeug, Wischen scrollt.
     Zurück, Vor, Neu laden, Hoch, Runter.
   - **Text eingeben**: erst im Live-Bild das Eingabefeld antippen, dann Text senden.
     Bei Passwortfeldern wird automatisch ein verdecktes Feld angezeigt.
     „Nächstes Feld“, Löschen und Enter stehen als Tasten bereit.
   - **Tabs** wechseln.

## Netzwerk

Ab 0.16.1 funktioniert die Fernbedienung auch, wenn die HeadUnit nur am
Hotspot des Handys hängt (mgu-uplink über `wlan1` oder `wlan0`): Der QR-Code
zeigt dann die Hotspot-Adresse der HeadUnit, und ein Root-Wächter setzt die
Freigabe alle 5 s neu, falls mgu-uplink seine Firewall-Tabelle nach einer
Neuverbindung neu aufgebaut hat.


Handy und MGU müssen sich erreichen können: entweder ist die MGU mit dem
Hotspot des Handys verbunden (Standardfall), oder das Handy ist im WLAN des
Fahrzeugs. Die Laufzeit gibt dafür beim Start TCP-Port **39123** frei, nur auf
`wlan0`/`wlan_bridge` und nur für private bzw. Link-Local-Adressen
(Regeln mit dem Kommentar `mgu-browser-remote`).

## Sicherheit

- Jeder QR-Code enthält ein zufälliges 128-Bit-Token. „Neuer Code“ macht den
  alten Link ungültig, „Verbindung beenden“ schließt den Server.
- Nach 30 Minuten ohne Nutzung endet die Sitzung automatisch.
- Anfragen von öffentlichen Adressen werden abgewiesen.
- Jede Aktion erfordert, dass der Browser im iDrive im Vordergrund ist.
- Die Verbindung ist unverschlüsseltes HTTP innerhalb des WLANs. Das WLAN
  selbst (Hotspot, WPA2) ist verschlüsselt; Passwörter werden nur an das
  gerade fokussierte Feld übergeben und nicht gespeichert oder protokolliert.
