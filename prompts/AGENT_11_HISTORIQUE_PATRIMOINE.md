# 🤖 Agent 11 : Historique & Évolution Patrimoniale

> **Copie-colle ce prompt pour créer l'agent**
>
> 🔴 **IMPORTANTE** - Valeur ajoutée majeure pour le suivi client annuel

---

## Prompt à copier

```
Tu es l'agent spécialisé dans l'historique patrimonial et l'évolution année après année pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@AGENT_1_OCR_RIO.md (import RIO déjà implémenté)

## Besoin utilisateur

**Scénario :**
1. 2025 : Je rencontre un client, j'importe son RIO (patrimoine initial)
2. 2026 : Lors du suivi annuel, j'importe le nouveau RIO
3. **Je veux voir** : L'évolution du patrimoine entre 2025 et 2026 avec des stats visuelles

## Ce qui est DÉJÀ FAIT
- ✅ Import RIO → `src/components/documents/DocumentUpload.tsx`
- ✅ Table `investissements` avec montants
- ✅ Champ `origine` (MON_CONSEIL / EXISTANT_CLIENT)
- ✅ Détection doublons investissements (voir `CONTEXTE_GLOBAL.md` section "LEÇONS CRITIQUES")

## Ce qui reste À FAIRE (dans l'ordre)

### 1. Migration SQL : Table `valorisations`
Créer une table pour stocker l'historique des valorisations :

```sql
CREATE TABLE IF NOT EXISTS valorisations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investissement_id INTEGER NOT NULL,
    date_valorisation INTEGER NOT NULL,  -- Timestamp Unix
    montant_valorise INTEGER NOT NULL,    -- En centimes
    source TEXT NOT NULL,                 -- "RIO_IMPORT", "MANUEL", "BULLETIN_SOUSCRIPTION"
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (investissement_id) REFERENCES investissements(id) ON DELETE CASCADE
);

