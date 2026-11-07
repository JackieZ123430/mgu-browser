# MGU Browser 0.13.2

Gesperrt auf Commit `0c969dd` (`publication.json`, `source-inputs.json`).

- Behebt „Browser-Dienst noch nicht bereit“ nach einer früheren privaten
  0.9.x-Installation: Ordner unter `/var/opt/mgu-browser` mit fremdem
  Besitzer werden beiseitegelegt (`<name>.legacy-<Zeit>`, nicht gelöscht)
  und neu angelegt; Startprobleme werden wiederholt statt den Dienst zu
  beenden.
- Backend-Dienst startet immer neu (`Restart=always`), der WLAN-Dienst bei
  Fehlern.
- `/run/mgu-browser/status.json` meldet jeden Schritt; die App zeigt den
  tatsächlichen Grund, solange der Dienst nicht erreichbar ist.
