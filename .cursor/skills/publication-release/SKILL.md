---
name: publication-release
description: >-
  Publier une version Patrimoine CRM W.Y.S (verify:full, bump, commit, push main,
  tag vX.Y.Z, GitHub Actions). Utiliser quand l'utilisateur demande release, bump,
  tag, publier ou mettre en ligne une version.
---

# Publication release — Patrimoine CRM

Règle complète : `.cursor/rules/publication-version.mdc`.

## Prérequis

- Branche `main`, working tree propre (ou commits feature déjà faits).
- **`npm run verify:full`** vert — obligatoire (build Vite inclus).
- Push / tag **uniquement** si l'utilisateur le demande explicitement.

## Séquence agent

```powershell
cd D:\crm

# 1. Vérification (obligatoire)
npm run verify:full

# 2. (Recommandé) Préchauffer Cargo si src-tauri/** touché récemment
cd src-tauri; cargo check; cd ..

# 3. Bump (X.Y.Z = prochain patch/minor)
.\scripts\bump-version.ps1 X.Y.Z

# 4. Commit version
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: version X.Y.Z"

# 5. Push + tag (demande explicite utilisateur)
git push origin main
.\scripts\release-tag.ps1 X.Y.Z
```

## Cargo bloqué pendant bump

Symptôme : « Synchronisation Cargo.lock » longtemps (>5 min).

- **Cause** : compilation cache froid (deps Windows), pas une erreur Rust.
- **Les fichiers version sont déjà mis à jour** avant `cargo check`.
- **Récupération** :
  ```powershell
  cd D:\crm\src-tauri; cargo check
  cd D:\crm
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -m "chore: version X.Y.Z"
  ```
- Alternative : `cargo check` vert puis `.\scripts\bump-version.ps1 X.Y.Z -SkipCargoCheck`.

## npm lockfile CI

Si `package-lock.json` modifié :

```powershell
npx npm@10.9.2 ci
```

## Après tag

- Suivre : https://github.com/OptiPat/crm/actions (~15–30 min).
- Échec workflow sans installateur publié : fix sur `main`, `git push origin :refs/tags/vX.Y.Z`, relancer `release-tag.ps1`.

## Interdits

- BOM UTF-8 sur JSON/TOML (utiliser `bump-version.ps1`).
- Recréer un tag déjà publié avec installateur.
- `git push` / tag sans demande explicite.
