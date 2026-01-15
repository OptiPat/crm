# Installation d'OpenSSL pour SQLCipher

## Problème
SQLCipher nécessite OpenSSL pour fonctionner sur Windows.

## Solution : Installer OpenSSL

### 1. Télécharger OpenSSL
Téléchargez l'installateur depuis : https://slproweb.com/products/Win32OpenSSL.html
- Choisissez "Win64 OpenSSL v3.x.x" (version complète, pas Light)

### 2. Installer OpenSSL
- Exécutez l'installateur
- Installez dans le dossier par défaut : `C:\Program Files\OpenSSL-Win64`

### 3. Configurer les variables d'environnement
Ajoutez ces variables d'environnement système :

**PowerShell (Admin)** :
```powershell
[System.Environment]::SetEnvironmentVariable("OPENSSL_DIR", "C:\Program Files\OpenSSL-Win64", "Machine")
[System.Environment]::SetEnvironmentVariable("OPENSSL_LIB_DIR", "C:\Program Files\OpenSSL-Win64\lib\VC\x64\MD", "Machine")
[System.Environment]::SetEnvironmentVariable("OPENSSL_INCLUDE_DIR", "C:\Program Files\OpenSSL-Win64\include", "Machine")
```

### 4. Redémarrer le terminal
Fermez et rouvrez VSCode/Terminal pour charger les nouvelles variables.

### 5. Relancer la compilation
```bash
npm run tauri:dev
```

---

## Alternative : Utiliser SQLite sans chiffrement (temporaire)

Si vous voulez tester l'application rapidement sans OpenSSL :

1. Modifiez `src-tauri/Cargo.toml` :
   ```toml
   rusqlite = { version = "0.32", features = ["bundled"] }
   ```
   (au lieu de `bundled-sqlcipher`)

2. L'application fonctionnera SANS chiffrement de la base de données

---

## Vérifier l'installation OpenSSL

```powershell
openssl version
```

Devrait afficher : `OpenSSL 3.x.x ...`
