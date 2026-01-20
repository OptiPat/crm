# 🤖 Agent 1 : OCR & Import RIO

> **Copie-colle ce prompt pour créer l'agent**

---

## Prompt à copier

```
Tu es l'agent spécialisé dans l'import PDF/RIO pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@PROMPT_PDF_OCR.md

## Ce qui est DÉJÀ FAIT (ne pas refaire)
- ✅ Extraction texte PDF natif (PDF.js) → `src/lib/pdf/extractor.ts`
- ✅ Parsers RIO → `src/lib/pdf/parsers/rio-parser.ts`, `rio-parser-advanced.ts`, `rio-parser-patrimoine.ts`
- ✅ Parser générique → `src/lib/pdf/parsers/generic-parser.ts`
- ✅ Preview des données extraites → `ExtractedDataPreviewAdvanced.tsx`
- ✅ Tri "Avec moi" / "À côté" → `PatrimoineTriDialog.tsx`
- ✅ Champ `origine` dans investissements (MON_CONSEIL / EXISTANT_CLIENT)
- ✅ Badge gris pour investissements "À côté"
- ✅ Mise à jour catégorie contact après RIO

## Ce qui reste À FAIRE (dans l'ordre)
1. **Détection doublons investissements** : Si un investissement similaire existe déjà pour le contact, demander "Est-ce le même ?" → Si oui, mettre à jour au lieu de créer
2. **OCR Tesseract.js** : Pour les PDF scannés (images), ajouter l'OCR avec Tesseract.js
3. **Détection couples** : Détecter si le RIO contient 2 personnes (M. et Mme) et proposer de créer/lier les 2 contacts

## 🔥 LEÇONS CRITIQUES (issues de l'import Excel)

### ⚠️ Détection des doublons d'investissements
**Contexte** : L'import Excel a révélé des bugs majeurs de duplication.

**Solution implémentée dans `ContactImport.tsx`** (lignes 677-745) :
- Fonction `findExistingInvestissement()` qui compare :
  - Contact/Foyer propriétaire
  - Type de produit (exact)
  - Nom du produit (normalisé en majuscules)
  - Partenaire (si renseigné)
  - **Montant avec tolérance de 1€** (pour éviter les faux négatifs)
- Fonction `createOrUpdateInvestissement()` qui :
  - Si doublon détecté → **met à jour** l'existant
  - Sinon → crée un nouveau
  - **Met à jour le cache local** pour éviter les doublons dans le même import

**À réutiliser pour le RIO** : Cette logique DOIT être adaptée pour éviter de créer des doublons lors de l'import RIO annuel.

### ⚠️ Suppression en cascade
**Problème** : Supprimer un contact ne supprimait pas ses investissements, causant un encours fantôme.

**Solution** : Modifier `delete_contact()` dans `src-tauri/src/database/operations.rs` :
1. Récupérer le `foyer_id` avant suppression
2. Supprimer les investissements du contact
3. Supprimer le contact
4. Vérifier si le foyer est vide → Si oui, supprimer le foyer + ses investissements

**Impact RIO** : S'assurer que toute suppression de données via RIO respecte cette cascade.

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

Développe la fonctionnalité 1 (détection doublons) en premier.
```

---

## Priorité
🔴 **Haute** - Module presque terminé, reste 3 fonctionnalités

## Durée estimée
1-2 sessions
