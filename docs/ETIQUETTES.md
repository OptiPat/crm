# Étiquettes et suivi automatique

Guide pour les **utilisateurs** (CGP) et les **développeurs / agents** qui modifient ce module.

---

## Rôle dans l’application

Les **étiquettes** servent à :

- repérer visuellement les contacts (badges colorés sur la liste et la fiche) ;
- **regrouper** les contacts selon des règles (relance, fiscalité, investissements…) ;
- préparer des **campagnes email** (file d’envoi dans Suivi → Envois).

Les **alertes** (Suivi → Alertes) restent un filet basé sur les **dates de dernier contact** ; elles sont **complémentaires** aux étiquettes, pas un doublon exact. Chaque alerte peut indiquer l’étiquette par défaut associée (ex. « Suivi > 1 an »).

---

## Utilisation (interface)

### Où agir

| Écran | Action |
|-------|--------|
| **Étiquettes** | Créer, modifier, désactiver, recalculer, voir les contacts par étiquette |
| **Contacts** | Filtrer par étiquette ; badges sur chaque ligne |
| **Fiche contact** | Ajouter / retirer des étiquettes **manuelles** |
| **Suivi → Étiquettes** | Parcourir les contacts par étiquette active |
| **Suivi → Envois** | Valider et envoyer les emails planifiés |

### Étiquette active / inactive

- **Active** : règle auto appliquée, visible dans les sélecteurs et (si configuré) campagne email.
- **Inactive** : plus d’attribution auto ni de campagne ; les tags **manuels** déjà posés restent sur la fiche.
- À la désactivation, les attributions **AUTO** sont retirées ; les **MANUEL** sont conservées.

### Étiquettes système (`is_default`)

Fournies à l’installation (ex. « Suivi > 1 an », « Fin démembrement »).

| Action | Autorisé |
|--------|----------|
| Modifier nom, couleur, priorité, règle, email | Oui |
| Désactiver | Oui |
| Supprimer | Non (évite une base vide chez un nouvel utilisateur) |

### Recalcul

