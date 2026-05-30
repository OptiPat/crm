# CRM W.Y.S

CRM Desktop pour Conseillers en Gestion de Patrimoine (CGP)

## Prérequis

- Node.js 18+
- Rust (via [rustup](https://rustup.rs))
- Visual Studio Build Tools (Windows, workload C++)

## Installation

```powershell
cd D:\crm
npm install
```

## Développement (quotidien)

```powershell
# App complete (Rust debug, rapide)
.\dev.ps1

# Frontend seul (~2 s) - travail UI sans SQLite/Tauri
.\dev.ps1 -Ui
```

**Important :**
- Laisser l'application **ouverte** pendant que vous codez.
- Modifications **React/TS** (`src/`) → rechargement instantané, **sans** rebuild Rust.
- Modifications **Rust** (`src-tauri/`) → rebuild partiel (~10–40 s en debug).
- **Ne pas** supprimer `src-tauri/target/` sauf en dernier recours.
- **Ne pas** lancer plusieurs `.\dev.ps1` en parallele (file lock Cargo).

### Si erreur linker Windows (LNK1318)

```powershell
# Mode release (tres lent, 10-20 min au 1er build) :
.\dev.ps1 -Release
```

## Build installateur

```powershell
npm run tauri:build
```

## Mises à jour automatiques

Voir [docs/MISES_A_JOUR.md](docs/MISES_A_JOUR.md) — updater Tauri, backup, releases automatisées (`git tag vX.Y.Z` → GitHub Actions).

## Base de données

Les données de production sont dans :

```
%APPDATA%\com.patrimoine-crm.app\patrimoine-crm.db
```

Ne pas lancer `reset-database.ps1` sans sauvegarde.

## Versions Tauri (npm ↔ Rust)

Les versions **minor** doivent correspondre entre `@tauri-apps/*` (npm) et les crates Rust. Après toute mise à jour :

```powershell
# npm
npm install

# Rust (dans src-tauri)
cargo update -p tauri -p tauri-build -p tauri-plugin-dialog -p tauri-plugin-fs -p tauri-plugin-shell
```

Actuellement : **Tauri 2.11** (api/cli) + plugins dialog 2.7, fs 2.5, shell 2.3.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| UI | React 19 + TypeScript + Vite 8 |
| Desktop | Tauri 2.11 (Rust) |
| Style | Tailwind CSS 4 + shadcn/ui + tw-animate-css |
| Icônes | lucide-react 1.x |
| Données | SQLite locale (runtime Rust) |

## Documentation

| Document | Contenu |
|----------|---------|
| [docs/ETIQUETTES.md](docs/ETIQUETTES.md) | Étiquettes, règles auto, alertes, perf |
| [docs/TESTS.md](docs/TESTS.md) | Tests Vitest / Cargo |
| [AGENTS.md](AGENTS.md) | Vérification automatique pour Cursor |

## Structure

```
patrimoine-crm/
├── src/              # Frontend React
├── src-tauri/        # Backend Tauri (Rust)
├── drizzle/          # Migrations SQL (scripts dev)
└── dev.ps1           # Lancement dev rapide
```
