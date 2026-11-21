# Audit des dépendances

_Date : 2026-11-21 · Sources : `npm outdated`, `npm audit`, `cargo update --dry-run --verbose`, plages de compatibilité déclarées par les paquets. Rust installé : 1.92._

## Verdict

**Contrairement à l'impression, le projet est globalement à jour.** Côté interface, il ne reste que des correctifs mineurs ; côté Rust, 94 mises à jour compatibles et une poignée de versions majeures en retard. **Aucune faille connue dans ce qui est livré aux utilisateurs** (`npm audit --omit=dev` : 0). Les 13 alertes « moderate » concernent uniquement les outils de développement (ESLint et ses dépendances).

Le vrai risque n'est pas l'âge des versions, ce sont **trois blocages de compatibilité** à respecter (voir plus bas).

## 1. Interface (npm)

| Paquet | Actuel | Disponible | Type | Recommandation |
|---|---|---|---|---|
| vite, vitest, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, tailwind-merge, recharts, eslint, typescript-eslint, lucide-react, @tauri-apps/plugin-notification | — | correctifs / mineures | Compatible | **Mettre à jour** (lot A) |
| @tauri-apps/api, @tauri-apps/cli | 2.12.4 (figé) | 2.12.5 / 2.12.6 | Correctif | **Mettre à jour en même temps que Tauri côté Rust** (voir blocage n° 1) |
| typescript | 5.9.3 | **7.0** | Majeure | **Ne pas mettre à jour** : typescript-eslint n'accepte que TypeScript < 6.1 (blocage n° 2) |
| better-sqlite3 | 12.11 | **13.2** | Majeure | **Pas prioritaire** : utilisé seulement par les scripts de développement Drizzle (`db:migrate`), pas par l'app (qui utilise SQLite côté Rust) |

## 2. Rust (Cargo)

### Mises à jour compatibles (lot B)
`cargo update` propose **94 mises à jour** dans les plages déjà autorisées (correctifs de `tokio`, `mio`, `bytes`, `flate2`, `notify-rust`…). Sans changement de code. Risque faible, couvert par les tests Rust.

### Versions majeures en retard (dépendances directes)

| Crate | Actuel | Disponible | Rôle | Risque | Recommandation |
|---|---|---|---|---|---|
| **sha2, hmac, hkdf, argon2** | 0.10 / 0.12 / 0.12 / 0.5 | 0.11 / 0.13 / 0.13 / 0.6 | Chiffrement local, mots de passe, licences | Moyen : **doivent bouger ensemble** (même socle `digest`) ; le résultat des calculs doit rester identique (sinon anciennes sauvegardes / mots de passe illisibles) | Lot C, avec tests de non-régression sur des valeurs connues |
| **rand, x25519-dalek** | 0.8 / 2 | 0.10 / 3 | Génération de clés | Moyen : **liés** (générateur aléatoire partagé) | Lot C, avec les précédents |
| **reqwest** | 0.12 | 0.13 | Tous les appels HTTP (Google, Microsoft, Brevo, portail) | Moyen : options TLS renommées | Lot D, seul, puis tester les connexions |
| **rusqlite** | 0.41 | 0.43 | Base de données | Moyen : nouvelle version de SQLite embarquée | Lot D, seul, avec une copie de base réelle |
| **mailparse** | 0.16 | 0.19 | Lecture des mails | Faible à moyen | Lot D |
| base64, ico | 0.21 / 0.4 | 0.23 / 0.6 | Encodage, icônes | Faible | Lot B ou C |
| **imap-proto** | 0.16 | 0.17 | Boîtes IMAP | — | **Ne pas toucher** (blocage n° 3) |
| **windows-core** | 0.62 | 0.100 | Export PDF CIF | — | **Ne pas toucher** : doit rester aligné sur WebView2/Tauri, et la nouvelle version exige Rust 1.95 |

## 3. Les trois blocages de compatibilité

1. **Tauri : interface et Rust doivent rester alignés.** `@tauri-apps/api`/`cli` (npm) et `tauri` (Cargo) sur la même version 2.12.x, tout comme `@tauri-apps/plugin-dialog` et `tauri-plugin-dialog`. Toujours mettre à jour les deux côtés ensemble.
2. **TypeScript 7 est bloqué par typescript-eslint** (plage acceptée `>=4.8.4 <6.1.0`). À reconsidérer quand typescript-eslint l'acceptera.
3. **imap-proto est imposé par `imap` 3.0.0-alpha.15**, qui dépend d'imap-proto 0.16. Passer seul à 0.17 créerait deux versions incompatibles des mêmes types. À faire uniquement avec une nouvelle version d'`imap`.

## Plan conseillé (un lot = un commit, vérifié séparément)

| Lot | Contenu | Risque | Vérification |
|---|---|---|---|
| **A** | Correctifs npm + Tauri 2.12 dernière version (npm **et** Rust ensemble) | Faible | `verify:full` |
| **B** | `cargo update` (94 compatibles) + base64, ico | Faible | `verify` (tests Rust) |
| **C** | Famille cryptographie (sha2, hmac, hkdf, argon2, rand, x25519-dalek) | Moyen | Tests avec valeurs connues : déchiffrer une sauvegarde et vérifier un mot de passe créés avec l'ancienne version |
| **D** | reqwest, rusqlite, mailparse (un par un) | Moyen | Tests + essai réel : connexion mail, agenda, ouverture de la base |
| — | TypeScript 7, imap-proto, windows-core | — | **Attendre** |

Les lots A et B sont sans risque et peuvent être faits tout de suite ; C et D méritent chacun une session dédiée.
