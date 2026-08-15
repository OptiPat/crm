# Sécurité des données (au repos)

> **Important** : la base individuelle `patrimoine-crm.db` reste en **SQLite
> simple (non chiffré)**. Ce choix est assumé : une base en clair s'ouvre
> **toujours**, donc **aucune clé ne peut être perdue ou écrasée** et entraîner
> une perte définitive des données (ce qui était le risque de SQLCipher et du
> chiffrement par enveloppe précédent). SQLCipher n'est **pas** réactivé.

## Modèle actuel

| Élément | État | Détail |
|--------|------|--------|
| Base `patrimoine-crm.db` | **En clair** | `rusqlite` feature `bundled` (SQLite standard). Ouverte par `Database::open`, sans clé. **Jamais** chiffrée par SQLCipher. |
| Cache `workspace-team-cache.db` | **Illisible sans Entra** | Pas de SQLite clair pendant la session (copie mémoire). Snapshot scellé XChaCha20-Poly1305 sur disque, clé délivrée par SharePoint (`CRM_Secrets`) **après** vérification Microsoft Entra. Une révocation refuse l'ouverture, verrouille la session, oublie la clé mémoire, supprime tout fichier clair local et le cache `documents/_team_cache`. Copier le `.db.sealed` sans accès SharePoint ne permet pas de le lire. SQLCipher n'est **pas** utilisé. |
| Documents téléchargés en mode équipe | **Cache temporaire purgé** | Les fichiers sont contrôlés par SHA-256 puis conservés sous `documents/_team_cache` uniquement pendant la session. Les nouveaux fichiers non encore envoyés sont intégrés à la base avant son scellement, puis le cache clair est supprimé. |
| Accès au CRM | **Verrou local + Entra en mode équipe** | Mot de passe Argon2id, avec Windows Hello ou Touch ID en second facteur optionnel. En mode équipe, le mot de passe local ne suffit plus à lire le cache. |
| Secrets applicatifs | **Chiffrés au repos** | Tokens OAuth, clé API Mistral et token Telegram — XChaCha20-Poly1305 avec une clé protégée par DPAPI/Trousseau. |

### Conséquences

- **Oublier le mot de passe ≠ perte de données** : il suffit de supprimer/réinitialiser
  `auth.json` pour redéfinir un mot de passe. La base reste lisible.
- **Mode individuel sans clé de récupération** : la base historique reste toujours lisible.
- **Mode équipe reconstructible** : la clé du cache n'est **pas** dans le coffre OS.
  Elle est lue sur SharePoint (`CRM_Secrets`) après Entra, uniquement en mémoire.
  Au provisionnement, cette liste est masquée et limitée aux deux groupes Entra
  (conseillers / assistantes) : elle n'apparaît plus dans le contenu du site.
  Une assistante retirée des groupes ou du site ne peut plus obtenir cette clé :
  le fichier scellé local reste illisible, y compris hors du CRM.
  Si le cache scellé est illisible, on le reconstruit depuis SharePoint.
  `patrimoine-crm.db` n'est jamais chiffré ni modifié par ce flux.
- **Aucune perte lors d'une fermeture hors ligne** : le contenu d'un document encore en attente
  d'envoi est placé dans l'outbox SQLite avant le scellement. Il repart vers SharePoint après
  le prochain déverrouillage.
- **Protection au repos** : si tu veux protéger le fichier en cas de vol du poste, active
  le **chiffrement disque de l'OS** (BitLocker sur Windows). C'est le niveau recommandé.

### Pourquoi pas SQLCipher (même en mode équipe)

SQLCipher chiffre le fichier SQLite **au niveau du moteur**. Dans ce projet, `rusqlite`
active le chiffrement à la **compilation** (`bundled-sqlcipher`) : **toutes** les bases
ouvertes par l'app passeraient par SQLCipher, y compris `patrimoine-crm.db`. C'est
précisément ce qui a déjà rendu une base individuelle illisible (clé perdue / en-tête
chiffré). Le build Windows imposait aussi OpenSSL + NASM, volontairement retiré.

L'effet voulu (« une assistante ne peut plus lire le SQLite de son PC ») est obtenu
**sans** SQLCipher :

1. pendant la session, le cache équipe vit en SQLite **mémoire** (`:memory:`), pas en `.db` clair ;
2. sur disque, seul `workspace-team-cache.db.sealed` reste (XChaCha20-Poly1305) ;
3. la clé (DEK) est lue sur SharePoint `CRM_Secrets` **après** Entra, uniquement en RAM ;
4. sans accès Graph/SharePoint (compte retiré), le `.sealed` est du bruit, y compris hors du CRM.

Copier le fichier local ne suffit plus. SQLCipher n'apporterait rien de plus, et
réintroduirait le risque sur la base historique.

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
Tout verrouillage ferme la connexion et rend les commandes IPC métier inopérantes. En mode équipe,
Microsoft Entra est interrogé **avant** toute lecture. La clé SharePoint reste en mémoire
le temps de la session ; le cache vivant est un SQLite mémoire, le disque ne conserve que
le snapshot scellé (contrôle binaire + `PRAGMA integrity_check` avant d'effacer un éventuel
clair de migration). Une révocation Entra ferme la session, oublie la clé et affiche
« Accès équipe révoqué ». Copier `workspace-team-cache.db.sealed` sans accès SharePoint
ne permet pas de lire le CRM.

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
- L'action **Vérifier et nettoyer l'ancienne clé** contrôle aussi le token Telegram, crée une
  sauvegarde complète, puis supprime la clé legacy uniquement si tous les contrôles réussissent.
- Si le coffre OS est temporairement indisponible, le CRM conserve l'accès avec la clé legacy,
  réessaie au prochain chargement et affiche un avertissement dans **Paramètres > Données**.

La base individuelle, ses documents et les fiches historiques restent récupérables indépendamment
de cette clé. En mode équipe, la clé du cache vient de SharePoint : perdre le coffre OS n'empêche
pas de reconstruire le cache. Les mutations encore uniquement présentes dans l'outbox locale
doivent être synchronisées avant une coupure brutale, car le snapshot scellé est rafraîchi
périodiquement et au verrouillage.

## Sauvegardes

Sauvegardes automatiques (quotidienne + pré-migration + manuelles, rotation des 10 dernières)
dans `%APPDATA%\com.patrimoine-crm.app\backups\` : base SQLite, dossier `documents/`, et fichiers
de config jumelés (OAuth, secrets, newsletter, verrou, branding). La base et les documents sont
**restaurables sans clé**. Les secrets restaurés ne sont réutilisables qu'avec le même compte
Windows sur le même poste, ou le même Trousseau macOS ; sur un autre poste, il faut les
reconfigurer. Sur macOS, une perte ou réinitialisation du Trousseau impose également cette
reconfiguration, même si les fichiers de sauvegarde ont été conservés.
Les exports ZIP n'incluent pas de clé legacy brute lorsqu'une clé protégée OS est présente.

Le worker Rust vérifie toutes les trois minutes si la sauvegarde quotidienne manque lorsque la
base est ouverte. Quand l'interface est verrouillée, aucune copie SQLite claire n'est créée.
Lister, créer, exporter ou restaurer manuellement une sauvegarde exige une session CRM déverrouillée.

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
