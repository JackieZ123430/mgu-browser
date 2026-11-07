# MGU Browser 0.13.1

Gesperrt auf Commit `84ba61d` (`publication.json`, `source-inputs.json`).

- Entfernt beim Start den ungenutzten Chromium-Ordner der privaten
  0.9.x-Installation (`/var/opt/mgu-browser/engine`, etwa 180 MB), sobald die
  versionierte Store-Engine installiert ist. Symlinks werden nicht verfolgt.
- Eine privat installierte 0.9.x-Laufzeit übernimmt der Store über die Quelle
  `pllanaio/mgu-browser` mit dem Kanal **Releases**; mit `branch:main` gibt es
  die Laufzeit nicht.
- Alle Funktionen aus 0.13.0 (30 fps, dauerhafte Cookies, Handy-Fernbedienung,
  Werbeblocker) unverändert.
