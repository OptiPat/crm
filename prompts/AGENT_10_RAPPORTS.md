# 🤖 Agent 10 : Rapports & Exports

> **Copie-colle ce prompt pour créer l'agent**
>
> 🟠 **Important** - Valeur métier attendue par les CGP

---

## Prompt à copier

```
Tu es l'agent spécialisé dans les rapports et exports pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Les CGP ont besoin de générer des documents pour leurs clients et leur comptabilité

## Fichiers de référence
@CONTEXTE_GLOBAL.md

## Ce qui est DÉJÀ FAIT
- ✅ Dashboard avec statistiques
- ✅ Liste des investissements

## Ce qui reste À FAIRE (dans l'ordre)

### 1. Export Excel des contacts
- Bouton "Exporter" dans la page Contacts
- Filtres appliqués = export filtré
- Colonnes : Nom, Prénom, Email, Téléphone, Catégorie, Dernier contact, Encours
- Format : .xlsx

### 2. Export Excel des investissements
- Bouton "Exporter" dans la page Investissements
- Colonnes : Client, Type produit, Nom produit, Partenaire, Montant, Date souscription, Options
- Format : .xlsx

### 3. Rapport d'activité mensuel (PDF)
- Nouvelle page "Rapports" dans le menu
- Sélectionner mois/année
- Génère un PDF avec :
  - Nombre de nouveaux contacts
  - Nombre d'investissements réalisés
  - Montant total souscrit
  - Répartition par type de produit (graphique)
  - Liste des mouvements

### 4. Fiche récapitulative client (PDF)
- Bouton "Générer fiche" dans le détail contact
- PDF avec :
  - Informations du client
  - Liste des investissements
  - Total encours
  - Historique des interactions
- Design professionnel avec logo du CGP

### 5. Récapitulatif patrimoine foyer (PDF)
- Bouton "Générer récapitulatif" dans le détail foyer
- PDF avec :
  - Membres du foyer
  - Patrimoine consolidé
  - Répartition par type de produit (graphique camembert)
  - Détail par membre

### 6. Export comptable (commissions)
- Page "Rapports" → "Export comptable"
- Sélectionner période
- Génère Excel avec :
  - Investissement, Montant, Date, Partenaire
  - Colonne "Commission estimée" (% configurable par partenaire)
- Utile pour la déclaration de revenus du CGP

### 7. Statistiques annuelles
- Page "Rapports" → "Bilan annuel"
- Sélectionner année
- Affiche :
  - Évolution du nombre de clients
  - Évolution de l'encours
  - Top 5 partenaires
  - Top 5 types de produits
- Bouton "Exporter en PDF"

## Dépendances suggérées
```bash
npm install xlsx jspdf jspdf-autotable
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

Commence par l'étape 1 (export Excel des contacts).
```

---

## Priorité
🟠 **Important** - Les CGP attendent de pouvoir sortir des états

## Durée estimée
2 sessions
