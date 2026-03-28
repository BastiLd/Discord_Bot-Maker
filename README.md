# Discord Bot Maker

Ein statischer visueller Discord-Bot-Builder auf Basis von React, TypeScript und Vite.
Die App läuft lokal ohne Backend und ist so gebaut, dass GitHub Pages dieselbe Oberfläche ausliefert wie dein lokaler Test.

## Was die App aktuell kann

- visueller Flow-Editor mit Nodes, Kanten und Inspector
- Einsteiger- und Fortgeschrittenen-Modus
- Templates für Moderation, Welcome-Flow und Ticket-Panel
- ZIP-Import mit zwei Wegen:
  - perfekter Round-Trip über `builder-project.json`
  - best-effort Rekonstruktion für bestehende Python-Discord-Bots
- ZIP-Export eines lauffähigen `discord.py`-Bots inklusive `README_RUN.md`, `.env.example` und `EXPORT_NOTES.md`
- lokale Sicherung im Browser per `localStorage`
- GitHub-Pages-freundlicher Build mit passendem Vite-`base`

## Lokaler Start

```powershell
npm.cmd install
npm.cmd run dev
```

## Produktions-Build

```powershell
npm.cmd run build
npm.cmd run lint
```

## Wichtige Architekturentscheidung

Die App arbeitet komplett im Browser. Genau deshalb funktioniert sie auf GitHub Pages genauso wie lokal: Es gibt keinen Server, der auf Pages fehlen würde.
ZIP-Import, Round-Trip-JSON, Rekonstruktion und Export laufen clientseitig.

## Dateien für dich

- GitHub Pages Anleitung: [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md)
- Supabase Anleitung: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
- vorbereitete Supabase-SQL: [supabase/schema.sql](supabase/schema.sql)

## Hinweis zu Supabase

Für den aktuellen Stand brauchst du kein Supabase. Lokalbetrieb, ZIP-Import/Export und GitHub Pages funktionieren ohne zusätzliche Cloud-Einrichtung.
Die Supabase-Dateien liegen nur als sauber vorbereitete nächste Ausbaustufe im Repo.