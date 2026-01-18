# 🤖 Agent : Refonte Contacts & Filleuls

> **Copie-colle ce prompt pour créer l'agent**
>
> 🔴 **Important** - Refonte majeure de la page Contacts

---

## Prompt à copier

```
Tu es l'agent spécialisé dans la refonte de la page Contacts pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- L'utilisateur a 2 activités : CGP (clients patrimoine) + MLM (filleuls réseau)

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@src/pages/Contacts.tsx
@src/components/contacts/ContactImport.tsx
@src/lib/db/schema.ts

## Ce qui est DÉJÀ FAIT
- ✅ Page Contacts avec filtres par catégorie
- ✅ Import Excel pour clients (SUSPECT_CLIENT, PROSPECT_CLIENT, CLIENT)
- ✅ Catégories existantes : CLIENT, PROSPECT_CLIENT, SUSPECT_CLIENT, PROSPECT_FILLEUL, SUSPECT_FILLEUL

## CE QUI DOIT ÊTRE FAIT (dans l'ordre)

### Étape 1 : Modifier la base de données

1. Ajouter les nouvelles catégories dans le schéma :
   - `FILLEUL` (filleul actif dans le réseau MLM)
   - `FILLEUL_DESINSCRIT` (ex-filleul qui a quitté)

2. Ajouter le champ `parrain_id` sur la table contacts :
   - Type : INTEGER nullable
   - Foreign Key vers contacts(id)
   - Usage : lier un filleul à son parrain

3. Créer la migration SQL correspondante

4. Mettre à jour le backend Rust (models.rs, operations.rs) pour gérer parrain_id

### Étape 2 : Modifier la page Contacts avec 2 onglets principaux

Structure des onglets :

```
┌─────────────────────────────────────────────────────┐
│  [🏦 CLIENTS]                    [👥 FILLEULS]      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Onglet CLIENTS → Sous-onglets :                   │
│  ┌──────────┬────────────┬────────────┐            │
│  │ Clients  │ Prospects  │  Suspects  │            │
│  └──────────┴────────────┴────────────┘            │
│                                                     │
│  Onglet FILLEULS → Sous-onglets :                  │
│  ┌──────────┬────────────┬────────────┬──────────┐ │
│  │ Filleuls │ Prospects  │  Suspects  │Désinscrits│ │
│  └──────────┴────────────┴────────────┴──────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Catégories par onglet :
- CLIENTS > Clients = `CLIENT`
- CLIENTS > Prospects = `PROSPECT_CLIENT`
- CLIENTS > Suspects = `SUSPECT_CLIENT`
- FILLEULS > Filleuls = `FILLEUL`
- FILLEULS > Prospects = `PROSPECT_FILLEUL`
- FILLEULS > Suspects = `SUSPECT_FILLEUL`
- FILLEULS > Désinscrits = `FILLEUL_DESINSCRIT`

### Étape 3 : Créer l'import Excel Filleuls

Nouveau composant `ContactImportFilleuls.tsx` avec les colonnes :

| Colonne Excel | Champ BDD | Obligatoire |
|---------------|-----------|-------------|
| Nom | nom | ✅ |
| Prénom | prenom | ✅ |
| Email | email | |
| Téléphone | telephone | |
| Date de naissance | date_naissance | |
| Catégorie | categorie | ✅ (Prospect/Suspect/Filleul/Désinscrit) |
| Nom Parrain | → recherche parrain_id | |
| Prénom Parrain | → recherche parrain_id | |
| Date inscription | → nouveau champ ou notes | |
| Date dernier suivi | date_dernier_contact | |
| Commentaire | notes | |

Logique pour le parrain :
- Chercher un contact existant avec nom + prénom correspondant
- Si trouvé → assigner son ID à parrain_id
- Si non trouvé → laisser null + afficher warning "Parrain non trouvé"

### Étape 4 : Afficher le parrain dans la fiche contact

Dans `ContactDetail.tsx`, si le contact a un `parrain_id` :
- Afficher une section "Parrainé par : [Nom Prénom du parrain]"
- Lien cliquable vers la fiche du parrain
- Ne s'affiche que pour les catégories FILLEUL, PROSPECT_FILLEUL, SUSPECT_FILLEUL, FILLEUL_DESINSCRIT

### Étape 5 : Afficher les filleuls d'un contact

Dans `ContactDetail.tsx`, ajouter une section "Mes filleuls" :
- Requête : tous les contacts ayant ce contact comme parrain_id
- Afficher : Nom, Prénom, Catégorie (badge coloré), Date dernier suivi
- Compteur récapitulatif : "3 filleuls actifs, 1 prospect, 1 désinscrit"
- Lien cliquable vers chaque filleul

### Étape 6 : Bouton import contextuel

- Quand on est sur l'onglet FILLEULS → le bouton "Importer" ouvre `ContactImportFilleuls`
- Quand on est sur l'onglet CLIENTS → le bouton "Importer" ouvre `ContactImport` existant

### Étape 7 : Formulaire contact adapté

Dans `ContactForm.tsx` :
- Si catégorie filleul (FILLEUL, PROSPECT_FILLEUL, SUSPECT_FILLEUL, FILLEUL_DESINSCRIT) :
  - Afficher un champ "Parrain" (select avec recherche de contacts)
- Si catégorie client (CLIENT, PROSPECT_CLIENT, SUSPECT_CLIENT) :
  - Pas de champ parrain

## Modèle Excel Filleuls à générer

Créer un fichier modèle téléchargeable avec ces colonnes :
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

## Règles OBLIGATOIRES

### Commande de lancement
TOUJOURS utiliser cette commande (jamais `npm run tauri:dev` seul) :
```powershell
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1; if ($proc) { taskkill /F /PID $proc 2>$null }; cd D:\crm; npm run tauri:dev -- --release
```

### Si erreur de compilation
1. Vérifier que l'app n'est pas déjà lancée
2. Si bloqué, exécuter : `cd D:\crm\src-tauri; cargo clean`
3. Relancer avec `-- --release`

### Règles de code
- TypeScript strict (pas de `any`)
- Messages UI en français
- Noms variables/fonctions en anglais
- UNE fonctionnalité à la fois
- Attendre ma validation après chaque étape

Commence par l'étape 1 (modification base de données).
```

---

## Priorité
🔴 **Haute** - Refonte demandée par l'utilisateur

## Durée estimée
3-4 sessions

## Résumé des modifications

| Élément | Modification |
|---------|-------------|
| **Catégories** | Ajouter `FILLEUL` et `FILLEUL_DESINSCRIT` |
| **Champ BDD** | Ajouter `parrain_id` (FK vers contacts) |
| **Page Contacts** | 2 onglets : Clients / Filleuls |
| **Sous-onglets Clients** | Clients, Prospects, Suspects |
| **Sous-onglets Filleuls** | Filleuls, Prospects, Suspects, Désinscrits |
| **Import Excel** | Nouvel import dédié Filleuls |
| **Fiche contact** | Afficher "Parrainé par" + liste "Mes filleuls" |
