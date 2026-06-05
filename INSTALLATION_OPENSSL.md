# Chiffrement SQLCipher — prérequis de BUILD

Le chiffrement de la base (SQLCipher / AES-256) est **actif**. OpenSSL est compilé
depuis ses sources et embarqué dans le binaire (feature `bundled-sqlcipher-vendored-openssl`).

> Aucune dépendance OpenSSL à installer chez l'**utilisateur final** : tout est dans l'exécutable.

## Prérequis pour COMPILER (développeurs + CI uniquement)

La compilation d'OpenSSL depuis les sources nécessite **Perl** et **NASM** sur le PATH.

### Windows (poste de dev)

```powershell
winget install --id StrawberryPerl.StrawberryPerl -e
winget install --id NASM.NASM -e
```

Puis **rouvrir le terminal** (rafraîchit le PATH). Vérification :

```powershell
perl --version ; nasm -v
```

### CI (GitHub Actions, `windows-latest`)

- **Perl** : Strawberry Perl est préinstallé sur l'image.
- **NASM** : installé par le workflow `.github/workflows/release.yml`
  (`choco install nasm`).

## Modèle de chiffrement (résumé)

- Une **clé de données** (DEK) aléatoire chiffre la base via SQLCipher.
- La DEK est scellée (chiffrée) par une clé dérivée du **mot de passe maître**
  (Argon2id) et par la **clé de récupération** — jamais stockée en clair.
- Au déverrouillage, le mot de passe désemballe la DEK puis ouvre la base.
- Les bases des anciennes versions (en clair) sont **migrées automatiquement**
  vers SQLCipher au premier déverrouillage, après sauvegarde.

Détails du code : `src-tauri/src/auth/crypto.rs`, `src-tauri/src/auth/mod.rs`,
`src-tauri/src/database/mod.rs` (`open_encrypted`).
