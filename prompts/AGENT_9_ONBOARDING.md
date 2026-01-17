# 🤖 Agent 9 : Onboarding & Première Utilisation

> **Copie-colle ce prompt pour créer l'agent**
>
> 🟠 **Important** - Première impression = adoption

---

## Prompt à copier

```
Tu es l'agent spécialisé dans l'onboarding et l'expérience de première utilisation pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Utilisateurs cibles : CGP (Conseillers en Gestion de Patrimoine)
- Objectif : que l'utilisateur soit opérationnel en 5 minutes

## Fichiers de référence
@CONTEXTE_GLOBAL.md

## Ce qui est DÉJÀ FAIT
- ✅ Setup mot de passe au premier lancement
- ✅ Page Paramètres avec config SMTP

## Ce qui reste À FAIRE (dans l'ordre)

### 1. Assistant de configuration initiale
Après le setup mot de passe + activation licence, un wizard en 4 étapes :

**Étape 1 : Vos informations**
- Nom du CGP
- Cabinet / Société
- Email professionnel
- Téléphone
- Logo (optionnel)

**Étape 2 : Configuration email**
- Serveur SMTP (ou presets : Gmail, Outlook, OVH...)
- Test d'envoi

**Étape 3 : Vos partenaires**
- Liste des partenaires fréquents (SCPI, assureurs...)
- Possibilité de passer ("Je configurerai plus tard")

**Étape 4 : Import de données**
- "Importer un fichier Excel" ou "Commencer à vide"
- Lien vers le modèle Excel à télécharger

### 2. Écran de bienvenue (Dashboard vide)
Quand le dashboard est vide (0 contacts), afficher :
- Message de bienvenue personnalisé
- 3 actions suggérées :
  - "Ajouter votre premier contact"
  - "Importer vos contacts depuis Excel"
  - "Découvrir les fonctionnalités"

### 3. Données de démonstration (optionnel)
- Bouton "Charger des exemples" dans Paramètres
- Crée 5-10 contacts fictifs avec investissements
- Permet de voir l'app "remplie"
- Bouton "Supprimer les exemples"

### 4. Tooltips de découverte
Au premier accès de chaque page, afficher des bulles d'aide :
- "Ici vous pouvez filtrer par catégorie"
- "Cliquez pour voir le détail du contact"
- "Ce graphique montre votre répartition par produit"
Option "Ne plus afficher" + reset dans Paramètres

### 5. Page "Nouveautés" après mise à jour
- Détection de nouvelle version
- Modal "Quoi de neuf dans la version X.Y ?"
- Liste des nouvelles fonctionnalités avec captures
- Bouton "C'est compris !"

### 6. Centre d'aide intégré
- Bouton "?" dans le header
- Ouvre un panneau latéral avec :
  - FAQ (questions fréquentes)
  - Raccourcis clavier
  - Lien vers documentation en ligne
  - Bouton "Contacter le support"

## Design
- Wizard moderne avec progress bar
- Illustrations/icônes pour chaque étape
- Possibilité de passer des étapes ("Plus tard")
- Sauvegarde automatique entre étapes

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

Commence par l'étape 1 (assistant de configuration initiale).
```

---

## Priorité
🟠 **Important** - 70% des utilisateurs abandonnent un logiciel s'ils sont perdus au départ

## Durée estimée
1-2 sessions
