# Espace client — plan de réponse à incident

Document opérationnel à compléter **à froid** (coordonnées cabinet, hébergeur, contacts).
Ne pas versionner de données nominatives réelles.

Complète la procédure RGPD §7 de `docs/ESPACE_CLIENT_RGPD.md`.

**État des lieux** : le canvas Cursor **Espace client — état des lieux**
(`canvases/espace-client-etat-des-lieux.canvas.tsx`, hors dépôt) synthétise
l'avancement technique, la posture sécurité et les écarts restants. Ce runbook
décrit quoi faire **le jour J** ; le canvas décrit **où on en est** avant
l'incident.

---

## 1. Quand déclencher ce plan

| Signal | Exemple |
|--------|---------|
| Compromission serveur | Accès SSH non autorisé, binaire modifié, processus inconnu |
| Fuite de secrets | `.env` exposé, clé Brevo compromise, `ESPACE_SYNC_SECRET` divulgué |
| Comportement anormal | Connexions massives, dépôts suspects, emails clients non sollicités |
| Alerte client | Client signale une connexion qu'il n'a pas faite (email « nouvel appareil ») |
| Fournisseur | Alerte hébergeur, Brevo, CNIL |

En cas de doute : traiter comme incident jusqu'à preuve du contraire.

---

## 2. Containment (0–2 h)

### 2.1 Couper l'exposition

```bash
# Sur le VPS — stopper le portail (Caddy continue de répondre, pas de fuite active)
sudo systemctl stop espace-portail

# Vérifier qu'aucun processus ne tourne
sudo systemctl status espace-portail
```

**Ne pas** supprimer les logs ni la base avant analyse.

### 2.2 Révoquer les accès clients concernés

Depuis le CRM (poste conseiller) :

1. Fiche contact → **Espace client** → **Révoquer l'accès**
2. Le CRM appelle le portail **avant** de valider côté local (sessions + appareils de confiance supprimés)

Révocation globale si compromission serveur : révoquer tous les contacts actifs, ou laisser le portail arrêté.

### 2.3 Isoler le poste conseiller si suspect

- Déconnecter le réseau si le poste est compromis
- Ne pas synchroniser vers le portail depuis une machine non vérifiée

---

## 3. Évaluation (2–24 h)

| Question | Où regarder |
|----------|-------------|
| Quelles données ? | Snapshots patrimoine, journal `espace_connexion_log`, dépôts non rapatriés |
| Combien de personnes ? | Contacts avec `statut = actif` dans `espace_acces` |
| Depuis quand ? | Logs Caddy, `journalctl -u espace-portail`, dates du journal CRM |
| Vector d'attaque ? | SSH, dépendance npm, secret leak, phishing conseiller |

```bash
sudo journalctl -u espace-portail --since "24 hours ago"
sudo journalctl -u caddy --since "24 hours ago"
```

Journal connexions côté CRM : panneau **Espace client** → **Journal des connexions** (événements `new_device`, `login_failed`, etc.).

---

## 4. Notification (72 h)

### 4.1 CNIL (art. 33 RGPD)

