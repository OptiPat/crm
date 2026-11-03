# Configuration OAuth Gmail / Microsoft

Pour connecter **Google** ou **Microsoft** sans mot de passe d’application, enregistrez une application OAuth puis collez les identifiants client dans **Paramètres → Emails & envois → Connexion**.

Redirect URI à déclarer **exactement** :

```
http://127.0.0.1:3847/callback
```

Le CRM doit rester **ouvert** pendant la connexion (le navigateur revient sur ce port local).

---

## Google (Gmail)

1. [Google Cloud Console](https://console.cloud.google.com/) → projet → **APIs & Services** → **Credentials**.
2. **Create Credentials** → **OAuth client ID** → type **Desktop app**.
3. Copiez le **Client ID** et le **code secret du client** dans le CRM (Paramètres → Connexion email → Google).
4. **APIs & Services** → **Library** → activer **Gmail API** et **People API** (sync Google Contacts / iPhone).
5. **OAuth consent screen** : mode Testing ou Production, ajoutez votre compte comme test user si Testing.

Scopes utilisés : envoi Gmail, lecture Gmail (réponses), signature d’envoi, **Google Calendar en lecture** (RDV), **Google Contacts** (sync iPhone), adresse du profil.

---

## Microsoft (Outlook / M365)

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → **New registration**.
2. Type : **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI : plateforme **Mobile and desktop applications** → `http://127.0.0.1:3847/callback`.
4. Copiez l’**Application (client) ID** dans le CRM.
5. **API permissions** → **Microsoft Graph** → déléguées : `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email` → **Grant admin consent** si compte pro.

Pour **OneDrive dossiers clients** (avec Gmail pour les mails), ajoutez aussi : `Files.ReadWrite` (déléguée).

---

## Autre messagerie (OVH, Ionos, Orange…) — SMTP / IMAP

Pour les boîtes **hors Google et Microsoft 365** : OVH Email Pro / MX Plan, Ionos, Gandi,
Infomaniak, Orange, Free, SFR, La Poste… Exemple typique : webmail Outlook sur
`pro2.mail.ovh.net` — c'est de l'Exchange hébergé par OVH, **pas** Microsoft 365, le bouton
Microsoft ne fonctionne pas.

Pour l'utilisateur :

1. **Paramètres → Emails & envois → Connexion** → tuile **Autre messagerie**.
2. Adresse email + mot de passe de la messagerie (celui du webmail).
3. L'hébergeur est détecté (domaine public ou serveurs MX du domaine) ; pour OVH, le CRM
   essaie `pro1` → `pro2` → `pro3.mail.ovh.net` puis `ssl0.ovh.net` et garde celui qui accepte.
4. **Connecter** : vérifie la réception (IMAP) et l'envoi (SMTP), puis **Tester**.

Serveurs à saisir à la main (« Serveurs (avancé) ») si l'hébergeur n'est pas reconnu :

| Hébergeur | IMAP | SMTP |
|-----------|------|------|
| OVH Email Pro | `proN.mail.ovh.net` : 993 | `proN.mail.ovh.net` : 587 STARTTLS |
| OVH MX Plan | `ssl0.ovh.net` : 993 | `ssl0.ovh.net` : 465 SSL |
| Ionos | `imap.ionos.fr` : 993 | `smtp.ionos.fr` : 465 SSL |

Comportement :

- Envoi SMTP ; copie déposée dans **Éléments envoyés** (IMAP), visible dans le webmail.
- Détection des réponses campagnes : boîte de réception, réponses portant le Message-ID de
  l'envoi (In-Reply-To / References). Désinscriptions newsletter : idem Gmail / Outlook.
- Pas de détection RDV (connecter Google Agenda en complément), pas d'historique contact,
  pas de scans Stellium / box placement (Google / Microsoft uniquement).
- Mot de passe chiffré comme les tokens OAuth ; s'il change chez l'hébergeur → **Changer le
  mot de passe** dans Connexion.
- IMAP en SSL/TLS (port 993) uniquement ; SMTP en STARTTLS (587) ou SSL/TLS (465).
- Chaque envoi ouvre une connexion SMTP et une connexion IMAP (copie dans Envoyés). Les
  hébergeurs limitent le volume (OVH : ~200 emails / heure / compte) : attention aux grosses
  newsletters, aucun étalement automatique n'est fait par le CRM.

---

## OneDrive dossiers clients (Microsoft Graph)

Même application Azure que ci-dessus (ou une app dédiée) :

1. Redirect URI identique : `http://127.0.0.1:3847/callback`
2. Permissions Graph déléguées : `Files.ReadWrite`, `User.Read`, `offline_access`
3. Collez le **Client ID** dans **Paramètres → Intégrations → Dossiers clients OneDrive**
4. **Connecter OneDrive** → choisir la racine → **Rattacher les dossiers**

Gmail reste utilisé pour les mails ; cette connexion Microsoft ne sert qu'aux fichiers.

## Utilisation dans le CRM

1. Enregistrer les Client ID.
2. **Connecter Google** ou **Connecter Microsoft** → navigateur → autoriser.
3. **Tester la connexion** envoie un email à votre propre adresse.
4. Les envois **Suivi → Envois** utilisent le compte connecté (OAuth obligatoire).

Guide pas à pas pour l’utilisatrice : [GUIDE_CONNEXION_GMAIL.md](./GUIDE_CONNEXION_GMAIL.md).

Déconnexion : bouton **Déconnecter** (ne supprime pas les Client ID).

---

## Sécurité des données locales

| Donnée | Fichier | Protection |
|--------|---------|------------|
| Client ID Google / Microsoft, serveurs SMTP / IMAP | `email_oauth.json` | En clair (identifiants publics d’application) |
| Tokens d’accès / refresh, mot de passe « autre messagerie » | `email_oauth.json` | **Chiffrés et authentifiés** (XChaCha20-Poly1305, clé maître protégée par DPAPI sous Windows ou le Trousseau sous macOS) |

Les tokens OAuth ne sont **pas** stockés en clair. Les anciens formats en clair ou XOR sont
**re-sauvegardés automatiquement** au chargement. Sur un autre poste, la base reste récupérable,
mais la connexion OAuth doit être recréée car la clé des secrets est liée au coffre du système.

Recommandations : poste verrouillé, sauvegardes du dossier App Data protégées, révoquer l’accès OAuth depuis Google / Azure si le poste est compromis.

---

## Dépannage

| Problème | Piste |
|----------|--------|
| Port 3847 occupé | Fermer autre instance CRM ou logiciel sur ce port |
| `redirect_uri_mismatch` | URI identique dans la console cloud et ci-dessus |
| Gmail API disabled | Activer Gmail API dans Google Cloud |
| People API disabled (403 sync contacts) | Activer **People API** dans Google Cloud (même projet) |
| Compte Testing Google | Ajouter l’email dans utilisateurs test de l’écran de consentement |
| `Missing required parameter: scope` (400) | Bug Windows corrigé (URL OAuth tronquée) — mettre à jour le CRM puis réessayer **Connecter Google** |
| `redirect_uri_mismatch` à l'échange du code | Google Cloud → **Clients** → votre client → URI de redirection : `http://127.0.0.1:3847/callback` (exact) |
| `invalid_grant` à l'échange | Ne pas recharger la page de succès ; une seule tentative — recliquer **Connecter Google** après 5 s |
| `client_secret is missing` | Collez le **code secret** Google (Clients → CRM Bureau) dans Paramètres → Emails & envois → Connexion, puis **Enregistrer** |

| « Adresse ou mot de passe refusé » (autre messagerie) | Mot de passe du webmail ; Yahoo / iCloud exigent un mot de passe d'application |
| « Serveur … injoignable » | Pare-feu / antivirus bloquant les ports 993, 587 ou 465 |

Connexions supportées : OAuth Google / Microsoft, et SMTP / IMAP pour les autres messageries.
