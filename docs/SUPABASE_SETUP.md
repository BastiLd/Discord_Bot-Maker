# Supabase Schritt für Schritt

## Die wichtigste Aussage zuerst

Für den aktuellen Stand dieses Projekts musst du nichts in Supabase anlegen.
Die App funktioniert lokal und auf GitHub Pages komplett ohne Supabase.

## Wann du Supabase überhaupt brauchst

Du brauchst Supabase erst dann, wenn du später zusätzlich willst:

1. Benutzer-Login
2. Cloud-Speicherung von Projekten
3. Synchronisierung zwischen mehreren Geräten
4. private Projektbereiche pro User

## Wenn du Supabase später vorbereiten willst

Gehe dann exakt so vor:

### 1. Projekt anlegen

1. Öffne `https://supabase.com`.
2. Logge dich ein.
3. Klicke auf `New project`.
4. Wähle deine Organisation.
5. Vergib einen Projektnamen.
6. Vergib ein starkes Datenbank-Passwort.
7. Wähle die Region, die für dich am nächsten ist.
8. Klicke auf `Create new project`.
9. Warte, bis das Projekt vollständig erstellt wurde.

### 2. SQL-Struktur anlegen

1. Öffne in deinem Supabase-Projekt den Punkt `SQL Editor`.
2. Klicke auf `New query`.
3. Öffne in diesem Repo die Datei `supabase/schema.sql`.
4. Kopiere den kompletten Inhalt aus dieser Datei.
5. Füge ihn in den SQL Editor ein.
6. Klicke auf `Run`.
7. Warte auf die Erfolgsmeldung.

### 3. Auth aktivieren

1. Öffne links `Authentication`.
2. Gehe auf `Providers`.
3. Aktiviere mindestens `Email`.
4. Wenn du später GitHub-Login willst, aktiviere zusätzlich `GitHub`.
5. Speichere jede Änderung.

### 4. URL und Anon Key notieren

1. Öffne `Project Settings`.
2. Gehe zu `API`.
3. Kopiere die `Project URL`.
4. Kopiere den `anon public` Key.
5. Bewahre beide Werte sicher auf.

## Wichtiger Hinweis für diesen Repo-Stand

Die UI dieses Repos nutzt Supabase aktuell noch nicht aktiv im Frontend.
Die Einrichtung hier ist also Vorbereitung für die nächste Ausbaustufe und noch keine Pflicht.

## Was du aktuell NICHT tun musst

- kein Storage-Bucket ist für die jetzige Version nötig
- keine Edge Function ist für die jetzige Version nötig
- keine Secrets für GitHub Pages sind für die jetzige Version nötig

Sobald die nächste Ausbaustufe Cloud-Speicherung nutzt, können die Werte aus Schritt 4 gezielt eingebunden werden.