- **Automatique (incrémental)** : sauvegarde d’un contact, d’un investissement ou d’une étiquette active avec règle auto.
- **Complet** : bouton « Recalculer » (page Étiquettes / Suivi), import massif, **une fois** au démarrage de session après le wizard si besoin.
- **Navigation** : ouverture Contacts / Suivi / Étiquettes = lecture en masse des attributions (**pas** de moteur complet à chaque écran (perf 1000+ contacts).

Les **compteurs** (nombre de contacts par étiquette) se rafraîchissent après les actions ci-dessus, sans recharger toute l’application.

### Priorité d’affichage

Champ **0–100** sur l’étiquette : plus la valeur est haute, plus le badge apparaît en premier sur les fiches.

---

## Types de conditions automatiques

| Type | Usage |
|------|--------|
| `DELAI_SANS_CONTACT` | X jours sans contact (selon catégories cochées) |
| `DATE_APPROCHE` | Champ **contact** (ex. `date_prochain_suivi`) dans les X prochains jours |
| `DATE_APPROCHE_INVESTISSEMENT` | Champ sur **investissement** (ex. fin démembrement, fin de prêt) |
| `PERIODE_ANNEE` | Mois calendaires (ex. déclaration IR avril–mai) |
| `TYPE_PRODUIT` | Le contact (ou son foyer) détient un type de produit donné |
| `AGE_APPROCHE` | Âge proche d’un seuil (ex. 69 ans) |

Validation à l’enregistrement : nom obligatoire, nom unique ; si étiquette **active** et règle auto → au moins une **catégorie** de contact.

---

## Étiquettes par défaut (seed)

Créées si la table est vide, ou complétées par `ensure_default_etiquettes` sans écraser une config déjà personnalisée :

- Suivi > 1 an  
- Suivi à planifier  
- Fin démembrement  
- Fin de prêt  
- Alerte 69 ans  
- Déclaration IR  
- Réduction d’impôt fin d’année  
- Suivi > 6 mois  

---

## Alertes ↔ étiquettes

| Mécanisme | Source | Objectif |
|-----------|--------|----------|
| **Alertes** | `generer_alertes_automatiques()` — dates dernier contact, catégories filleul, etc. | Liste de tâches « à traiter » dans Suivi |
| **Étiquettes** | Moteur auto + manuel | Segmentation durable, filtres, emails |

Correspondance indicative (UI Suivi) :

| Type d’alerte | Étiquette liée (nom par défaut) |
|---------------|----------------------------------|
| `SUIVI_CLIENT_1AN`, `CLIENT_JAMAIS_SUIVI` | Suivi > 1 an |
| `LEAD_SUIVI_6MOIS`, `LEAD_JAMAIS_CONTACTE`, filleuls 6 mois | Suivi > 6 mois |
| `FIN_DEMEMBREMENT` | Fin démembrement |
| `ANNIVERSAIRE` | Alerte 69 ans |

Traiter une alerte (date de suivi) peut faire évoluer les étiquettes au prochain recalcul incrémental.

---

## Architecture technique

### Fichiers principaux

| Zone | Fichier |
|------|---------|
| Moteur auto | `src-tauri/src/database/etiquettes_auto_engine.rs` |
| CRUD, validation, seed | `src-tauri/src/database/operations.rs` |
| Hooks post-save | `src-tauri/src/commands.rs` |
| Migrations SQLite | `src-tauri/src/database/mod.rs` |
| API frontend | `src/lib/api/tauri-etiquettes.ts` |
| Recalcul complet (UI) | `src/lib/etiquettes/sync-etiquettes-auto.ts` |
| Rafraîchissement compteurs UI | `src/lib/etiquettes/etiquette-events.ts` (`notifyEtiquettesChanged`) |
| Filtre Contacts (actives + inactives utilisées) | `src/lib/etiquettes/etiquettes-filter.ts` |
| Lien alertes | `src/lib/alertes/alerte-etiquette-links.ts` |

### Modèle de données

- **`etiquettes`** : définition + `actif`, `priorite`, `is_default`, règle auto, email.
- **`contact_etiquettes`** : liaison contact ↔ étiquette, `attribue_par` (`AUTO` | `MANUEL`), suivi email.

### Performance

- Liste Contacts : `getAllContactEtiquettesDetails()` en un appel ; virtualisation si > 50 contacts (vue normale) ou > 40 lignes (vue par foyer).
- Recalcul complet : transaction `BEGIN IMMEDIATE` + carte des attributions préchargée.

---

## Vérification (agents / CI locale)

Depuis la racine du dépôt :

```powershell
npm run verify
```

Voir aussi `AGENTS.md` et `.cursor/rules/verification-automatique.mdc`.

Tests Rust liés aux étiquettes (extrait) :

- `deactivate_etiquette_removes_auto_assignments`
- `delete_default_etiquette_is_blocked`
- `ensure_default_etiquettes_preserves_custom_config`
- `create_etiquette_rejects_duplicate_nom` / `create_etiquette_rejects_auto_rule_without_categories`
- `delai_sans_contact_inclure_sans_date_false_skips_contact_without_date`
- `auto_etiquette_matches_foyer_investissement`
- `etiquette_email_queue_ready_incomplete_sent`

Tests frontend : `src/lib/etiquettes/etiquettes-filter.test.ts`, `etiquette-email-preview.test.ts`.

---

## Principes produit

- **Souple** : désactiver plutôt que supprimer les étiquettes système ; éditer les règles même si l’étiquette est inactive (prises en compte à la réactivation).
- **Robuste** : garde-fous backend + tests ; pas de double recalcul inutile au démarrage.
- **Intuitif** : libellés français, badges, lien alerte → étiquette.
- **Non restrictif** : tags manuels conservés ; filtres incluent les étiquettes inactives encore portées par des contacts.

---

## Exceltis (UC Stellium)

| Étape | Comportement |
|-------|----------------|
| **Création client** | Question Exceltis → millésimes M+1…M+3 → étiquette `Exceltis — {Mois} {Année}` (manuelle). |
| **Mail Stellium** | Gmail `marketplacement@stellium.fr`, sujet contenant **Remboursement Exceltis** (un signal **par message**). |
| **Millésime** | Parsé depuis le sujet ou le corps (mot « Rendement » optionnel). |
| **Date « à partir du … »** | Indique quand le fond se désinvestit ; ensuite arbitrage / réinvestissement possible. Affichée dans Suivi et notifications. |
| **Fin de cycle** | Retrait d’étiquette **manuel** ; le mail ne retire rien automatiquement. |
| **Campagne email** | Modèle **Exceltis — remboursement et arbitrage** (`{{millesime}}`, `{{etiquette_nom}}`) — suggéré à la création de l’étiquette ; relance = modèle « suite sans réponse ». |

Scan automatique au démarrage du CRM (compte Google connecté), puis environ toutes les 5 minutes. Paramètres → Email : scan manuel possible.

**Limites scan Gmail :** requête limitée aux **400 derniers jours** ; pagination jusqu’à **200 messages** par scan (largement suffisant en usage normal). Millésime illisible : **3 tentatives** puis le message est ignoré.

---

## Historique doc

- Janvier 2026 : module initial (`prompts/AGENT_13_ETIQUETTES.md`).
- Mai 2026 : champ `actif`, moteur incrémental, perf, convergence alertes, events UI — ce document fait référence.
