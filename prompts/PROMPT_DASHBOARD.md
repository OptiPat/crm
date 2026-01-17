# 📊 MODULE : Dashboard avec KPIs et Graphiques

> **✅ MODULE TERMINÉ - 16 janvier 2026**
>
> **Fichiers créés :**
> - `src/pages/Dashboard.tsx`
> - `src/components/dashboard/StatCard.tsx`
> - `src/components/dashboard/CategoryPieChart.tsx`
> - `src/components/dashboard/ProductPieChart.tsx`
> - `src/components/dashboard/MonthlyChart.tsx`
> - `src/components/dashboard/PipelineChart.tsx`
> - `src/components/dashboard/AlertsPreview.tsx`
> - `src/lib/api/tauri-dashboard.ts`
>
> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Transformer la page Dashboard actuelle (vide ou basique) en un **tableau de bord complet** avec :
- KPIs en temps réel
- Graphiques interactifs
- Vue d'ensemble de l'activité

---

## 📦 Dépendances à installer

```bash
npm install recharts
```

---

## ✨ Fonctionnalités à implémenter

### 1. Cartes KPIs (en haut de page)

| KPI | Description | Calcul |
|-----|-------------|--------|
| **Clients** | Nombre de contacts catégorie CLIENT | `COUNT WHERE categorie = 'CLIENT'` |
| **Prospects** | PROSPECT_CLIENT + PROSPECT_FILLEUL | `COUNT WHERE categorie LIKE 'PROSPECT%'` |
| **Suspects** | SUSPECT_CLIENT + SUSPECT_FILLEUL | `COUNT WHERE categorie LIKE 'SUSPECT%'` |
| **Encours total** | Somme des investissements | `SUM(montant_initial)` |
| **À recontacter** | Alertes non traitées | `COUNT alertes WHERE traitee = false` |

**Design des cartes** :
- Icône à gauche (Users, TrendingUp, AlertCircle, Euro, Bell)
- Valeur principale en grand (font-serif, text-3xl)
- Label en dessous (text-muted)
- Couleur accent selon le type

---

### 2. Graphique : Répartition par catégorie (Camembert)

```typescript
// Données
const data = [
  { name: 'Clients', value: 45, color: '#10B981' },
  { name: 'Prospects clients', value: 30, color: '#3B82F6' },
  { name: 'Prospects filleuls', value: 15, color: '#06B6D4' },
  { name: 'Suspects clients', value: 8, color: '#F59E0B' },
  { name: 'Suspects filleuls', value: 2, color: '#F97316' },
];
```

**Composant Recharts** : `<PieChart>` avec `<Pie>` et `<Legend>`

---

### 3. Graphique : Répartition par type de produit (Camembert ou Barres)

```typescript
// Données
const data = [
  { name: 'SCPI', value: 120000, color: '#1E3A5F' },
  { name: 'Assurance-vie', value: 85000, color: '#C9A227' },
  { name: 'PER', value: 45000, color: '#10B981' },
  // ...
];
```

---

### 4. Graphique : Pipeline commercial (Funnel / Barres horizontales)

Visualiser le taux de conversion :
- Suspects → Prospects → Clients

```typescript
const data = [
  { stage: 'Suspects', count: 50 },
  { stage: 'Prospects', count: 30 },
  { stage: 'Clients', count: 15 },
];
```

---

### 5. Graphique : Évolution mensuelle (Courbe ou Barres)

Nombre de nouveaux clients par mois (sur les 12 derniers mois).

```typescript
const data = [
  { month: 'Jan', nouveaux: 3 },
  { month: 'Fév', nouveaux: 5 },
  { month: 'Mar', nouveaux: 2 },
  // ...
];
```

---

### 6. Liste : Contacts à recontacter (Quick view)

Afficher les 5 premiers contacts avec alerte non traitée :
- Nom + Prénom
- Catégorie (badge)
- Date du dernier contact
- Bouton "Voir"

---

## 🗂️ Fichiers à créer/modifier

### Nouveau : `src/components/dashboard/`
- `StatCard.tsx` - Carte KPI réutilisable
- `CategoryPieChart.tsx` - Camembert catégories
- `ProductPieChart.tsx` - Camembert produits
- `PipelineChart.tsx` - Funnel conversion
- `MonthlyChart.tsx` - Évolution mensuelle
- `AlertsPreview.tsx` - Aperçu alertes

### Modifier : `src/pages/Dashboard.tsx`
- Importer et afficher tous les composants
- Appeler les APIs pour récupérer les données

### Nouveau : `src/lib/api/tauri-dashboard.ts`
- `getDashboardStats()` - Récupérer tous les KPIs en une requête

### Modifier : Backend Rust
- `src-tauri/src/commands.rs` - Ajouter `get_dashboard_stats`
- `src-tauri/src/main.rs` - Enregistrer la commande

---

## 📐 Layout proposé

```
┌─────────────────────────────────────────────────────────────┐
│                    📊 Tableau de bord                        │
├─────────┬─────────┬─────────┬─────────┬─────────────────────┤
│ Clients │Prospects│ Suspects│ Encours │ À recontacter       │
│   45    │   45    │   10    │ 250 000€│     8               │
├─────────┴─────────┴─────────┴─────────┴─────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │   Par catégorie  │    │    Par produit   │               │
│  │   (Camembert)    │    │   (Camembert)    │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │           Évolution mensuelle            │               │
│  │              (Courbe)                    │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │     Pipeline     │    │  À recontacter   │               │
│  │    (Funnel)      │    │    (Liste)       │               │
│  └──────────────────┘    └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Style

- **Cartes** : `bg-white rounded-lg shadow-sm border p-6`
- **Titres sections** : `font-serif text-xl text-primary`
- **Valeurs KPI** : `font-serif text-3xl font-bold`
- **Graphiques** : Couleurs cohérentes avec le thème (#1E3A5F, #C9A227, #10B981...)

---

## 📝 Ordre de développement

1. **Étape 1** : Créer `StatCard.tsx` + afficher les 5 KPIs basiques
2. **Étape 2** : Ajouter `get_dashboard_stats` côté Rust
3. **Étape 3** : Créer le camembert catégories
4. **Étape 4** : Créer le camembert produits
5. **Étape 5** : Créer l'évolution mensuelle
6. **Étape 6** : Créer le pipeline
7. **Étape 7** : Créer l'aperçu des alertes

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [x] Les 5 KPIs s'affichent avec les bonnes valeurs
- [x] Les graphiques sont interactifs (hover, tooltips)
- [x] Le design est cohérent avec le reste de l'app
- [x] Pas d'erreur console
- [x] Chargement rapide (< 1 seconde)
