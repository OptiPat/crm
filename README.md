# Patrimoine CRM

CRM Desktop pour Conseillers en Gestion de Patrimoine (CGP)

## Prérequis

- Node.js 18+
- Rust (via rustup)
- Visual Studio Build Tools (Windows)

## Installation

```bash
npm install
```

## Développement

```bash
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

## Stack Technique

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Desktop**: Tauri 2.x
- **Base de données**: SQLite + SQLCipher
- **ORM**: Drizzle ORM

## Structure

```
patrimoine-crm/
├── src/              # Frontend React
├── src-tauri/        # Backend Tauri (Rust)
└── drizzle/          # Migrations DB
```
