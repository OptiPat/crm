# Portail espace client (dev local)

Binaire Rust qui reçoit les synchronisations CRM et sert l'UI React en lecture seule.

## Prérequis

- Rust toolchain (comme le CRM)
- Dépendances npm **du dépôt racine** (lockfile `package-lock.json` — ne pas lancer `npm install` dans `web/`)

### Sécurité npm (ChainDrop, août 2026)

Après la compromission massive npm (ver ChainDrop, `preinstall` + C2 Ethereum), **ne jamais** créer un `package.json` / lockfile séparé sous `espace-portail/web/`. Le build UI réutilise exclusivement les paquets déjà épinglés à la racine du CRM (`keyv@4.5.4`, etc. — versions antérieures aux paquets compromis).

```powershell
# Depuis la racine du dépôt — pas dans espace-portail/web/
cd D:\crm
npm ci   # ou dépendances déjà installées
npm run build:espace-portail
```

## Build + lancer

```powershell
cd D:\crm
npm run build:espace-portail

cd espace-portail
$env:ESPACE_SYNC_SECRET = "dev-sync-secret-change-me"
$env:ESPACE_PORTAL_DEV = "1"   # lecture patrimoine SANS authentification : dev local uniquement
cargo run
```

Écoute par défaut sur `http://127.0.0.1:8787`. Ouvrir `http://127.0.0.1:8787/?contact=ID` après une sync CRM.

UI en dev live (proxy vers le portail) :

```powershell
cd D:\crm
npm run dev:espace-portail
```

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
| `ESPACE_PORTAL_STATIC` | `web/dist` |
| `ESPACE_PORTAL_DEV` | `false` — mettre `1` expose `GET /api/v1/patrimoine/{id}` **sans auth client** |

## Mise en ligne — à ne pas rater

Ce binaire ne fait **pas** de TLS. Il n'est jamais exposé directement sur Internet :
un reverse proxy (Caddy) termine le HTTPS et lui parle en local.

- Garder `ESPACE_PORTAL_BIND` sur `127.0.0.1` — jamais `0.0.0.0` sans proxy devant.
- Le CRM refuse une URL de portail en `http://` hors boucle locale : en production, l'URL est `https://`.
- `ESPACE_SYNC_SECRET` doit être un secret long et aléatoire, différent de celui de développement.
- `ESPACE_PORTAL_DEV` est **désactivé par défaut**. Le binaire refuse de démarrer si ce mode est
  actif sur une adresse d'écoute non locale : la lecture patrimoine sans authentification ne peut
  pas se retrouver joignable par accident.

## Endpoints

- `GET /health` → `ok`
- `POST /api/v1/sync/contact/{contact_id}` — corps JSON signé HMAC (même algorithme que le CRM)
- `GET /api/v1/patrimoine/{contact_id}` — **dev uniquement** (`ESPACE_PORTAL_DEV`), snapshot synchronisé
- `GET /*` — fichiers statiques `web/dist` (SPA)
