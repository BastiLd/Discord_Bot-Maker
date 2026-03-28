# GitHub Pages Schritt für Schritt

Für den aktuellen Projektstand brauchst du kein Backend. Genau deshalb kann GitHub Pages dieselbe App ausliefern wie dein lokaler Test.

## Was du genau machen musst

1. Öffne dein Repository `BastiLd/Discord_Bot-Maker` auf GitHub.
2. Gehe auf `Settings`.
3. Klicke links auf `Pages`.
4. Suche den Bereich `Build and deployment`.
5. Stelle bei `Source` auf `GitHub Actions`.
6. Speichere die Einstellung, falls GitHub noch einen Speichern-Button zeigt.
7. Gehe in den Tab `Actions`.
8. Warte auf den Workflow `Deploy GitHub Pages` oder starte ihn manuell über `Run workflow`.
9. Wenn der Workflow grün durchläuft, gehe wieder auf `Settings` > `Pages`.
10. Kopiere dort die veröffentlichte URL.

## Was danach passiert

- Jeder Push auf `main` baut die App neu.
- Der Workflow erzeugt statische Dateien aus `dist/`.
- GitHub Pages veröffentlicht genau diese Dateien.
- Weil ZIP-Analyse und Export im Browser laufen, fehlt auf Pages keine Serverfunktion.

## Wenn die Seite zuerst leer wirkt

Prüfe diese Punkte in genau dieser Reihenfolge:

1. Ist in `Settings` > `Pages` wirklich `GitHub Actions` als Source gesetzt?
2. Ist der letzte Workflow grün?
3. Greifst du auf die URL mit dem Repo-Namen `Discord_Bot-Maker` zu?
4. Hast du nach dem letzten Push ein bis zwei Minuten gewartet?

## Lokal gegen Pages prüfen

Lokaler Test:

```powershell
npm.cmd run dev
```

Produktions-Build lokal prüfen:

```powershell
npm.cmd run build
npm.cmd run preview
```

Wenn `npm.cmd run preview` funktioniert, entspricht das sehr nah dem GitHub-Pages-Verhalten.