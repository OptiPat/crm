# Configuration OAuth Gmail / Microsoft

Pour connecter **Google** ou **Microsoft** sans mot de passe d’application, enregistrez une application OAuth puis collez les identifiants client dans **Paramètres → Email**.

Redirect URI à déclarer **exactement** :

```
http://127.0.0.1:3847/callback
```

Le CRM doit rester **ouvert** pendant la connexion (le navigateur revient sur ce port local).

---

## Google (Gmail)

1. [Google Cloud Console](https://console.cloud.google.com/) → projet → **APIs & Services** → **Credentials**.
2. **Create Credentials** → **OAuth client ID** → type **Desktop app**.
3. Copiez le **Client ID** dans le CRM (Paramètres → Identifiants OAuth → Google).
4. **APIs & Services** → **Library** → activer **Gmail API**.
5. **OAuth consent screen** : mode Testing ou Production, ajoutez votre compte comme test user si Testing.

Scopes utilisés : envoi Gmail + lecture de l’adresse email du profil.

---

## Microsoft (Outlook / M365)

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → **New registration**.
2. Type : **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI : plateforme **Mobile and desktop applications** → `http://127.0.0.1:3847/callback`.
4. Copiez l’**Application (client) ID** dans le CRM.
5. **API permissions** → **Microsoft Graph** → déléguées : `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email` → **Grant admin consent** si compte pro.

---

## Utilisation dans le CRM

1. Enregistrer les Client ID.
2. **Connecter Google** ou **Connecter Microsoft** → navigateur → autoriser.
3. **Tester la connexion** envoie un email à votre propre adresse.
4. Les envois **Suivi → Envois** utilisent le compte connecté (sinon repli SMTP).

Déconnexion : bouton **Déconnecter** (ne supprime pas les Client ID).

---

## Sécurité des données locales

| Donnée | Fichier | Protection |
|--------|---------|------------|
| Client ID Google / Microsoft | `email_oauth.json` | En clair (identifiants publics d’application) |
| Tokens d’accès / refresh | `email_oauth.json` | **Chiffrés** (XOR + nonce, clé = `db_encryption_key` de `auth.json`, même secret que la base CRM) |
| Mot de passe SMTP (legacy) | `smtp_config.json` | Plus configurable dans l’app ; remplacé par OAuth |

Les tokens OAuth ne sont **pas** stockés en clair une fois le CRM configuré (mot de passe maître créé). Un ancien fichier non chiffré est **re-sauvegardé automatiquement** au chargement si la clé CRM est disponible.

Recommandations : poste verrouillé, sauvegardes du dossier App Data protégées, révoquer l’accès OAuth depuis Google / Azure si le poste est compromis.

---

## Dépannage

| Problème | Piste |
|----------|--------|
| Port 3847 occupé | Fermer autre instance CRM ou logiciel sur ce port |
| `redirect_uri_mismatch` | URI identique dans la console cloud et ci-dessus |
| Gmail API disabled | Activer Gmail API dans Google Cloud |
| Compte Testing Google | Ajouter l’email dans utilisateurs test de l’écran de consentement |

L’ancienne méthode SMTP n’est plus proposée dans Paramètres : connectez OAuth pour les nouveaux postes.