- **Délai** : 72 h après prise de connaissance si risque pour les droits et libertés
- **Canal** : [notification CNIL](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
- **Contenu** : nature, catégories de données, nombre approximatif de personnes, conséquences, mesures prises

### 4.2 Personnes concernées (art. 34)

Si **risque élevé** pour les clients : les informer sans délai indu (email, courrier, rendez-vous).

Modèle de message (à adapter) :

> Nous avons détecté un incident affectant l'espace client patrimonial. [Nature]. [Données potentiellement concernées]. [Mesures prises]. [Contact conseiller]. [Recommandations : changer mot de passe messagerie, surveiller comptes].

### 4.3 Sous-traitants

| Prestataire | Action |
|-------------|--------|
| **Brevo** | Révoquer / régénérer la clé API portail si compromise |
| **Hébergeur VPS** | Ticket support, snapshot disque pour analyse si besoin |

---

## 5. Rotation des secrets

Ordre recommandé (depuis une machine **propre**, pas le serveur compromis) :

| Secret | Où | Action |
|--------|-----|--------|
| `ESPACE_AUTH_SECRET` | VPS `.env` seulement | Générer nouveau (`deploy/generate-sync-secret.ps1`), redémarrer portail → **toutes les sessions invalidées** |
| `ESPACE_SYNC_SECRET` | VPS `.env` + CRM Paramètres | Nouveau secret, resynchroniser tous les contacts actifs |
| `ESPACE_BREVO_API_KEY` | VPS `.env` + compte Brevo | Révoquer l'ancienne clé, créer une nouvelle |
| Clé SSH VPS | `~/.ssh/` poste éditeur | `ssh-keygen`, mettre à jour `authorized_keys`, supprimer anciennes |
| Certificat TLS | Caddy (auto Let's Encrypt) | Généralement inchangé sauf compromission clé privée Caddy |

```bash
# Après mise à jour .env sur le VPS
sudo systemctl restart espace-portail
sudo systemctl status espace-portail
curl -sS https://espace.VOTRE-DOMAINE.FR/health
```

CRM : **Aperçu client → Connexion portail** → coller le nouveau `ESPACE_SYNC_SECRET` → **Synchroniser** chaque contact actif.

---

## 6. Restauration

| Scénario | Procédure |
|----------|-----------|
| Serveur compromis | Nouveau VPS ou réinstallation, restaurer depuis backup **antérieur** à l'incident (voir `espace-portail/deploy/README.md` § Sauvegarde) |
| Base corrompue | `deploy/restore-portail-test.sh` sur une copie, puis bascule |
| Pas de backup récent | Reconstruire depuis CRM (snapshots + accès) ; **perte** : journal connexions, sessions, dépôts non rapatriés |

Après restauration : **rotation complète des secrets** (§5) même si le backup semble sain.

---

## 7. Reprise de service

Checklist avant `systemctl start espace-portail` :

- [ ] Cause identifiée ou serveur neuf
- [ ] Secrets tournés
- [ ] `.env` permissions `600`, propriétaire service
- [ ] `ESPACE_PRODUCTION=1`, `ESPACE_TRUST_PROXY=1`
- [ ] ClamAV actif (`systemctl status clamav-daemon`)
- [ ] Test connexion client fictif + sync CRM
- [ ] `/confidentialite` accessible
- [ ] Registre des traitements / CNIL mis à jour si notification effectuée

---

## 8. Trace post-incident

Conserver (hors dépôt public) :

- Chronologie (heure, action, auteur)
- Liste des contacts notifiés
- Copie notification CNIL
- Hash / empreinte des artefacts analysés
- Actions correctives et date de revue

---

## 9. Contacts

Ce dépôt est **public** : la fiche nominative ne s'y trouve pas. Elle vit hors
dépôt, dans `%APPDATA%\com.patrimoine-crm.app\PLAN-INCIDENT-CONTACTS.md`, avec
une copie en note sécurisée dans le gestionnaire de mots de passe.

La copie dans le gestionnaire n'est pas un doublon de confort : le scénario le
plus probable est un poste éteint, saisi ou compromis, et un conseiller qui
cherche le numéro de son hébergeur depuis son téléphone.

Rôles à y renseigner :

| Rôle | Ce qu'il faut sous la main |
|------|----------------------------|
| Responsable de traitement (cabinet) | Nom, téléphone mobile, email professionnel |
| Hébergeur VPS | Identifiant client, nom du serveur, accès à la console de secours |
| Emailing transactionnel | Compte, procédure de révocation de la clé API |
| Association professionnelle | Contact juridique — la déclaration CNIL se prépare mieux à deux |
| Assurance responsabilité civile professionnelle | N° de contrat, délai de déclaration d'un sinistre cyber |
| DPO / référent RGPD | Si désigné |

---

## Références

- Canvas Cursor **Espace client — état des lieux** — synthèse visuelle (avancement, sécurité, écarts) ; lien croisé depuis la section « Plan de réponse à incident »
- `docs/ESPACE_CLIENT_RGPD.md` — cadre légal
- `docs/ESPACE_CLIENT_PLAN.md` — plan d'implémentation et phases fonctionnelles
- `espace-portail/deploy/README.md` — déploiement, sauvegarde
- `espace-portail/deploy/backup-portail.sh` — sauvegarde quotidienne
- `espace-portail/deploy/restore-portail-test.sh` — test de restauration
