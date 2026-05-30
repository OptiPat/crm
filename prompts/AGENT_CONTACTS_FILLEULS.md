# 🤖 Agent : Refonte Contacts & Filleuls

> **✅ MODULE TERMINÉ - 24 janvier 2026**
>
> Toutes les fonctionnalités ont été implémentées, y compris Prescripteurs et dates de suivi séparées.

---

## ✅ Ce qui a été fait

### Étape 1 : Base de données ✅
- [x] Catégorie `FILLEUL` ajoutée dans `schema.ts`
- [x] Catégorie `FILLEUL_DESINSCRIT` ajoutée dans `schema.ts`
- [x] Champ `parrain_id` ajouté (FK vers contacts)
- [x] Migration SQL `0004_add_filleul_categories_and_parrain.sql`
- [x] Backend Rust : `models.rs` avec `parrain_id: Option<i64>`
- [x] Backend Rust : `operations.rs` avec `get_filleuls_by_parrain()`

### Étape 2 : Page Contacts avec onglets ✅
- [x] Onglet CLIENTS avec sous-onglets : Clients, Prospects, Suspects
- [x] Onglet FILLEULS avec sous-onglets : Filleuls, Prospects, Suspects, Désinscrits
- [x] Compteurs par catégorie (badges avec nombres)

### Étape 3 : Import Excel Filleuls ✅
- [x] Composant `ContactImportFilleuls.tsx` créé
- [x] Mapping colonnes : Nom, Prénom, Email, Tel, DDN, Catégorie, Parrain
- [x] Recherche parrain par nom + prénom
- [x] Création automatique du parrain si non trouvé

### Étape 4 : Afficher le parrain ✅
- [x] Section "Parrainé par" dans `ContactDetail.tsx`
- [x] Lien cliquable vers la fiche du parrain

### Étape 5 : Afficher les filleuls ✅
- [x] Section "Mes filleuls" dans `ContactDetail.tsx`
- [x] Compteur récapitulatif : "X actifs, Y prospects, Z désinscrits"
- [x] Liens cliquables vers chaque filleul

### Étape 6 : Bouton import contextuel ✅
- [x] Onglet FILLEULS → ouvre `ContactImportFilleuls`
- [x] Onglet CLIENTS → ouvre `ContactImport` existant

### Étape 7 : Formulaire contact ✅
- [x] Champ "Parrain" affiché si catégorie filleul
- [x] Select avec recherche de contacts

