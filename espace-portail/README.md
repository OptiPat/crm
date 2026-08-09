# Portail espace client (dev local)

Binaire Rust minimal qui reçoit les synchronisations CRM (`POST /api/v1/sync/contact/{id}`).

## Prérequis

- Rust toolchain (comme le CRM)
- Même secret que dans le CRM

## Lancer

```powershell
cd D:\crm\espace-portail
$env:ESPACE_SYNC_SECRET = "dev-sync-secret-change-me"
cargo run
```

Écoute par défaut sur `http://127.0.0.1:8787`.

## Configuration CRM

Dans l'onglet **Aperçu client** → **Connexion portail** :

| Champ | Valeur dev |
|-------|------------|
| URL | `http://127.0.0.1:8787` |
| Clé | `dev-sync-secret-change-me` (identique à `ESPACE_SYNC_SECRET`) |

Puis **Synchroniser vers le portail** sur un contact avec accès **actif**.

## Variables d'environnement

| Variable | Défaut |
|----------|--------|
| `ESPACE_SYNC_SECRET` | *(obligatoire)* |
| `ESPACE_PORTAL_BIND` | `127.0.0.1:8787` |
| `ESPACE_PORTAL_DB` | `espace-portail.db` (dans le répertoire courant) |

## Mise en ligne — à ne pas rater

Ce binaire ne fait **pas** de TLS. Il n'est jamais exposé directement sur Internet :
un reverse proxy (Caddy) termine le HTTPS et lui parle en local.

- Garder `ESPACE_PORTAL_BIND` sur `127.0.0.1` — jamais `0.0.0.0` sans proxy devant.
- Le CRM refuse une URL de portail en `http://` hors boucle locale : en production, l'URL est `https://`.
- `ESPACE_SYNC_SECRET` doit être un secret long et aléatoire, différent de celui de développement.

## Endpoints

- `GET /health` → `ok`
- `POST /api/v1/sync/contact/{contact_id}` — corps JSON signé HMAC (même algorithme que le CRM)

Phase 1 suivante : UI React statique servie par ce binaire.
