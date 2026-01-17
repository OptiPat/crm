# 💼 MODULE : Suivi des Investissements

> **✅ MODULE TERMINÉ - 17 janvier 2026**
>
> **Fichiers créés :**
> - `src/pages/Investissements.tsx`
> - `src/components/investissements/InvestissementForm.tsx`
> - `src/lib/api/tauri-investissements.ts`
> - Backend Rust : `database/operations.rs`, `database/models.rs`
>
> **Fonctionnalités :**
> - ✅ Page Investissements avec tableau complet
> - ✅ Formulaire d'ajout/modification (tous types de produits)
> - ✅ Filtres par type, partenaire, recherche
> - ✅ Badges colorés par type de produit
> - ✅ Affichage des options (VP, réinvestissement, démembrement)
> - ✅ CRUD complet côté backend Rust
> - ✅ API TypeScript complète
> - ✅ Champ `origine` (MON_CONSEIL / EXISTANT_CLIENT)
> - ✅ Badge gris pour investissements "À côté"
>
> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Créer l'interface pour gérer les **investissements** des clients :
- CRUD complet des investissements
- Vue par contact et vue globale
- Alertes pour les SCPI démembrées (fin de démembrement)
- Vue consolidée par foyer

---

## 📊 Table existante : `investissements`

```typescript
{
  id: number;
  contactId: number;
  foyerId: number | null;  // Si investissement commun
  typeProduit: 'IMMOBILIER' | 'SCPI' | 'SCPI_DEMEMBREMENT' | 'ASSURANCE_VIE' | 'FIP_FCPI' | 'FCPR' | 'PER' | 'G3F' | 'AUTRE';
  partenaireId: number | null;
  nomProduit: string;
  montantInitial: number;  // En centimes
  dateSouscription: Date;
  dateFinDemembrement: Date | null;  // Pour SCPI_DEMEMBREMENT
  versementProgramme: boolean;
  montantVersementProgramme: number | null;
  frequenceVersement: 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL' | null;
  reinvestissementDividendes: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## ✨ Fonctionnalités à implémenter

### 1. Page Investissements (nouvelle page)

**Vue tableau** avec colonnes :
- Client (nom + prénom, lien vers fiche)
- Type de produit (badge coloré)
- Nom du produit
- Partenaire
- Montant initial (formaté €)
- Date de souscription
- Options (VP, Réinv.)
- Actions (voir, modifier, supprimer)

**Filtres** :
- Par type de produit
- Par partenaire
- Par client
- Recherche textuelle

**Tri** :
- Par date de souscription (récent → ancien)
- Par montant
- Par type

---

### 2. Formulaire d'investissement

**Champs** :
- Client (select avec recherche)
- Investissement commun ? (checkbox → affiche select foyer)
- Type de produit (select)
- Partenaire (select avec option "Ajouter nouveau")
- Nom du produit (texte)
- Montant initial (number, formaté en €)
- Date de souscription (date picker)
- Si SCPI_DEMEMBREMENT : Date de fin de démembrement
- Versement programmé (toggle)
  - Si oui : Montant + Fréquence
- Réinvestissement des dividendes (toggle)
- Notes (textarea)

---

### 3. Vue dans la fiche contact

Ajouter un onglet/section "Investissements" dans `ContactDetail.tsx` :
- Liste des investissements du contact
- Total encours
- Bouton "Ajouter un investissement"

---

### 4. Vue consolidée par foyer

Dans `FoyerDetail.tsx` :
- Investissements individuels de chaque membre
- Investissements communs
- Total patrimoine du foyer

---

### 5. Alertes fin de démembrement

Pour les `SCPI_DEMEMBREMENT` :
- Générer une alerte 6 mois avant la date de fin
- Afficher dans la page Suivi

---

## 🗂️ Fichiers à créer/modifier

### Nouveaux fichiers
- `src/pages/Investissements.tsx` - Page principale
- `src/components/investissements/InvestissementForm.tsx` - Formulaire
- `src/components/investissements/InvestissementDetail.tsx` - Vue détaillée
- `src/lib/api/tauri-investissements.ts` - API TypeScript

### Modifications
- `src/App.tsx` - Ajouter la route
- `src/components/layout/Sidebar.tsx` - Ajouter le menu (icône: Wallet ou Briefcase)
- `src/components/contacts/ContactDetail.tsx` - Ajouter section investissements
- `src/components/foyers/FoyerDetail.tsx` - Ajouter section investissements
- `src-tauri/src/commands.rs` - Ajouter les commandes CRUD
- `src-tauri/src/database/operations.rs` - Ajouter les fonctions DB
- `src-tauri/src/main.rs` - Enregistrer les commandes

---

## 🎨 Design

### Badges types de produits
```typescript
const getTypeProduitColor = (type: string) => {
  switch (type) {
    case 'SCPI': return 'bg-blue-100 text-blue-800';
    case 'SCPI_DEMEMBREMENT': return 'bg-purple-100 text-purple-800';
    case 'ASSURANCE_VIE': return 'bg-green-100 text-green-800';
    case 'PER': return 'bg-emerald-100 text-emerald-800';
    case 'IMMOBILIER': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};
```

### Formatage montants
```typescript
const formatEuro = (centimes: number) => 
  new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR' 
  }).format(centimes / 100);
```

---

## 📝 Ordre de développement

1. **Étape 1** : Créer les commandes Rust (CRUD investissements)
2. **Étape 2** : Créer l'API TypeScript
3. **Étape 3** : Créer la page Investissements avec tableau
4. **Étape 4** : Créer le formulaire d'ajout/modification
5. **Étape 5** : Ajouter la section dans ContactDetail
6. **Étape 6** : Ajouter la section dans FoyerDetail
7. **Étape 7** : Implémenter les alertes fin de démembrement

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [x] CRUD complet fonctionne
- [x] Les montants s'affichent correctement en €
- [x] Les investissements apparaissent dans la fiche contact
- [x] La vue foyer montre le total consolidé
- [x] Les alertes de fin de démembrement sont générées
- [x] Champ `origine` (MON_CONSEIL / EXISTANT_CLIENT)
- [x] Badge gris pour investissements "À côté"
