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
| **Secret auth** | Généré en même temps, **portail uniquement** (OTP + sessions) |

L'URL du portail et l'adresse d'envoi des emails sont **indépendantes** (Gmail OK).

---

## Étape 1 — Depuis votre PC (Windows)

```powershell
cd D:\crm
.\espace-portail\deploy\generate-sync-secret.ps1   # copie dans le presse-papier
.\espace-portail\deploy\pack-for-vps.ps1             # crée dist-espace-portail-vps.zip
```

Conservez les deux secrets : `ESPACE_SYNC_SECRET` dans le CRM **et** le `.env` VPS ;
`ESPACE_AUTH_SECRET` dans le `.env` VPS seulement.

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
| `ESPACE_SYNC_SECRET` | secret sync généré à l'étape 1 (CRM + portail) |
| `ESPACE_AUTH_SECRET` | secret auth généré à l'étape 1 (portail seulement) |
| `ESPACE_BREVO_API_KEY` | clé Brevo portail |
| `ESPACE_MAIL_FROM` | votre Gmail validé dans Brevo |
| `ESPACE_MAIL_FROM_NAME` | nom affiché |

Personnalisation, toutes facultatives — le portail reste générique sans elles :

| Variable | Effet |
|----------|-------|
| `ESPACE_PORTAL_BRAND_NAME` | Nom du cabinet à côté du titre |
| `ESPACE_PORTAL_LOGO_URL` | Chemin du logo, ex. `/branding/logo.png` |
| `ESPACE_PORTAL_LOGIN_TAGLINE` | Accroche de l'écran de connexion |
| `ESPACE_PORTAL_COLOR_SCHEME` | `system` (défaut), `light` ou `dark` |
| `ESPACE_PRIVACY_CONTROLLER` | Responsable de traitement affiché |
| `ESPACE_PRIVACY_CONTROLLER_DETAILS` | Mentions légales, `\\n` sépare les lignes (double antislash : systemd en retire un) |
| `ESPACE_PRIVACY_CONTACT_EMAIL` | Contact exercice des droits RGPD |
| `ESPACE_PRIVACY_UPDATED` | Libellé de mise à jour de la page |

Le logo se dépose dans `espace-portail/web/public/branding/` : Vite le copie dans
`dist` et l'installeur le publie. Ce dossier est **hors dépôt** (`.gitignore`) —
le logo d'un cabinet n'a rien à faire dans un dépôt public partagé.

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

---

## Mettre à jour un portail déjà en ligne

