# Agent 12 : Module Familles & Foyers

## 🎯 Objectif

Implémenter une hiérarchie à deux niveaux pour gérer les relations familiales et fiscales :
- **FAMILLE** = lien de parenté/sang (regroupement par identifiant famille, ex. A / B)
- **FOYER** = unité fiscale (déclaration d'impôts commune)

## 📊 Contexte métier CGP

Un conseiller en gestion de patrimoine a besoin de :
1. Voir tous les membres d'une **famille** pour la planification successorale
2. Gérer les **foyers fiscaux** séparément pour les déclarations et investissements communs
3. Comprendre les liens entre familles quand un couple se forme (ex. Nicolas + Pauline, familles A et B)

## 🏗️ Structure de données proposée

### Exemple concret

```
FAMILLE A                          FAMILLE B
├── Bruno (fam. A)                 ├── Didier (fam. B)
├── Michèle (fam. A)               ├── Sylvie (fam. B)
├── Coralie (fam. A)               ├── Thomas (fam. B)
└── Nicolas (fam. A) ──────────────┴── Pauline (fam. B)
         │                                      │
         └──────────── FOYER ──────────────────┘
              Nicolas + Pauline
              (déclaration commune)
```

### Foyers résultants

| Foyer | Membres | Famille(s) d'origine |
|-------|---------|---------------------|
| Foyer Bruno + Michèle | Bruno, Michèle | A |
| Foyer Coralie | Coralie (célibataire) | A |
| Foyer Nicolas + Pauline | Nicolas, Pauline | A + B |
| Foyer Didier + Sylvie | Didier, Sylvie | B |
| Foyer Thomas | Thomas (célibataire) | B |

## 📁 Modifications base de données

### Nouvelle table : `familles`

```sql
CREATE TABLE familles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,                    -- Ex: "A", "B"
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### Modification table : `contacts`

```sql
ALTER TABLE contacts ADD COLUMN famille_id INTEGER REFERENCES familles(id) ON DELETE SET NULL;
```

**Un contact a maintenant :**
- `famille_id` → sa famille d'origine (lien de sang)
- `foyer_id` → son foyer fiscal actuel (peut changer si mariage/divorce)

### Table `foyers` existante

Pas de modification nécessaire, garde la structure actuelle.

## 🔄 Logique d'import Excel

L'Excel ne change pas. L'import déduit automatiquement :

1. **Détection des familles** :
   - Même nom de famille = même famille
   - Création automatique de la famille si elle n'existe pas
   - Ex: Tous les contacts avec nom "A" → famille_id = famille A

2. **Détection des foyers** :
   - Lignes "X et Y / NOM1 et NOM2" → créent un foyer commun
   - Contacts individuels → foyer individuel (célibataire) OU rattachés au foyer parental s'ils sont mineurs

3. **Cas des couples inter-familles** :
   - Nicolas + Pauline (familles A et B)
   - Nicolas reste dans famille A
   - Pauline reste dans famille B
   - Les deux sont dans le MÊME foyer fiscal

## 🖥️ Interface utilisateur

### Vue "Familles" (nouvelle page)

```
┌─────────────────────────────────────────────────────────────┐
│ Familles                                                     │
├─────────────────────────────────────────────────────────────┤
│ 🔍 Rechercher...                                            │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👨‍👩‍👧‍👦 Famille A                                        │ │
│ │ 4 membres | 3 foyers                                    │ │
│ │ Bruno, Michèle, Coralie, Nicolas                        │ │
│ │ Patrimoine total famille: 320 000 €                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👨‍👩‍👧‍👦 Famille B                                    │ │
│ │ 4 membres | 3 foyers                                    │ │
│ │ Didier, Sylvie, Thomas, Pauline                         │ │
│ │ Patrimoine total famille: 150 000 €                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Vue détail Famille

```
┌─────────────────────────────────────────────────────────────┐
│ 👨‍👩‍👧‍👦 Famille A                                           │
├─────────────────────────────────────────────────────────────┤
│ FOYERS DE CETTE FAMILLE:                                    │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 🏠 Foyer Bruno + Michèle (parents)                    │   │
│ │ 💰 180 000 € | Bruno (D1), Michèle (D2)               │   │
│ └───────────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 🏠 Foyer Coralie (célibataire)                        │   │
│ │ 💰 45 000 € | Coralie                                 │   │
│ └───────────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 🏠 Foyer Nicolas + Pauline (couple inter-familles)    │   │
│ │ 💰 95 000 € | Nicolas + Pauline (fam. A + B)│   │
│ │ ⚠️ Lien avec famille B                        │   │
│ └───────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ PATRIMOINE TOTAL FAMILLE: 320 000 €                         │
│ (inclut les parts des membres dans foyers mixtes)           │
└─────────────────────────────────────────────────────────────┘
```

### Modification fiche Contact

Ajouter dans la fiche contact :
- Badge "Famille A" avec lien vers la vue famille
- Badge "Foyer Bruno + Michèle" avec lien vers le foyer
- Arbre généalogique simplifié (optionnel)

## 📋 Tâches d'implémentation

### Backend (Rust)

1. [ ] Créer table `familles` dans `database/mod.rs`
2. [ ] Ajouter `famille_id` à la table `contacts`
3. [ ] Créer les opérations CRUD pour `familles`
4. [ ] Modifier les queries contacts pour inclure `famille_id`
5. [ ] Ajouter commandes Tauri : `get_all_familles`, `create_famille`, etc.

### Frontend (React)

1. [ ] Créer `src/lib/api/tauri-familles.ts`
2. [ ] Créer page `src/pages/Familles.tsx`
3. [ ] Créer composant `src/components/familles/FamilleDetail.tsx`
4. [ ] Modifier `ContactDetail.tsx` pour afficher famille + foyer
5. [ ] Modifier `ContactImport.tsx` pour auto-détecter les familles
6. [ ] Ajouter entrée "Familles" dans le menu `Sidebar.tsx`

### Migration

1. [ ] Créer script migration pour :
   - Créer table `familles`
   - Ajouter colonne `famille_id` aux contacts
   - Auto-créer les familles basées sur les noms existants
   - Rattacher les contacts à leurs familles

## ⚠️ Points d'attention

1. **Noms composés** : « NOM1 NOM2 » = une seule famille ou deux ?
   - Proposition : traiter comme UNE famille « NOM1-NOM2 »

2. **Changement de nom** : Si Pauline B devient Pauline A après mariage
   - Elle reste dans famille B (origine)
   - Son nom affiché peut changer, mais pas sa famille

3. **Homonymes** : Deux familles homonymes non liées ?
   - L'utilisateur devra créer manuellement deux familles distinctes
   - Ou on ajoute un champ "ville d'origine" pour distinguer

4. **Performance** : Calcul patrimoine famille = somme des patrimoines de tous les membres
   - Peut être coûteux si beaucoup de membres
   - Prévoir un cache ou calcul asynchrone

## 🎯 Critères de succès

- [ ] Import Excel auto-détecte les familles par nom
- [ ] Vue "Familles" affiche toutes les familles avec stats
- [ ] Fiche contact montre famille ET foyer
- [ ] Liens cliquables entre famille ↔ foyers ↔ contacts
- [ ] Patrimoine total famille calculé correctement
- [ ] Couples inter-familles gérés (Nicolas + Pauline, familles A et B)

## 📅 Estimation

- Backend : 4-6 heures
- Frontend : 6-8 heures
- Tests & ajustements : 2-4 heures
- **Total : 12-18 heures**
