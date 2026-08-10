# Espace client — déploiement HTTPS (Caddy)

Le binaire `espace-portail` **ne termine pas le TLS**. Caddy reçoit le trafic Internet
et relaie en HTTP local vers `127.0.0.1:8787`.

## Ce qu'il vous faut avant de commencer

| Élément | Exemple |
|---------|---------|
| **VPS** | Debian/Ubuntu, UE, ports 80 + 443 ouverts |
| **Domaine du portail** | `espace.mondomaine.fr` → enregistrement DNS **A** vers l'IP du VPS |
| **Brevo** | Clé API + expéditeur validé (votre Gmail si c'est déjà le cas) |
| **Secret sync** | Généré une fois, identique CRM + portail |

L'URL du portail et l'adresse d'envoi des emails sont **indépendantes** (Gmail OK).

---

## Étape 1 — Depuis votre PC (Windows)

```powershell
cd D:\crm
.\espace-portail\deploy\generate-sync-secret.ps1   # copie dans le presse-papier
.\espace-portail\deploy\pack-for-vps.ps1             # crée dist-espace-portail-vps.zip
```

Conservez le secret : vous le collerez dans le CRM **et** dans le `.env` du VPS.

## Étape 2 — Envoyer sur le VPS

```bash
scp D:\crm\dist-espace-portail-vps.zip user@IP_DU_VPS:/tmp/
ssh user@IP_DU_VPS
```

## Étape 3 — Installer sur le VPS

```bash
sudo rm -rf /tmp/espace-build
mkdir /tmp/espace-build
unzip -o /tmp/dist-espace-portail-vps.zip -d /tmp/espace-build
sudo bash /tmp/espace-build/deploy/install-vps.sh espace.VOTRE-DOMAINE.FR /tmp/espace-build
```

Le script installe Caddy, Rust (si besoin), compile le binaire, configure systemd.

## Étape 4 — Configurer le `.env` production

```bash
sudo nano /opt/espace-portail/.env
```

| Variable | Valeur |
|----------|--------|
| `ESPACE_PRODUCTION` | `1` |
| `ESPACE_TRUST_PROXY` | `1` |
| `ESPACE_SYNC_SECRET` | secret généré à l'étape 1 |
| `ESPACE_BREVO_API_KEY` | clé Brevo portail |
| `ESPACE_MAIL_FROM` | votre Gmail validé dans Brevo |
| `ESPACE_MAIL_FROM_NAME` | nom affiché |

Puis :

```bash
sudo systemctl start espace-portail
sudo systemctl status espace-portail
```

## Étape 5 — CRM

Onglet **Aperçu client** → **Connexion portail** :

| Champ | Valeur |
|-------|--------|
| URL | `https://espace.VOTRE-DOMAINE.FR` |
| Clé | même `ESPACE_SYNC_SECRET` |

**Synchroniser vers le portail** sur un contact test, puis tester la connexion client.

## Contrôles

```bash
curl -I https://espace.VOTRE-DOMAINE.FR/health
```

Attendu : `200`, en-têtes `strict-transport-security`, `content-security-policy`.

## Fichiers de ce dossier

| Fichier | Rôle |
|---------|------|
| `Caddyfile` | Modèle HTTPS (domaine substitué par `install-vps.sh`) |
| `espace-portail.service` | Unit systemd |
| `env.production.example` | Modèle `.env` |
| `install-vps.sh` | Installation automatisée sur le VPS |
| `pack-for-vps.ps1` | Archive à envoyer depuis Windows |
| `generate-sync-secret.ps1` | Génère le secret HMAC |

## Sauvegarde

`/opt/espace-portail/data/espace-portail.db` — reconstructible depuis le CRM, mais
sauvegarder quand même (cron + test de restauration).

## ClamAV

Optionnel tant que le dépôt de documents (phase 2) n'est pas ouvert. Le module
`document_scan.rs` est prêt pour plus tard.
