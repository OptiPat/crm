# MODULE FOYERS & FAMILLES - GUIDE DE DÉPLOIEMENT

## 🎯 Fonctionnalités implémentées

### 1. Gestion des foyers fiscaux ✅
- Champ `role_foyer` (DECLARANT_1, DECLARANT_2, ENFANT, AUTRE)
- Section "Foyer" dans chaque fiche contact
- Patrimoine cumulé du foyer affiché
- Liste des membres avec leurs rôles

### 2. Création et liaison de foyers ✅
- **Bouton "Créer un foyer"** : Créer un nouveau foyer et y ajouter des membres
- **Bouton "Lier à un contact"** : Rejoindre le foyer d'un autre contact
- **Bouton "Modifier"** : Changer de foyer
- **Bouton "Dissocier"** : Retirer le contact du foyer

### 3. Vue groupée par foyer ✅
- Toggle "Afficher par foyer" dans la liste des contacts
- Regroupement visuel avec patrimoine cumulé
- Rôles affichés pour chaque membre

### 4. Détection automatique à l'import ✅
- Détection des familles (même nom de famille)
- Modale interactive pour définir les rôles
- Option "homonymes" pour ignorer
- Bouton "X" pour retirer des membres

### 5. **NOUVEAU** : Investissements communs ✅
- **Détection automatique** des lignes « Marie et Pierre » (exemple fictif)
- **Création automatique** :
  - Si les contacts n'existent pas → Créer les 2 contacts + le foyer
  - Si les contacts existent sans foyer → Créer le foyer et les lier
  - Si le foyer existe → Juste rattacher l'investissement
- **Pas de création de "contact couple"** (évite les doublons)
- **Investissement rattaché au foyer** (pas à un contact individuel)
- **Badge "Propriétaire"** dans la fiche contact :
  - 🟢 Vert : Investissement du contact actuel
  - 🔵 Bleu : Investissement du foyer (commun)
  - ⚪ Gris : Investissement d'un autre membre

### 6. Navigation fluide ✅
- Cliquer sur un membre du foyer ouvre sa fiche
- Retour automatique après modifications

## 🚀 Déploiement

### Option 1 : Script automatique (RECOMMANDÉ)
```powershell
.\deploy-module-foyers.ps1
```

Ce script fait tout automatiquement :
1. Arrête l'app
2. Nettoie Rust (`cargo clean`)
3. Applique les migrations SQL
4. Recompile et lance l'app

### Option 2 : Manuel
```powershell
# 1. Arrêter l'app
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
taskkill /F /PID $proc

# 2. Nettoyer Rust
cd src-tauri
cargo clean
cd ..

# 3. Appliquer les migrations
.\apply-migration-role-foyer.ps1
.\apply-migration-contact-optional.ps1

# 4. Relancer
npm run tauri:dev -- --release
```

## 📋 Fichiers créés/modifiés

### Nouveaux fichiers créés :
- `src/components/foyers/FoyerCreateModal.tsx`
- `src/components/foyers/FoyerLinkModal.tsx`
- `src/components/foyers/FoyerGroupingModal.tsx`
- `src/components/ui/checkbox.tsx`
- `drizzle/0005_add_role_foyer.sql`
- `drizzle/0006_make_contact_id_optional.sql`
- `apply-migration-role-foyer.ps1`
- `apply-migration-contact-optional.ps1`
- `deploy-module-foyers.ps1`

### Fichiers modifiés :

**Frontend :**
- `src/lib/db/schema.ts` - Schéma contacts + investissements
- `src/lib/api/tauri-investissements.ts` - Types TypeScript
- `src/App.tsx` - Routes
- `src/components/layout/Sidebar.tsx` - Navigation
- `src/pages/Contacts.tsx` - Vue groupée + propriétaire
- `src/components/contacts/ContactDetail.tsx` - Section foyer + dissociation + membres cliquables
- `src/components/contacts/ContactImport.tsx` - Détection couples + foyers

**Backend Rust :**
- `src-tauri/src/database/models.rs` - Modèles
- `src-tauri/src/database/operations.rs` - UPDATE avec foyer_id
- `src-tauri/src/database/mod.rs` - CREATE TABLE

## 🧪 Tests à faire après déploiement

### Test 1 : Créer un foyer manuellement
1. Ouvrir une fiche contact
2. Cliquer "Créer un foyer"
3. Ajouter des membres
4. Valider
5. ✅ Vérifier que la section Foyer s'affiche

### Test 2 : Import avec détection
1. Importer un fichier Excel
2. ✅ La modale de regroupement apparaît
3. Retirer les membres hors foyer (enfants adultes)
4. Valider
5. ✅ Vérifier les foyers dans la liste

### Test 3 : Investissements communs (création automatique)
1. Importer une ligne « Marie et Pierre » avec un produit
2. ✅ Les contacts Marie et Pierre sont créés automatiquement
3. ✅ Un foyer « Foyer couple » est créé automatiquement
4. ✅ Les 2 contacts sont liés au foyer (DECLARANT_1 et DECLARANT_2)
5. Ouvrir la fiche de Marie
6. ✅ Voir l'investissement avec badge "Foyer" (bleu)
7. Ouvrir la fiche de Pierre
8. ✅ Voir le même investissement avec badge "Foyer" (bleu)

### Test 4 : Dissociation
1. Ouvrir un contact avec un foyer
2. Cliquer "Dissocier"
3. ✅ Le contact n'a plus de foyer

### Test 5 : Vue groupée
1. Dans Contacts, cliquer "Afficher par foyer"
2. ✅ Voir les familles groupées avec patrimoine

## 🔍 Logs de debug

Les logs sont activés avec des emojis :
- 🏠 = Modales de création/liaison
- 👫 = Détection des couples
- 👥 = Modale de regroupement
- 📥 = Import
- 📋 = Vue groupée
- 💰 = Investissements

Pour les supprimer après validation, chercher et supprimer toutes les lignes `console.log` avec ces emojis.

## ⚠️ Notes importantes

1. **Enfants adultes** : À retirer manuellement lors du regroupement (bouton X)
2. **Homonymes** : Cocher "Ce sont des homonymes" pour ignorer un groupe
3. **Couples** : Les lignes « Prénom1 et Prénom2 » sont automatiquement détectées
4. **Patrimoine** : Calculé automatiquement (contact + foyer)

---

**Module développé et testé le 18/01/2026** 🎉
