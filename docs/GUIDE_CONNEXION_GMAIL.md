# Connecter Gmail au CRM W.Y.S — guide utilisateur

Ce guide s’adresse à **l’utilisatrice du CRM** (conseillère). La configuration **Google Cloud** (Client ID, API) est en général faite **une fois par le cabinet** — voir [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md) pour la partie technique.

---

## Ce que permet la connexion

Une fois Gmail connecté, le CRM peut :

- envoyer les emails depuis **Suivi → Envois** ;
- détecter les **réponses clients** (campagnes étiquettes) ;
- lire **Google Agenda** pour repérer un RDV pris par le client ;
- afficher l’**historique Gmail** sur la fiche contact (Relation client) ;
- **importer votre signature Gmail** (avec logo) dans Paramètres.

Les données restent **sur votre PC** ; le mot de passe Gmail n’est jamais saisi dans le CRM (connexion sécurisée Google).

---

## Avant de commencer

- CRM W.Y.S **installé et déverrouillé** (version ≥ 0.2.0 recommandée).
- Compte **Gmail** ou **Google Workspace** (ex. `prenom@cabinet.fr`).
- Les **identifiants OAuth** (Client ID + secret) déjà renseignés dans le CRM par votre responsable technique — section **Paramètres → Emails & envois → Connexion → Identifiants OAuth Google**.
- **Antivirus / pare-feu** : autoriser le CRM à écouter le port local `3847` le temps de la connexion (quelques secondes).

---

## Étapes dans le CRM

### 1. Ouvrir Paramètres → Emails & envois → Connexion

Menu latéral → **Paramètres** → onglet ou section **Email**.

### 2. Vérifier les identifiants Google (si demandé)

Si les champs **Client ID Google** / **Secret** sont vides, demandez-les à la personne qui a configuré le projet Google Cloud. Cliquez **Enregistrer les identifiants** avant de continuer.

### 3. Connecter Google

1. Cliquez **Connecter Google**.
2. Votre **navigateur** s’ouvre (Chrome, Edge…).
3. Choisissez le **bon compte Gmail** (celui utilisé pour les clients).
4. Cliquez **Autoriser** / **Continuer** pour tous les accès demandés (envoi, lecture des emails, agenda en lecture).
5. Le navigateur affiche une page de **succès** — vous pouvez la fermer.
6. Revenez au CRM : la carte doit indiquer **Boîte connectée** avec votre adresse email.

> **Important** : laissez le CRM **ouvert** pendant toute l’opération. Ne rechargez pas la page de succès dans le navigateur.

### 4. Tester l’envoi

1. Toujours dans **Paramètres → Emails & envois → Connexion**, cliquez **Tester la connexion**.
2. Vous devez recevoir un **email de test** sur votre propre boîte.
3. Si oui → la connexion est OK.

### 5. Importer la signature (recommandé)

1. Ouvrez **Paramètres → Emails & envois → Signature**.
2. Cliquez **Importer Gmail**.
3. Vérifiez l’aperçu (logo inclus si configuré dans Gmail).
4. Cliquez **Enregistrer** en bas de la page Paramètres (profil / CGP).

---

## Utilisation au quotidien

| Action | Où |
|--------|-----|
| Envoyer une campagne | **Suivi** → onglet **Envois** |
| Voir les mails d’un client | Fiche **Contact** → **Relation client** → **Sync Gmail** (première fois) |
| Sync auto à l’ouverture | **Paramètres → Emails & envois → Connexion** → activer **Sync auto à l’ouverture de Relation client** |
| Déconnecter Gmail | **Paramètres → Emails & envois → Connexion** → **Déconnecter** |

Le CRM doit rester **ouvert** pendant un envoi de campagne.

---

## Dépannage (messages fréquents)

| Symptôme | Que faire |
|----------|-----------|
| « Identifiants Google manquants » | Demander Client ID + secret à l’admin ; les coller dans Paramètres → Emails & envois → Connexion → **Enregistrer**. |
| Navigateur : « redirect_uri_mismatch » | L’admin doit ajouter exactement `http://127.0.0.1:3847/callback` dans Google Cloud — voir [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md). |
| « Compte non autorisé » (mode Test Google) | L’admin ajoute votre adresse Gmail dans **Utilisateurs test** de l’écran de consentement Google. |
| Page de succès mais CRM toujours déconnecté | Attendre 5 s, recliquer **Connecter Google** (ne pas recharger la page navigateur). |
| Port 3847 occupé | Fermer toute autre fenêtre CRM ; relancer l’application. |
| Pas d’email de test reçu | Vérifier les spams ; vérifier que le bon compte Google est connecté. |
| Signature sans logo | **Importer Gmail** à nouveau, puis **Enregistrer** sans modifier le texte brut. |

---

## Sécurité

- Ne partagez pas votre **mot de passe maître** CRM.
- En cas de vol de PC : déconnectez Gmail dans Paramètres, et révoquez l’accès « CRM » depuis [compte Google → Sécurité → Accès tiers](https://myaccount.google.com/permissions).

---

## Aide technique (administrateur)

Configuration Google Cloud détaillée : [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md)  
Fonctionnement email / campagnes : [EMAIL.md](./EMAIL.md)