Le même installeur sert aux mises à jour : il recompile et redémarre, sans jamais
écraser `/opt/espace-portail/.env` (il ne le crée que s'il est absent). Les secrets
et la personnalisation survivent donc au déploiement.

Depuis le poste de l'éditeur, avec un alias SSH `espace-vps` défini dans
`~/.ssh/config` et un accès par clé :

```powershell
cd D:\crm
.\espace-portail\deploy\pack-for-vps.ps1
scp -o BatchMode=yes D:\crm\dist-espace-portail-vps.zip espace-vps:/tmp/
ssh espace-vps "sudo rm -rf /tmp/espace-build; mkdir -p /tmp/espace-build; unzip -q -o /tmp/dist-espace-portail-vps.zip -d /tmp/espace-build 2>/dev/null"
ssh espace-vps "sudo bash /tmp/espace-build/deploy/install-vps.sh espace.VOTRE-DOMAINE.FR /tmp/espace-build"
ssh espace-vps "sudo systemctl restart espace-portail"
```

Compter environ trois minutes de compilation Rust quand les dépendances ont changé.

Modifier une variable d'environnement seule ne nécessite **pas** de redéploiement,
un redémarrage suffit :

```powershell
ssh espace-vps "sudo sed -i '/^ESPACE_PORTAL_COLOR_SCHEME=/d' /opt/espace-portail/.env; echo 'ESPACE_PORTAL_COLOR_SCHEME=dark' | sudo tee -a /opt/espace-portail/.env >/dev/null; sudo systemctl restart espace-portail"
```

En revanche, toute variable **lue par le binaire** doit exister dans le binaire
déployé : ajouter un réglage au code sans redéployer ne produit aucun effet, et le
symptôme est trompeur puisque le `.env` semble correct.

## Pièges rencontrés en production

| Symptôme | Cause | Correctif |
|----------|-------|-----------|
| `$'\r': command not found` | Scripts en CRLF | `pack-for-vps.ps1` normalise déjà ; sinon `sed -i 's/\r$//'` |
| `appears to use backslashes` | Entrées zip Windows | Avertissement sans gravité, `unzip` convertit |
| Caddy refuse de recharger | `/var/log/caddy` non accessible | `chown -R caddy:caddy /var/log/caddy` |
| Réglage `.env` sans effet | Clé absente du binaire déployé | Redéployer, pas seulement redémarrer |
| Logo invisible | PNG sans transparence + fusion CSS | Fournir un PNG à fond réellement transparent |
| `clamd requis mais injoignable` | Socket Debian, pas TCP | Défaut `/run/clamav/clamd.ctl`, voir § ClamAV |

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
| `generate-sync-secret.ps1` | Génère les secrets sync + auth |
| `backup-portail.sh` | Sauvegarde quotidienne DB + uploads |
| `restore-portail-test.sh` | Test de restauration (mensuel) |

## Sauvegarde

Le portail est **reconstructible depuis le CRM** (snapshots, accès, demandes), mais pas
instantanément : fenêtre entre saisie client et prochaine sync, dépôts non rapatriés,
journal des connexions et sessions actives.

### Quoi sauvegarder

| Élément | Chemin | Priorité |
|---------|--------|----------|
| Base SQLite | `/opt/espace-portail/data/espace-portail.db` | Haute |
| Dépôts en attente | `/opt/espace-portail/data/uploads/` | Haute |
| `.env` | `/opt/espace-portail/.env` | Haute (hors dépôt git) |
| UI statique | `/opt/espace-portail/web/dist/` | Basse (rebuild) |

### Script quotidien

```bash
sudo bash /opt/espace-portail/deploy/backup-portail.sh
```

Le lancement quotidien n'est pas à configurer à la main : `install-vps.sh` copie
les deux scripts dans `/opt/espace-portail/deploy/`, installe `sqlite3` dont ils
dépendent, et écrit la tâche planifiée `/etc/cron.d/espace-portail-backup`
(03:00 UTC, `umask 077`, journal dans `/var/log/espace-backup.log`).

Vérifier qu'elle tourne :

```bash
sudo tail -3 /var/log/espace-backup.log
ls -l /opt/espace-portail/backups
```

Rétention par défaut : 30 jours (`ESPACE_BACKUP_RETENTION_DAYS`).

### Test de restauration (mensuel)

```bash
sudo bash /opt/espace-portail/deploy/restore-portail-test.sh
```

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Voir aussi
`docs/ESPACE_CLIENT_INCIDENT.md` en cas d'incident.

## ClamAV

**Obligatoire en production.** `require_clamd_available` teste clamd au démarrage et
le binaire panique s'il ne répond pas : un portail qui accepte des dépôts sans
analyse antivirus serait pire qu'un portail arrêté. Hors production, l'absence de
clamd est tolérée et journalisée.

Le portail parle à clamd par le **socket local** `/run/clamav/clamd.ctl`, valeur par
défaut de Debian, ce qui évite d'ouvrir un port supplémentaire. `ESPACE_CLAMD_ADDR`
permet de basculer sur du TCP (`127.0.0.1:3310`) si besoin ; une valeur commençant
par `/` est traitée comme un socket.

```bash
sudo systemctl status clamav-daemon
sudo journalctl -u espace-portail -n 30
```

Après installation, laisser `freshclam` terminer le téléchargement des signatures :
clamd ne répond pas tant que sa base n'est pas chargée.
