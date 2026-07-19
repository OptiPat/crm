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
| Secrets applicatifs | **Chiffrés au repos** | Tokens OAuth, clé API Mistral et token Telegram — XChaCha20-Poly1305 avec une clé protégée par DPAPI/Trousseau. |

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

## Secrets applicatifs (DPAPI / Trousseau)

Les secrets sensibles (jetons OAuth, clé API Mistral, token Telegram) sont **chiffrés
et authentifiés au repos** :

- Primitive : XChaCha20-Poly1305 avec nonce aléatoire et format versionné `v2:`.
- Clé maître aléatoire de 32 octets, **indépendante de la base SQLite**.
- Sous Windows, la clé est enveloppée silencieusement par DPAPI pour l'utilisateur courant
  et le blob est stocké dans `secrets.key.os`.
- Sous macOS, la clé est conservée dans le Trousseau ; `secrets.key.os` n'est qu'un marqueur.
- Au premier accès après mise à jour, l'ancien `secrets.key` brut est protégé puis supprimé
  seulement après vérification. Les anciens blobs XOR restent lisibles et sont réécrits
  automatiquement au nouveau format.
- Après vérification du coffre OS, le champ historique `db_encryption_key` et les copies
  `secrets.key` correspondantes sont retirés de l'installation et des anciens sidecars de
  sauvegarde. Une clé différente n'est jamais supprimée automatiquement.
- Si deux clés différentes coexistent, le CRM les départage en testant les secrets AEAD
  existants. Il conserve les deux fichiers et signale le conflit tant qu'il subsiste.
- Si le coffre OS est temporairement indisponible, le CRM conserve l'accès avec la clé legacy,
  réessaie au prochain chargement et affiche un avertissement dans **Paramètres > Données**.

La base, les documents et les fiches restent récupérables indépendamment de cette clé. Une
clé de secrets perdue impose seulement de reconnecter OAuth et de ressaisir les clés API.

## Sauvegardes

Sauvegardes automatiques (quotidienne + pré-migration + manuelles, rotation des 10 dernières)
dans `%APPDATA%\com.patrimoine-crm.app\backups\` : base SQLite, dossier `documents/`, et fichiers
de config jumelés (OAuth, secrets, newsletter, verrou, branding). La base et les documents sont
**restaurables sans clé**. Les secrets restaurés ne sont réutilisables qu'avec le même compte
Windows sur le même poste, ou le même Trousseau macOS ; sur un autre poste, il faut les
reconfigurer. Sur macOS, une perte ou réinitialisation du Trousseau impose également cette
reconfiguration, même si les fichiers de sauvegarde ont été conservés.
Les exports ZIP n'incluent pas de clé legacy brute lorsqu'une clé protégée OS est présente.

Le worker Rust vérifie toutes les trois minutes si la sauvegarde quotidienne manque, y compris
quand l'interface est verrouillée, en tenant le mutex SQLite pendant la copie. En revanche, lister,
créer, exporter ou restaurer manuellement une sauvegarde exige une session CRM déverrouillée.

## Build

Aucun prérequis particulier : SQLite standard compilé depuis les sources (`bundled`).
Plus de SQLCipher, d'OpenSSL ni d'outils NASM/Perl.

Les versions distribuées ciblent Windows et macOS. Le coffre applicatif n'est pas disponible
dans les builds Linux non distribués.

## Durcissement Tauri

- La WebView n'autorise que les scripts embarqués ; `unsafe-eval`, les requêtes réseau web
  arbitraires et les navigations hors de l'origine interne sont bloqués.
- Les capacités Tauri sont accordées commande par commande. Les ensembles globaux
  `core:default`, `fs:default`, `process:default`, etc. ne sont pas exposés au frontend.
- Le frontend n'a aucun accès direct au système de fichiers ni au protocole `asset`.
  Les documents et images passent par une passerelle Rust qui exige une session CRM active,
  vérifie le chemin accordé par le dialogue/glisser-déposer, le type et la taille du fichier.
- Seuls les logos de branding aux noms et emplacement fixes peuvent être lus avant
  déverrouillage afin d'afficher l'écran d'accès personnalisé.
