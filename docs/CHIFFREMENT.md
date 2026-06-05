# Chiffrement des données (au repos)

La base SQLite est **chiffrée** avec SQLCipher (AES-256). Objectif : si le fichier
`patrimoine-crm.db` est volé, il est **illisible** sans le mot de passe maître.

## Principe : chiffrement par enveloppe

On ne dérive pas la clé de la base directement du mot de passe (sinon changer de mot
de passe imposerait de tout re-chiffrer). On utilise une **enveloppe** :

```
Mot de passe maître ──Argon2id(sel_pw)──▶ KEK_pw ─┐
                                                  ├─▶ (dé)scelle la DEK ──▶ ouvre la base SQLCipher
Clé de récupération ──Argon2id(sel_rec)─▶ KEK_rec ┘
```

- **DEK** (Data Encryption Key) : clé aléatoire (32 o) qui chiffre réellement la base.
- **KEK** (Key Encryption Key) : dérivée d'un secret utilisateur via **Argon2id**.
- La DEK est **scellée** (chiffrée + authentifiée) par chaque KEK avec **XChaCha20-Poly1305**.
- La DEK n'est **jamais** stockée en clair.

Primitives : `src-tauri/src/auth/crypto.rs` (`derive_kek`, `wrap_dek`, `unwrap_dek`).

## `auth.json` (schéma v2)

Stocké dans `%APPDATA%\com.patrimoine-crm.app\`. Ne contient **aucun secret en clair** :

| Champ | Rôle |
|------|------|
| `version` | `2` (enveloppe) |
| `password_hash` | hash Argon2 du mot de passe (vérif. rapide) |
| `kdf_salt` / `recovery_salt` | sels de dérivation des KEK |
| `dek_wrapped_pw` / `dek_wrapped_rec` | DEK scellée par le mot de passe / la clé de récupération |

Migration v1 → v2 automatique (l'ancien format stockait la DEK en clair).

## Flux d'ouverture (ouverture différée)

La base n'est **pas** ouverte au démarrage. Elle ne l'est qu'après authentification :

1. `create_master_password` (1ʳᵉ fois) : génère DEK + clé de récupération, scelle, ouvre la base.
2. `unlock` : dérive KEK_pw, descelle la DEK, ouvre la base.
3. `recover_account` : dérive KEK_rec depuis la clé de récupération, descelle la DEK,
   redéfinit un mot de passe (et une nouvelle clé de récupération).

Commandes : `src-tauri/src/auth/commands.rs`. Ouverture chiffrée : `database/mod.rs::open_encrypted`.

## Migration d'une base existante (en clair → chiffrée)

Au 1ᵉʳ déverrouillage, si la base est détectée en clair :
1. **Sauvegarde préalable** automatique.
2. Conversion via `sqlcipher_export` puis **échange de fichier sûr** (compatible Windows :
   `original → .old`, `tmp → original`, rollback si échec).

## Clé de récupération

- Affichée **une seule fois** (création / changement de mot de passe / récupération),
  via `get_pending_recovery_key` (fichier annexe `pending_recovery_key.txt`, lu puis effacé).
- **Changer le mot de passe régénère la clé de récupération** : l'ancienne devient caduque.
  La DEK, elle, ne change pas → les données restent lisibles, les sauvegardes aussi.

## Sauvegardes

Les sauvegardes (auto quotidienne + pré-migration + manuelles, rotation des 10 dernières)
d'une base chiffrée sont **également chiffrées** : elles nécessitent la même DEK / le même
mot de passe pour être restaurées.

## Build (dev / CI uniquement)

SQLCipher embarque OpenSSL (`bundled-sqlcipher-vendored-openssl`). Compilation Windows :
**Perl** + **NASM** requis. Détails : `INSTALLATION_OPENSSL.md`. Côté **utilisateur final**,
rien à installer.
