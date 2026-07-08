# Registre des notes partagées (Google Sheet)

Ce document décrit comment héberger la **bibliothèque partagée** de notes entre
installations CRM, sans exposer de secrets Google dans le dépôt public.

Les **notes personnelles** restent en SQLite locale ; seules les notes partagées
passent par ce registre.

## Pourquoi Apps Script ?

Même principe que le registre des licences (`docs/LICENSE_REGISTRY.md`) :

- L'application embarque uniquement l'**URL publique** du webhook et un **token**
  de validation (variables de compilation `NOTES_REGISTRY_*`).
- Le token réel reste dans les **propriétés du script** Google.
- Aucun accès direct au Sheet depuis le dépôt.

## 1. Créer le Google Sheet

Créez un tableur dédié, par ex. `CRM Notes partagées`.

Le script crée automatiquement les onglets `shared_notes` et `contributions` avec
les en-têtes suivants :

**Onglet `shared_notes`**

| id | title | content_html | installation_id | author_name | created_at | updated_at | content_html_2 | … |

**Onglet `contributions`**

| id | note_id | installation_id | author_name | content_html | created_at | content_html_2 | … |

> **Limite Google Sheets** : une cellule ne peut pas dépasser **50 000 caractères**.
> Le script découpe automatiquement le HTML volumineux (images base64, etc.) sur
> les colonnes `content_html`, `content_html_2`, … jusqu’à ~**900 000** caractères
> au total. Les notes déjà enregistrées (&lt; 50k) restent lisibles sans migration.

Les dates sont stockées en **timestamp Unix** (secondes, ex. `1751968800`).

## 2. Coller le script Apps Script

Dans le Sheet : **Extensions → Apps Script**, collez le contenu de
`scripts/notes/google-sheet-notes-registry.gs`, puis :

> Si le registre existait déjà : **remplacez tout le script** par la nouvelle
> version (découpage multi-colonnes pour les notes longues). Les colonnes
> `content_html_2`, … sont ajoutées automatiquement au prochain appel.

1. **Déployer → Nouveau déploiement → Application web**
   - Exécuter en tant que : **Moi**
   - Accès : **Tout le monde** (le token protège l'écriture)
2. Copiez l'URL du webhook (`https://script.google.com/macros/s/.../exec`)

### Token (hors dépôt)

Dans Apps Script : **Paramètres du projet → Propriétés du script** :

| Propriété | Valeur |
|-----------|--------|
| `NOTES_REGISTRY_TOKEN` | Chaîne aléatoire longue (ex. `openssl rand -hex 32`) |

Générer un token (PowerShell) :

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

## 3. Fichier local de build

Ajoutez dans `license-build.local.ps1` (gitignoré) :

```powershell
$env:NOTES_REGISTRY_URL = "https://script.google.com/macros/s/VOTRE_ID/exec"
$env:NOTES_REGISTRY_TOKEN = "meme-token-que-NOTES_REGISTRY_TOKEN"
```

`dev.ps1` et `scripts/publish-release.ps1` chargent ce fichier avant la
compilation Rust.

Tester le webhook :

```powershell
.\scripts\test-notes-registry.ps1
```

La réponse doit contenir `"ok": true` avec des listes `notes` et `contributions`
(vides au départ).

## 4. Variables de compilation (alternative manuelle)

```powershell
$env:NOTES_REGISTRY_URL = "https://script.google.com/macros/s/VOTRE_ID/exec"
$env:NOTES_REGISTRY_TOKEN = "meme-token-que-NOTES_REGISTRY_TOKEN"
npm run tauri:build
```

Sans ces variables, les **notes personnelles** fonctionnent ; la bibliothèque
partagée affiche une erreur de configuration à la création / synchronisation.

## 5. Comportement métier

| Action | Qui | Effet |
|--------|-----|-------|
| Créer une note | Toute installation activée | Nouvelle ligne dans `shared_notes` |
| Modifier le corps | **Auteur uniquement** | Mise à jour `content_html` + `updated_at` |
| Supprimer | **Auteur uniquement** | Suppression note + contributions liées |
| Enrichir | Toute installation | Append-only dans `contributions` (corps d'origine intact) |
| Sync | Toute installation | Lecture complète des deux onglets → cache SQLite local |

L'`installation_id` et le nom d'auteur proviennent du statut de licence locale.

## 6. CI / release GitHub

Dans les secrets du dépôt (workflow `release.yml`) :

| Secret | Contenu |
|--------|---------|
| `NOTES_REGISTRY_URL` | URL du déploiement Apps Script |
| `NOTES_REGISTRY_TOKEN` | Même valeur que `NOTES_REGISTRY_TOKEN` côté script |

Les builds release incluent alors le registre notes comme pour les licences.
