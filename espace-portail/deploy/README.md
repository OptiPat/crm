# Espace client — déploiement HTTPS (Caddy)

Le binaire `espace-portail` **ne termine pas le TLS**. En production, Caddy (ou équivalent)
reçoit le trafic Internet et relaie en HTTP local vers `127.0.0.1:8787`.

## Prérequis serveur

- VPS en Union européenne (données patrimoniales)
- Nom de domaine pointant vers le VPS (`espace.votre-cabinet.fr`)
- Ports 80 et 443 ouverts
- ClamAV installé (`clamd` actif sur `127.0.0.1:3310`) — requis dès la phase dépôt de documents

## Installation

```bash
sudo apt update
sudo apt install -y caddy clamav clamav-daemon
sudo systemctl enable --now clamav-daemon
```

Copier le binaire et les fichiers statiques :

```bash
sudo useradd --system --home /opt/espace-portail espace
sudo mkdir -p /opt/espace-portail
# espace-portail (release), web/dist/, .env production
```

## Caddyfile

Adapter `espace.votre-cabinet.fr`, puis :

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Variables d'environnement (production)

| Variable | Valeur |
|----------|--------|
| `ESPACE_PRODUCTION` | `1` |
| `ESPACE_TRUST_PROXY` | `1` |
| `ESPACE_PORTAL_BIND` | `127.0.0.1:8787` |
| `ESPACE_SYNC_SECRET` | secret long, unique |
| `ESPACE_BREVO_API_KEY` | clé dédiée portail |
| `ESPACE_MAIL_FROM` | `noreply@espace.votre-cabinet.fr` (domaine authentifié SPF/DKIM) |
| `ESPACE_CLAMD_ADDR` | `127.0.0.1:3310` |

Dans le CRM : URL portail = `https://espace.votre-cabinet.fr` (le CRM refuse `http://` hors localhost).

## Service systemd (exemple)

```ini
[Unit]
Description=Portail espace client Patrimoine CRM
After=network.target clamav-daemon.service

[Service]
User=espace
WorkingDirectory=/opt/espace-portail
EnvironmentFile=/opt/espace-portail/.env
ExecStart=/opt/espace-portail/espace-portail
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Contrôles après mise en ligne

1. `curl -I https://espace.votre-cabinet.fr/health` — statut 200, en-têtes `Strict-Transport-Security`, `Content-Security-Policy`
2. Tentatives répétées sur `/api/v1/auth/request-code` → `429` après le seuil IP
3. Cookie de session avec attribut `Secure`
4. `ESPACE_PORTAL_DEV` absent ou `0`

## Sauvegarde

La base `espace-portail.db` est reconstructible depuis le CRM, sauf la fenêtre entre une
action client et la prochaine synchronisation. Sauvegarder quotidiennement et tester une
restauration au moins une fois.
