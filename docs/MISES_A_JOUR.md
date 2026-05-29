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

## Publier une version pour vous et votre associé

1. Incrémenter la version dans `package.json` et `src-tauri/tauri.conf.json` (et `Cargo.toml`).
2. Builder :

```powershell
.\scripts\publish-release.ps1
```

3. Créer une **Release GitHub** avec le tag `vX.Y.Z`.
4. Y joindre :
   - `latest.json` (généré par le script)
   - l’installateur Windows (`.exe` ou `.msi`) + son fichier `.sig`

Votre associé **n’a rien à réinstaller** : au prochain lancement (ou via Paramètres → Mises à jour), l’app propose la MAJ.

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
    }
  }
}
```

La `signature` est le **contenu texte** du fichier `.sig` généré au build, pas une URL.

## Restaurer après une MAJ problématique

1. Fermer l’application.
2. Aller dans `%APPDATA%\com.patrimoine-crm.app\backups\`.
3. Copier la sauvegarde souhaitée vers `patrimoine-crm.db` (remplacer).
4. Relancer l’app.

## Mode développement

Les vérifications automatiques sont **désactivées** en `npm run tauri:dev` (pas de fausses MAJ).
