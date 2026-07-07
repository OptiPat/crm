# Mises à jour automatiques (Patrimoine CRM)

## Principe

- **Logiciel** : mis à jour via Tauri Updater (notification dans l'app, un clic).
- **Données** : restent dans `%APPDATA%\com.patrimoine-crm.app\` — jamais envoyées sur un serveur.
- **Sécurité** : avant chaque démarrage sur une base existante, copie automatique dans `backups/`.

## Configuration initiale (une fois)

### 1. Clés de signature

```powershell
npx tauri signer generate --write-keys "$env:USERPROFILE\.tauri\patrimoine-crm.key" --force
```

- **Privée** : `~\.tauri\patrimoine-crm.key` — ne jamais commiter, ne jamais partager.
- **Publique** : déjà référencée dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

### 2. Dépôt GitHub Releases

Endpoint configuré :

```
https://github.com/OptiPat/crm/releases/latest/download/latest.json
```

Le dépôt doit être **public** (ou les MAJ auto ne pourront pas télécharger les fichiers).

### 3. Variables d’environnement pour builder

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\patrimoine-crm.key"
```

## Publier une version (automatisé — GitHub Actions)

### Configuration une seule fois

1. GitHub → **OptiPat/crm** → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** :
   - Nom : `TAURI_SIGNING_PRIVATE_KEY`
   - Valeur : **tout le contenu** du fichier `%USERPROFILE%\.tauri\patrimoine-crm.key` (copier-coller)
3. (Optionnel) Si votre clé a un mot de passe : secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`  
   Sinon ne créez pas ce secret (clé sans mot de passe).

### À chaque nouvelle version

1. Mettre la **même** version dans :
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit + push sur `main`
3. Lancer :

```powershell
.\scripts\release-tag.ps1 0.1.1
```

→ Le workflow **Release CRM W.Y.S** build, signe, crée la release et uploade `.exe`, `.sig`, `latest.json`.

Suivi : https://github.com/OptiPat/crm/actions (~15–30 min)

Votre associé : **Paramètres → Mises à jour** dans l’app (1 clic), pas de retéléchargement manuel.

### Publication manuelle (secours)

```powershell
.\scripts\publish-release.ps1
```

Puis release GitHub à la main (voir ancienne procédure ci-dessous).

---

## Publication manuelle (détail)

1. Incrémenter la version dans les 3 fichiers ci-dessus.
2. `.\scripts\publish-release.ps1`
3. Release GitHub `vX.Y.Z` + `.exe` + `.sig` + `latest.json` (sans BOM UTF-8)

## Fichier `latest.json` (exemple)

```json
{
  "version": "0.2.0",
  "notes": "Corrections import contacts",
  "pub_date": "2026-05-29T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/OptiPat/crm/releases/download/v0.2.0/Patrimoine.CRM_0.2.0_x64-setup.exe",
      "signature": "CONTENU_DU_FICHIER .sig"
    },
    "darwin-aarch64": {
      "url": "https://github.com/OptiPat/crm/releases/download/v0.2.0/CRM.W.Y.S_0.2.0_universal.app.tar.gz",
      "signature": "CONTENU_DU_FICHIER .app.tar.gz.sig"
    }
  }
}
```

**macOS** : l’updater in-app utilise le **`.app.tar.gz`**, pas le `.dmg` (install initiale seulement). Sans entrée `darwin-aarch64` dans `latest.json`, le bouton « Rechercher mise à jour » échoue sur Mac.

Le workflow CI (`release.yml`) génère ce fichier via `scripts/ci-merge-latest-json.mjs` après les builds Windows et macOS.

La `signature` est le **contenu texte** du fichier `.sig` généré au build, pas une URL.

## Restaurer après une MAJ problématique

1. Fermer l’application.
2. Aller dans `%APPDATA%\com.patrimoine-crm.app\backups\`.
3. Copier la sauvegarde souhaitée vers `patrimoine-crm.db` (remplacer).
4. Relancer l’app.

## Mode développement

Les vérifications automatiques sont **désactivées** en `npm run tauri:dev` (pas de fausses MAJ).
