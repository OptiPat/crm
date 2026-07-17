# Sécurité des données (au repos)

> **Important** : le chiffrement applicatif de la base a été **retiré**. La base
> `patrimoine-crm.db` est désormais en **SQLite simple (non chiffré)**. Ce choix est
> assumé : une base en clair s'ouvre **toujours**, donc **aucune clé ne peut être perdue
> ou écrasée** et entraîner une perte définitive des données (ce qui était le risque du
> chiffrement par enveloppe précédent).

## Modèle actuel

| Élément | État | Détail |
|--------|------|--------|
| Base `patrimoine-crm.db` | **En clair** | `rusqlite` feature `bundled` (SQLite standard). Ouverte par `Database::open`, sans clé. |
| Accès au CRM | **Verrou local** | Mot de passe Argon2id, avec Windows Hello ou Touch ID en second facteur optionnel. Ne chiffre pas la base. |
| Secrets applicatifs | **Chiffrés au repos** | Tokens OAuth (`email_oauth.json`), clé API Mistral (`newsletter_config.json`) — XOR + nonce avec `secrets.key`. |

### Conséquences

- **Oublier le mot de passe ≠ perte de données** : il suffit de supprimer/réinitialiser
  `auth.json` pour redéfinir un mot de passe. La base reste lisible.
- **Plus de clé de récupération** : inutile, puisque la base n'est plus chiffrée.
- **Protection au repos** : si tu veux protéger le fichier en cas de vol du poste, active
  le **chiffrement disque de l'OS** (BitLocker sur Windows). C'est le niveau recommandé.

## Verrou d'accès (`auth.json`)

Stocké dans `%APPDATA%\com.patrimoine-crm.app\`. Contient uniquement :

| Champ | Rôle |
|------|------|
| `password_hash` | hash Argon2id du mot de passe (vérification rapide) |
| `created_at` | horodatage de création |
| `system_auth_enabled` | active la confirmation Windows Hello ou Touch ID après le mot de passe |

`auth_attempts.json`, placé dans le même dossier, conserve uniquement le nombre d'échecs et
l'échéance du blocage. Il est séparé de `auth.json` pour qu'une écriture interrompue du compteur
ne puisse jamais endommager le hash du mot de passe.

Flux (`src-tauri/src/auth/`) :

1. `create_master_password` (1ʳᵉ fois) : enregistre le hash, puis ouvre la base.
2. `unlock` : vérifie le hash, puis Windows Hello ou Touch ID si activé, avant d'ouvrir la session.
3. `change_master_password` : vérifie l'actuel, re-hache le nouveau.
4. Après 15 minutes d'inactivité par défaut (réglable à 5, 15, 30 minutes ou désactivé),
   l'interface se verrouille sans arrêter les automatisations en tray. Le worker Rust contrôle
   également le délai et les reprises de veille, indépendamment des timers du webview.

Après 5 mots de passe incorrects, les délais progressent de 1 à 5, 15 puis 60 minutes.
Le compteur et l'échéance survivent aux redémarrages, sans jamais dépasser 60 minutes ; une
réussite supprime immédiatement cet état. Supprimer manuellement `auth_attempts.json` réinitialise
la limitation, mais ne modifie ni le mot de passe ni les données. Pendant l'exécution, une horloge
monotone empêche un changement de l'heure système de raccourcir le délai. Une restauration de
configuration purge l'état des tentatives afin de ne pas réappliquer un ancien blocage.
Si l'authentification système
devient indisponible sur un nouveau poste, un accès de récupération par mot de passe la désactive
explicitement : aucune panne biométrique ne peut rendre les données inaccessibles définitivement.

La base n'est **pas** ouverte au démarrage : elle ne l'est qu'après le premier déverrouillage.
Lors d'un verrouillage automatique, elle reste ouverte dans le processus afin que les workers tray
continuent. Un état de session séparé interdit alors les commandes IPC sensibles (sauvegarde,
restauration, export, lecture de documents et configuration de secrets) jusqu'au prochain
déverrouillage. Les commandes métier nécessaires aux automatisations tray restent utilisables :
ce mécanisme est un verrou d'interface renforcé, pas une isolation complète contre un webview ou
un poste déjà compromis.

## Secrets applicatifs (`secrets.key`)

Les secrets sensibles (jetons OAuth Google, clé API Mistral) restent **chiffrés au repos**
pour ne pas traîner en clair sur le disque :

- Clé de stockage = `secrets.key` (32 octets aléatoires), **propre à l'installation**,
  générée automatiquement à la première utilisation. **Indépendante de la base** : elle ne
  peut plus être perdue avec elle.
- Primitive : `src-tauri/src/email/oauth_secrets.rs` (`encrypt_secret` / `decrypt_secret`,
  XOR + nonce). Obfuscation au repos, pas une garantie cryptographique forte — la vraie
  protection au repos reste le chiffrement disque OS.

## Sauvegardes

Sauvegardes automatiques (quotidienne + pré-migration + manuelles, rotation des 10 dernières)
dans `%APPDATA%\com.patrimoine-crm.app\backups\` : base SQLite, dossier `documents/`, et fichiers
de config jumelés (OAuth, secrets, newsletter, verrou, branding). Étant en clair, elles sont
**restaurables sans clé**.

Le worker Rust vérifie toutes les trois minutes si la sauvegarde quotidienne manque, y compris
quand l'interface est verrouillée, en tenant le mutex SQLite pendant la copie. En revanche, lister,
créer, exporter ou restaurer manuellement une sauvegarde exige une session CRM déverrouillée.

## Build

Aucun prérequis particulier : SQLite standard compilé depuis les sources (`bundled`).
Plus de SQLCipher, d'OpenSSL ni d'outils NASM/Perl.
