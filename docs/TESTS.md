# Tests Patrimoine CRM

## Commandes

| Commande | Description |
|----------|-------------|
| `npm run test` | Tests unitaires TypeScript (Vitest) |
| `npm run test:watch` | Mode watch |
| `npm run test:rust` | Tests Rust (`contact_name` + intégration SQLite mémoire) |
| `npm run test:all` | Les deux suites |

## TypeScript (`src/**/*.test.ts`)

Logique métier pure, sans Tauri ni UI :

- `name-match` — normalisation noms, dédup
- `foyer-utils` — foyers, patrimoine
- `investissement-display` — libellés et couleurs
- `parse-import-date` — dates Excel / FR
- `contact-form-utils` — catégories import, suivi alertes
- `search-utils` — recherche accents
- `contact-category-display` — badges catégorie
- `tauri-alertes` — libellés alertes
- **`contact-import-couple`** — détection couples Excel (extrait de `ContactImport`)
- **`merge-duplicate-logic`** — fusion champs doublons (extrait de `merge-duplicate-group`)

Fixtures : `src/lib/contacts/__fixtures__/import-couple-fixtures.ts`

## Rust (`cargo test`)

- `contact_name.rs` — normalisation et matching
- `database::operations::database_integration_tests` :
  - `get_alertes_with_contacts` (timestamp `date_dernier_contact`)
- `check_and_create_demembrement_alerts` (investissement foyer sans `contact_id`)
- `cleanup_orphaned_foyers`
- `update_contact_persists_foyer_id_and_role`
- `investissements_by_contact_and_by_foyer`
- `delete_contact_clears_foyer_id_on_contact`

Base de test : `Database::open_in_memory_for_tests()`.

## Hors scope

Pas de tests E2E (Tauri / navigateur).
