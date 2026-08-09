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

## Lancer

Première fois seulement : créer la configuration locale.

```powershell
cd D:\crm
Copy-Item espace-portail\.env.example espace-portail\.env
.\espace-portail\config-brevo.ps1   # optionnel : envoi réel des codes par email
```

Ensuite, à chaque test :

```powershell
cd D:\crm\espace-portail
.\dev.ps1
```

`dev.ps1` lit `.env` et lance le binaire — aucune variable à poser à la main.
Écoute sur `http://127.0.0.1:8787`.

Sans clé Brevo, les codes de connexion s'affichent dans les logs du portail au
lieu d'être envoyés par email : suffisant pour tester le parcours complet.

Après modification de l'UI React :

```powershell
cd D:\crm
npm run build:espace-portail
```

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
| `ESPACE_BREVO_API_KEY` | *(obligatoire hors dev)* — clé Brevo dédiée à l'envoi transactionnel |
| `ESPACE_MAIL_FROM` | *(obligatoire hors dev)* — adresse d'expédition |
| `ESPACE_MAIL_FROM_NAME` | `Votre conseiller` — nom affiché du cabinet |

## Envoi des codes de connexion

Le portail envoie **lui-même** les codes, au moment où le client les demande. Le CRM
n'intervient pas : c'est une application de bureau, éteinte la nuit, et un client doit
pouvoir se connecter un dimanche soir.

Sans `ESPACE_BREVO_API_KEY` ni `ESPACE_MAIL_FROM`, le binaire **refuse de démarrer** hors
mode dev — un portail incapable d'envoyer un code est un portail où personne ne peut entrer.
En mode dev, le code s'affiche dans les logs à la place.

Le code à six chiffres est valable 15 minutes, à usage unique, et n'est **jamais** stocké en
clair : seule son empreinte va en base. L'email ne contient aucun lien : les antivirus de
messagerie pré-ouvrent les URL et consommeraient un jeton à usage unique.

La réponse à une demande de code est identique que l'adresse existe ou non, faute de quoi
le portail révélerait quelles adresses possèdent un espace.

## Durée des sessions

| Réglage | Valeur | Ce que ça protège |
|---------|--------|-------------------|
| Inactivité | 30 min | Le téléphone laissé déverrouillé sur une table |
| Appareil reconnu | 30 jours | Un téléphone perdu ou revendu cesse d'être autorisé |

Au-delà, un nouveau code est demandé. Le conseiller peut couper toutes les sessions d'un
client depuis le CRM en révoquant son accès.

## Mise en ligne — à ne pas rater

Ce binaire ne fait **pas** de TLS. Il n'est jamais exposé directement sur Internet :
un reverse proxy (Caddy) termine le HTTPS et lui parle en local.

- Garder `ESPACE_PORTAL_BIND` sur `127.0.0.1` — jamais `0.0.0.0` sans proxy devant.
- Le CRM refuse une URL de portail en `http://` hors boucle locale : en production, l'URL est `https://`.
- `ESPACE_SYNC_SECRET` doit être un secret long et aléatoire, différent de celui de développement.
- `ESPACE_BREVO_API_KEY` : créer une clé **dédiée au portail**, distincte de celle du CRM, pour
  pouvoir la révoquer sans couper la newsletter.
- `ESPACE_PORTAL_DEV` est **désactivé par défaut**. Le binaire refuse de démarrer si ce mode est
  actif sur une adresse d'écoute non locale : la lecture patrimoine sans authentification ne peut
  pas se retrouver joignable par accident.

## Endpoints

- `GET /health` → `ok`
- `POST /api/v1/sync/contact/{contact_id}` — corps JSON signé HMAC (même algorithme que le CRM)
- `GET /api/v1/patrimoine/{contact_id}` — **dev uniquement** (`ESPACE_PORTAL_DEV`), snapshot synchronisé
- `GET /*` — fichiers statiques `web/dist` (SPA)