CREATE INDEX idx_valorisations_investissement ON valorisations(investissement_id);
CREATE INDEX idx_valorisations_date ON valorisations(date_valorisation);
```

### 2. Backend Rust : CRUD valorisations
Dans `src-tauri/src/database/` :
- **models.rs** : Ajouter `Valorisation` et `NewValorisation`
- **operations.rs** : Fonctions CRUD
  - `create_valorisation()`
  - `get_valorisations_by_investissement()`
  - `get_valorisations_by_contact_between_dates()`
  - `get_valorisations_by_foyer_between_dates()`
- **commands.rs** : Exposer les commandes Tauri

### 3. Modifier l'import RIO (DocumentUpload.tsx)

**Objectif** : À chaque import RIO, proposer à l'utilisateur de lier les investissements détectés avec ceux existants.

**Workflow :**

```
┌─────────────────────────────────────────────────────┐
│  📊 Détection d'investissements existants           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Le client possède déjà des investissements.       │
│  Voulez-vous mettre à jour les valorisations ?     │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ ✓ SCPI NCap Regions                         │  │
│  │   2025: 50 000€ → 2026: 52 000€ (+4%)      │  │
│  │   [ ] Même investissement                   │  │
│  │   [ ] Nouvel investissement                 │  │
│  ├─────────────────────────────────────────────┤  │
│  │ ✓ AV Spirica Afer                           │  │
│  │   2025: 120 000€ → 2026: 125 000€ (+4.2%)  │  │
│  │   [x] Même investissement                   │  │
│  │   [ ] Nouvel investissement                 │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  [Annuler]                    [Confirmer l'import]  │
└─────────────────────────────────────────────────────┘
```

**Logique :**
1. Détecter les investissements existants via `findExistingInvestissement()` (déjà implémenté)
2. Pour chaque match, afficher un dialog de confirmation
3. Si "Même investissement" ✓ :
   - **NE PAS** écraser `montant_initial` dans `investissements`
   - **CRÉER** une nouvelle ligne dans `valorisations` avec le nouveau montant
4. Si "Nouvel investissement" ✓ :
   - Créer un nouvel investissement classique

### 4. Créer la page `EvolutionPatrimoniale.tsx`

**Route** : `/contacts/:id/evolution`

**Sections :**
1. **Header** : Nom client + période analysée
2. **KPIs** : 
   - Patrimoine total actuel
   - Évolution nette (€)
   - Performance (%)
   - Nombre d'investissements
3. **Graphique** : Courbe d'évolution du patrimoine total (Recharts)
4. **Tableau détaillé** : Ligne par ligne avec Δ

**Structure :**
```tsx
interface EvolutionPatrimonialeProps {
  contactId: number;
}

// Récupérer :
// - Tous les investissements du contact
// - Toutes les valorisations associées
// - Calculer l'évolution
```

### 5. Composant `PatrimoineEvolutionChart.tsx`

Graphique avec Recharts affichant :
- Axe X : Dates des valorisations
- Axe Y : Montant total du patrimoine
- Ligne : Évolution dans le temps
- Points : Chaque import RIO

### 6. Composant `InvestissementsComparisonTable.tsx`

Tableau comparatif :
```
┌────────────────────────────────────────────────────────────┐
│ Produit          │ 2025      │ 2026      │ Évolution      │
├────────────────────────────────────────────────────────────┤
│ SCPI NCap        │ 50 000€   │ 52 000€   │ +2 000€ (+4%)  │
│ AV Spirica       │ 120 000€  │ 125 000€  │ +5 000€ (+4%)  │
│ PER Eres         │ 30 000€   │ Vendu     │ -30 000€       │
│ SCPI Primopierre │ -         │ 40 000€   │ +40 000€ 🆕    │
├────────────────────────────────────────────────────────────┤
│ TOTAL            │ 200 000€  │ 217 000€  │ +17 000€ (+9%) │
└────────────────────────────────────────────────────────────┘
```

**Logique "Vendu"** :
- Si un investissement a une valorisation en 2025 mais pas en 2026 → Afficher "Vendu"
- Garder l'historique visible

### 7. Bouton dans ContactDetail

Ajouter un bouton "📊 Évolution patrimoniale" dans la fiche contact qui ouvre la nouvelle page.

### 8. Gestion des imports multiples dans l'année

Si l'utilisateur importe plusieurs RIOs en 2026 :
- Stocker **chaque import** avec sa date précise
- Sur le graphique : afficher tous les points
- Dans le tableau : permettre de sélectionner 2 dates à comparer

**Sélecteur de période :**
```tsx
<Select>
  <option>Dernière année</option>
  <option>Depuis le début</option>
  <option>Période personnalisée</option>
</Select>
```

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

### ⚠️ IMPORTANT : Réutiliser la logique de détection des doublons

Voir `CONTEXTE_GLOBAL.md` section "LEÇONS CRITIQUES" :
- Fonction `findExistingInvestissement()` déjà implémentée
- Ne PAS recréer cette logique, l'utiliser !

Commence par l'étape 1 (migration SQL).
```

---

## Priorité
🔴 **Haute** - Valeur ajoutée majeure pour le suivi client annuel

## Durée estimée
2-3 sessions

---

## 📊 Schéma de données

```
investissements (table existante)
├── id
├── contact_id / foyer_id
├── type_produit
├── nom_produit
├── montant_initial  ← Montant à la souscription (ne change jamais)
└── ...

valorisations (nouvelle table)
├── id
├── investissement_id → investissements.id
├── date_valorisation  ← Date de l'import RIO
├── montant_valorise   ← Valeur à cette date
├── source             ← "RIO_IMPORT", "MANUEL", etc.
└── notes

Exemple :
- Investissement #1 : SCPI NCap, souscription 2023, montant_initial = 50 000€
- Valorisation #1 : inv_id=1, date=2025-01-15, montant=51 000€
- Valorisation #2 : inv_id=1, date=2026-01-10, montant=52 500€
→ Évolution 2025-2026 : +1 500€ (+2.9%)
```

---

## 🎯 Résultat attendu

Après implémentation, l'utilisateur pourra :
1. ✅ Importer un RIO chaque année sans écraser les données
2. ✅ Voir l'évolution du patrimoine sur une page dédiée
3. ✅ Comparer 2 dates précises (ex: 01/2025 vs 01/2026)
4. ✅ Identifier les investissements vendus
5. ✅ Suivre la performance globale du portefeuille client

---

## 💡 Améliorations futures (V2)

- Export PDF du rapport d'évolution
- Alertes si baisse > 10%
- Benchmark vs indices de référence
- Projection linéaire sur 5 ans
