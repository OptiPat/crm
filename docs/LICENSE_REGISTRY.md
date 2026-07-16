# Registre des installations (Google Sheet)

Ce document décrit comment suivre **qui a installé le CRM** via un Google Sheet,
sans exposer de secrets Google dans le dépôt public.

## Pourquoi Apps Script (et pas l'API Sheets directe) ?

| Approche | Problème avec un repo public |
|----------|------------------------------|
| **API Google Sheets + compte de service** | Il faudrait embarquer une clé JSON dans l'exe → extractible |
| **Apps Script (webhook)** | Seule l'URL publique est dans l'app ; le token de validation reste côté Google |

Apps Script tient dans le Sheet et suffit pour enregistrer les activations.

## 1. Créer le Google Sheet

Créez un tableur nommé par ex. `CRM Installations` avec ces colonnes (ligne 1) :

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| installation_id | client_email | client_name | cabinet | license_type | license_key | status | activated_at | expires_at | installed_at | app_version | os | legacy | last_event | updated_at |

Les dates sont stockées en ISO (`2026-07-08T10:00:00Z`) par le script.

## 2. Coller le script Apps Script

Dans le Sheet : **Extensions → Apps Script**, collez le contenu de
`scripts/licensing/google-sheet-registry.gs`, puis :

1. **Projet → Paramètres du projet** : notez l'**ID de déploiement** si besoin
2. **Déployer → Nouveau déploiement → Application web**
   - Exécuter en tant que : **Moi**
   - Accès : **Tout le monde** (le token protège l'écriture)
3. Copiez l'URL du webhook (`https://script.google.com/macros/s/.../exec`)

### Token (hors dépôt)

Dans Apps Script : **Paramètres du projet → Propriétés du script** :

| Propriété | Valeur |
|-----------|--------|
| `REGISTRY_TOKEN` | Chaîne aléatoire longue (ex. `openssl rand -hex 32`) |

Générer un token (PowerShell) :

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

## 3. Fichier local de build (recommandé)

```powershell
Copy-Item license-build.local.ps1.example license-build.local.ps1
# Éditez license-build.local.ps1 : URL, token, secret de signature
```

Ce fichier est **gitignoré**. `dev.ps1` et `scripts/publish-release.ps1` le chargent
automatiquement avant la compilation Rust.

Tester le webhook :

```powershell
.\scripts\test-license-registry.ps1
```

Une ligne `test@example.com` doit apparaître dans l'onglet `installations` du Sheet.

## 4. Variables de compilation (alternative manuelle)

À la compilation **release**, vous pouvez aussi définir (PowerShell) :

```powershell
$env:LICENSE_REGISTRY_URL = "https://script.google.com/macros/s/VOTRE_ID/exec"
$env:LICENSE_REGISTRY_TOKEN = "meme-token-que-REGISTRY_TOKEN"
$env:LICENSE_SIGNING_SECRET = "secret-local-pour-signer-les-cles"
npm run tauri:build
```

- Sans ces variables, le CRM fonctionne en local (essai / legacy) mais **n'envoie pas** au Sheet.
- **Ne commitez jamais** ces valeurs dans le dépôt public.

### Secrets GitHub Actions (releases Windows **et macOS**)

Le workflow `.github/workflows/release.yml` compile **macOS** (`.dmg`) et **Windows**
(`.exe`) avec les mêmes variables. Dans GitHub → **Settings → Secrets → Actions** :

| Secret | Valeur |
|--------|--------|
| `LICENSE_REGISTRY_URL` | URL Apps Script `/exec` |
| `LICENSE_REGISTRY_TOKEN` | Même token que `REGISTRY_TOKEN` |
| `LICENSE_SIGNING_SECRET` | Même secret que compilation locale |

Sans ces secrets, les builds CI publieront un CRM (`.exe` **et** `.dmg`) sans registre
ni validation de clés.

### Build local macOS

Même fichier `license-build.local.ps1`, chargé via `pwsh` :

```bash
pwsh ./dev.ps1
pwsh ./scripts/publish-release.ps1
```

Les 3 variables sont identiques à Windows — le registre Google Sheet est commun à toutes
les plateformes.

## 5. Générer une clé de licence

```powershell
$env:LICENSE_SIGNING_SECRET = "meme-secret-que-compilation"
node scripts/generate-license-key.mjs annual 2706
node scripts/generate-license-key.mjs lifetime
```

Format : `ANNU-YYMM-RRRR-SSSS` ou `LIFE-0000-RRRR-SSSS`

## 6. Événements envoyés par le CRM

| event | Quand |
|-------|-------|
| `trial_start` | Nouvelle install — accès gratuit (sans expiration tant que facturation inactive) |
| `activate` | Clé de licence valide saisie |
| `register_existing` | Migration d'une install déjà en place (active sans expiration) |
| `heartbeat` | Au plus 1×/jour si registre configuré |

## 7. Installations déjà en place

À la première ouverture **après mise à jour**, si le wizard était déjà complété :

- génération d'un `installation_id`
- statut `legacy` **actif sans expiration** (pas de facturation pour l'instant)
- envoi `register_existing` vers le Sheet (si URL configurée à la compilation)

Aucun écran bloquant pour ces utilisateurs.

## 8. Intégrité de l'état licence

Chaque `license_state` est signé (HMAC) à l'enregistrement. Une modification manuelle
via `set_setting` est **bloquée**. En production (`LICENSE_SIGNING_SECRET` défini),
un état falsifié est ignoré.

## 9. Expiration et mode lecture seule

- Licence expirée : **lecture seule** sur les données métier (contacts, investissements…)
- Renouvellement possible via **Paramètres → Application → Licence** ou l'écran d'activation
- Les écritures `settings` restent autorisées (renouvellement licence, profil CGP)

## 10. Facturation (plus tard)

Les colonnes `amount_eur`, `invoice_ref`, `paid_at` pourront être ajoutées
manuellement dans le Sheet. Le module licence fournit déjà identité, type,
dates et statut — sans logique de facturation dans l'app.
