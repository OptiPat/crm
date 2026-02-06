# 🤖 Agent 9 : Onboarding - Wizard de Configuration

> ✅ **TERMINÉ - 31 janvier 2026**
>
> Wizard de configuration initiale en 4 étapes

---

## Résumé de l'implémentation

### Fichiers créés/modifiés

| Fichier | Description |
|---------|-------------|
| `src/pages/SetupWizard.tsx` | Wizard 4 étapes complet |
| `src/lib/api/tauri-settings.ts` | API TypeScript pour les paramètres CGP |
| `src-tauri/src/database/models.rs` | Modèle `CgpConfig` |
| `src-tauri/src/database/operations.rs` | CRUD settings |
| `src-tauri/src/commands.rs` | Commandes Tauri settings |
| `src/App.tsx` | Intégration du wizard après login |

### Fonctionnalités implémentées

- **Étape 1** : Informations CGP (nom, prénom, cabinet, email, téléphone)
- **Étape 2** : Configuration SMTP (presets Gmail/Outlook/OVH + test connexion)
- **Étape 3** : Partenaires (populaires pré-remplis + ajout manuel)
- **Étape 4** : Import de données (Excel ou vide)
- Progress bar visuelle
- Boutons "Passer" pour étapes optionnelles
- Sauvegarde automatique entre étapes
- Reprise là où on s'est arrêté

---

## Prompt à copier (pour référence)

```
Tu es l'agent spécialisé dans l'onboarding pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Utilisateurs cibles : CGP (Conseillers en Gestion de Patrimoine)
- Objectif : que l'utilisateur soit opérationnel en 5 minutes

## Fichiers de référence
@CONTEXTE_GLOBAL.md

## Ce qui est DÉJÀ FAIT
- ✅ Setup mot de passe au premier lancement (SetupPassword.tsx)
- ✅ Page Paramètres avec config SMTP
- ✅ Page Partenaires avec CRUD complet
- ✅ Import Excel fonctionnel

## Ce qui reste À FAIRE (V1)

### Wizard de configuration initiale (PRIORITAIRE)

Après le setup mot de passe, afficher un wizard en 4 étapes :

**Étape 1 : Vos informations**
- Nom du CGP
- Cabinet / Société
- Email professionnel
- Téléphone
- Logo (optionnel)

**Étape 2 : Configuration email**
- Serveur SMTP (ou presets : Gmail, Outlook, OVH...)
- Test d'envoi
- Possibilité de passer ("Je configurerai plus tard")

**Étape 3 : Vos partenaires**
- Liste des partenaires fréquents (SCPI, assureurs...)
- Possibilité de passer ("Je configurerai plus tard")

**Étape 4 : Import de données**
- "Importer un fichier Excel" ou "Commencer à vide"
- Lien vers le modèle Excel à télécharger

### Implémentation technique

1. **Table settings** : Stocker les infos CGP (clé/valeur ou JSON)
2. **SetupWizard.tsx** : Composant wizard avec les 4 étapes
3. **App.tsx** : Afficher le wizard après SetupPassword si `wizard_completed = false`
4. **Paramètres** : Pouvoir modifier les infos CGP ultérieurement

### Design
- Wizard moderne avec progress bar (étapes 1-4)
- Illustrations/icônes pour chaque étape
- Chaque étape est skipable (sauf étape 4 qui doit faire un choix)
- Sauvegarde automatique entre étapes

## ⏳ POUR PLUS TARD (V2 - pas prioritaire)

Ces fonctionnalités sont reportées à une version ultérieure :

- ❌ Dashboard vide avec actions suggérées
- ❌ Données de démonstration ("Charger des exemples")
- ❌ Tooltips de découverte au premier accès
- ❌ Page "Nouveautés" après mise à jour
- ❌ Centre d'aide intégré (bouton "?")

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

Commence par créer la table settings et le composant SetupWizard.tsx.
```

---

## Priorité
🟠 **Important** - Guide l'utilisateur dès le premier lancement

## Durée estimée
1 session (wizard uniquement)

## Scope V1 vs V2

| Fonctionnalité | V1 | V2 |
|----------------|----|----|
| Wizard 4 étapes | ✅ | - |
| Dashboard vide amélioré | - | ⏳ |
| Données démo | - | ⏳ |
| Tooltips découverte | - | ⏳ |
| Page nouveautés | - | ⏳ |
| Centre d'aide | - | ⏳ |
