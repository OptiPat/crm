# Audit performance — gels de l'interface

_Date : 2026-11-21 · Analyse du code (Rust `src-tauri/src`, interface `src/`), sans mesure chronométrée._

## Le mécanisme des gels, en une phrase

Dans Tauri, une commande Rust **sans `async`** s'exécute sur le **fil de la fenêtre** : tant qu'elle tourne, l'interface ne peut ni se redessiner ni réagir. Or l'app compte **464 commandes synchrones pour 52 asynchrones**, et la base est protégée par **un seul verrou** (`Mutex<Option<Database>>`) : si une commande garde ce verrou longtemps, toutes les autres attendent, et la fenêtre attend avec elles.

## Ce qui est déjà bien fait

- **Synchronisation des mails** (Gmail, Outlook, IMAP) : commande asynchrone en tâche de fond, réseau **hors verrou**, verrou pris brièvement pour chaque écriture. Bon modèle.
- **Lecture du corps d'un mail** : à la demande, en tâche de fond.
- **Synchronisation d'équipe (SharePoint)** : asynchrone, verrou relâché pendant le réseau.
- **OCR** : Tesseract tourne dans un worker séparé.
- **Liste Contacts** : virtualisée (seules les lignes visibles sont dessinées).

## Ce qui fait geler l'app

| # | Cause | Où | Effet ressenti | Gain | Risque |
|---|---|---|---|---|---|
| 1 | **Appels réseau dans des commandes synchrones, verrou de la base tenu pendant l'appel** | `list_google_calendar_week`, `sync_pipe_google_rdvs`, `create/update/cancel_calendar_rdv` (Google Agenda), `push_newsletter_edition_to_brevo` (Brevo), `broadcast_espace_*`, `push_all_espace_clients_cmd`, `import_all_espace_depots_cmd`, `get_espace_connexion_log_cmd` (portail), `rebuild_team_cache_from_sharepoint_cmd`, `bootstrap/activate_team_sync_cmd` (SharePoint) | L'app entière se fige pendant la réponse du serveur (1 à 10 s, plus si le réseau est lent). L'agenda est ouvert souvent → gel fréquent. | **Très fort** | Faible |
| 2 | **Fichiers renvoyés en tableau JSON de nombres** | `read_pdf_file` (aperçus PDF, pièces d'identité, imports) | Un scan de 10 Mo devient ≈ 40 Mo de texte à décoder sur le fil de la fenêtre : gel de plusieurs secondes à l'ouverture d'un aperçu. | **Fort** | Très faible |
| 3 | **Historique des mails chargé avec le corps complet de chaque message** | `get_contact_gmail_messages` (sélection inclut `body_text`) appelé à l'ouverture de l'onglet Relation | Pour un client avec des centaines de mails, plusieurs Mo transférés et décodés alors que la liste n'affiche que l'objet et l'extrait. | Moyen à fort | Faible (le corps est déjà rechargé à la demande) |
| 4 | **Ouverture d'une fiche : 6 commandes synchrones lancées en parallèle** (échanges, interactions, mails, contact, placements, documents) | `loadContactRelationTimeline` | Elles s'exécutent **l'une après l'autre** sur le fil de la fenêtre (verrou unique) : micro-gel cumulé à chaque ouverture de fiche. | Moyen | Faible |
| 5 | **Commandes synchrones lourdes côté fichiers** | `restore_db_backup`, `create_external_backup_now`, `set_external_backup_directory`, `create_document`, `update_document`, `import_managed_logo_file_cmd`, `run_uc_comparison` | Gel pendant la copie / l'écriture disque. | Moyen | Faible |

## Corrections proposées (sans dégradation)

Le principe est toujours le même, déjà appliqué à la synchro des mails : **passer la commande en `async` + `spawn_blocking`**, et **ne tenir le verrou de la base que pour lire ou écrire**, jamais pendant un appel réseau. Le comportement visible ne change pas : seule la fenêtre reste réactive pendant l'attente.

1. **Agenda et RDV Google** (priorité 1, ouvert tous les jours) : `async` + `spawn_blocking`, verrou limité aux lectures/écritures locales.
2. **`read_pdf_file`** : renvoyer les octets bruts (`tauri::ipc::Response`) au lieu d'un `Vec<u8>` sérialisé en JSON, et passer en `async`. Le code interface sait déjà recevoir un `ArrayBuffer` (`toUint8Array`) : aucune autre modification.
3. **Liste des mails sans le corps** : ne plus sélectionner `body_text` dans la liste (l'extrait `snippet` suffit), le corps restant chargé à l'ouverture d'un message — à vérifier écran par écran avant de le retirer.
4. **Brevo, portail client, SharePoint (reconstruction / activation)** : même traitement que l'agenda.
5. **Sauvegardes, restauration, documents, comparateur UC** : `async` + `spawn_blocking`.
6. **Plus tard (gros chantier)** : passer les commandes de lecture les plus appelées en `async`, voire ouvrir une 2ᵉ connexion SQLite en lecture seule (mode WAL) pour que les lectures n'attendent plus les écritures.

## Ordre conseillé

**1 → 2 → 3**, chacun livrable seul et vérifiable par les tests existants (`npm run verify` côté Rust). Ces trois points couvrent les gels les plus fréquents : agenda, aperçus de documents, onglet Relation d'une fiche.