### Étape 8 : Prescripteurs ✅ (24/01/2026)
- [x] Champ `prescripteur_id` ajouté au modèle Contact
- [x] Migration automatique dans `mod.rs`
- [x] Dropdown "Prescripteur" dans `ContactForm.tsx` (pour tous les contacts)
- [x] Bouton "+ Nouveau" pour créer un prescripteur inline
- [x] Catégorie `PRESCRIPTEUR` pour prescripteur-only (ni client, ni filleul)
- [x] **Page Prescripteurs** (`src/pages/Prescripteurs.tsx`)
  - Arbre généalogique récursif des recommandations
  - Patrimoine personnel + patrimoine apporté affiché
  - Stats globales (prescripteurs actifs, clients recommandés, total apporté)
  - **Mode compact** : Investissements cachés par défaut, bouton 👁️ pour afficher
  - **Stats par branche** : "📈 Branche : X clients • Y€ apporté"
  - **Couleurs par niveau** : Bleu (racine) → Ciel → Gris → Clair
  - **Foyers consolidés** : "🏠 Foyer exemple (Didier + Sylvie)"
  - **Investissements foyer** : Badge 👤 Prénom pour perso, 🏠 Commun pour partagés
  - **Recherche par foyer** : Match sur nom de famille et prénoms des membres
  - **Option B** : Un seul prescripteur_id par foyer (évite doublons dans l'arbre)
- [x] Onglet "Prescripteurs" dans sidebar

### Étape 9 : Dates de suivi séparées ✅ (24/01/2026)
- [x] Champs `date_dernier_contact_filleul` / `date_prochain_suivi_filleul`
- [x] Page Suivi affiche dates correctes selon onglet (Client vs Filleul)
- [x] Un contact peut être Client ET Filleul avec dates indépendantes
- [x] Suppression d'un client préserve son statut filleul (catégorie → AUCUN)

### Étape 10 : Nettoyage données orphelines ✅ (24/01/2026)
- [x] Dashboard ne compte que les investissements liés à contacts/foyers existants
- [x] Fonction `cleanup_all_orphaned_data()` dans Rust
- [x] Bouton "Nettoyer les données orphelines" dans Paramètres
- [x] Supprime foyers sans membres + investissements sans contact/foyer

---

## 📁 Fichiers créés/modifiés

| Fichier | Modification |
|---------|-------------|
| `src/lib/db/schema.ts` | Catégories + parrain_id + prescripteur_id |
| `src/pages/Contacts.tsx` | Onglets CLIENTS/FILLEULS, suppression préserve filleuls |
| `src/pages/Prescripteurs.tsx` | **NOUVEAU** - Arbre des recommandations |
| `src/pages/Parametres.tsx` | Bouton nettoyage données orphelines |
| `src/components/contacts/ContactImportFilleuls.tsx` | **NOUVEAU** |
| `src/components/contacts/ContactDetail.tsx` | Parrain + Mes filleuls |
| `src/components/contacts/ContactForm.tsx` | Parrain + Prescripteur (+ Nouveau) |
| `src/components/layout/Sidebar.tsx` | Onglet Prescripteurs ajouté |
| `src/lib/api/tauri-contacts.ts` | prescripteur_id, getClientsByPrescripteur, cleanupOrphanedData |
| `src-tauri/src/database/models.rs` | prescripteur_id, dates filleul |
| `src-tauri/src/database/operations.rs` | get_clients_by_prescripteur, cleanup_orphaned_* |
| `src-tauri/src/database/mod.rs` | Migrations prescripteur_id, dates filleul |
| `src-tauri/src/commands.rs` | get_clients_by_prescripteur, cleanup_orphaned_data |
| `src-tauri/src/main.rs` | Nouvelles commandes enregistrées |

---

## 📊 Structure finale

```
Sidebar
├── Tableau de bord
├── Contacts
│   ├── 🏦 CLIENTS (avec sous-onglets)
│   └── 👥 FILLEULS (avec sous-onglets)
├── Familles
├── 🔗 Prescripteurs          ← NOUVEAU
├── Suivi
├── Partenaires
├── Investissements
├── Documents
├── Interactions
├── Templates Email
└── Paramètres
    └── 🧹 Nettoyer données orphelines  ← NOUVEAU

Page Contacts
├── 🏦 CLIENTS
│   ├── Clients (CLIENT)
│   ├── Prospects (PROSPECT_CLIENT)
│   └── Suspects (SUSPECT_CLIENT)
│
└── 👥 FILLEULS
    ├── Filleuls (FILLEUL)
    ├── Prospects (PROSPECT_FILLEUL)
    ├── Suspects (SUSPECT_FILLEUL)
    └── Désinscrits (FILLEUL_DESINSCRIT)

Page Prescripteurs
├── Stats globales (prescripteurs, clients recommandés, patrimoine apporté)
├── 🔍 Recherche (par nom, prénom, OU nom de foyer)
└── Liste des prescripteurs racines
    └── 🌳 Arbre récursif par prescripteur
        ├── 👤 Prescripteur (patrimoine personnel + apporté) 👁️ 5
        │   📈 Branche : X clients • Y€ apporté
        │   ├── 🏠 Foyer exemple (Didier + Sylvie) 💰 150k€
        │   │   ├─ SCPI 👤 Didier Épargne Pierre 25k€
        │   │   ├─ AV 👤 Sylvie Assurance-vie 30k€
        │   │   └─ SCPI 🏠 Commun Primovie 50k€
        │   └── 👤 Client solo (patrimoine)
        │       └── Sous-clients recommandés...
        └── ...
```

---

## Modèle Excel Filleuls

Fichier disponible : `Modele_Import_Filleuls.xlsx`

Colonnes :
- Nom
- Prénom
- Email
- Téléphone
- Date de naissance
- Catégorie (Prospect / Suspect / Filleul / Désinscrit)
- Nom Parrain
- Prénom Parrain
- Date inscription
- Date dernier suivi
- Commentaire

---

## 🔗 Différence Parrain vs Prescripteur

| Concept | Parrain | Prescripteur |
|---------|---------|--------------|
| **Champ** | `parrain_id` | `prescripteur_id` |
| **Usage** | MLM / Réseau filleuls | Apport d'affaires clients |
| **Contexte** | Catégories FILLEUL | Tous les contacts |
| **Affiché** | Fiche contact (section Parrain) | Fiche contact + Page Prescripteurs |
| **Arbre** | Non | Oui (récursif avec patrimoine) |

### Exemple concret

```
Pauline (démarchée directement, prescripteur_id = NULL)
├── Parents de Pauline (prescripteur_id = Pauline)
│   ├── Fils des parents (prescripteur_id = Parents)
│   └── Amis des parents (prescripteur_id = Parents)
│       └── Fils des amis (prescripteur_id = Amis)
│           └── Amis du fils (prescripteur_id = Fils)
```

La page Prescripteurs affiche :
- **Pauline** : Patrimoine personnel 50k€, Patrimoine apporté 250k€ (total arbre)
  - Arbre dépliant avec tous les niveaux

---

## 🔀 Contact multi-rôles

Un contact peut maintenant avoir plusieurs rôles simultanés :

| Rôle | Champ | Exemple |
|------|-------|---------|
| **Client** | `categorie = CLIENT` | Client avec patrimoine |
| **Filleul** | `filleul_categorie = FILLEUL` | Inscrit au réseau MLM |
| **Prescripteur** | Quelqu'un a son ID en `prescripteur_id` | A recommandé des clients |

### Suppression intelligente

- **Supprimer client** qui est aussi filleul → `categorie = AUCUN`, garde `filleul_categorie`
- **Supprimer filleul** qui est aussi client → `filleul_categorie = NULL`, garde `categorie`
- Les dates de suivi sont indépendantes (client vs filleul)

---

## 🧹 Maintenance des données

Bouton dans **Paramètres > Base de données** :

**"Nettoyer les données orphelines"** supprime :
- Foyers sans membres
- Investissements dont le contact n'existe plus
- Investissements dont le foyer n'existe plus

Le Dashboard calcule l'encours uniquement sur les investissements valides.
