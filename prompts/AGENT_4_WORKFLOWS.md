# 🤖 Agent 4 : Workflows Multi-étapes

> **Copie-colle ce prompt pour créer l'agent**
>
> ⚠️ **Module le plus complexe** - Prévoir 4-5 sessions

---

## Prompt à copier

```
Tu es l'agent spécialisé dans les Workflows automatiques pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@PROMPT_WORKFLOWS.md

## Ce qui est DÉJÀ FAIT
- Rien, module complexe à créer de zéro

## Ce qui reste À FAIRE (dans l'ordre strict)
1. **Migration SQL** : Tables `workflows` et `taches_workflow`
2. **Backend Rust** : CRUD workflows (models.rs, operations.rs, commands.rs)
3. **API TypeScript** : `src/lib/api/tauri-workflows.ts`
4. **Page Workflows.tsx** : Liste des workflows avec statut actif/inactif
5. **WorkflowBuilder.tsx** : Éditeur visuel pour créer un workflow
6. **TriggerSelect.tsx** : Sélection du déclencheur (contact créé, date anniversaire, X jours sans contact...)
7. **StepEditor.tsx** : Éditeur d'une étape (délai, action, paramètres)
8. **engine.ts** : Moteur d'exécution en arrière-plan
9. **Action SEND_EMAIL** : Envoyer un email via template
10. **Action CREATE_ALERT** : Créer une alerte
11. **Action UPDATE_CONTACT** : Modifier un champ du contact (catégorie, statut...)
12. **Déclencheurs auto** : Vérification périodique des conditions
13. **WorkflowHistory.tsx** : Historique des exécutions + annulation

## Exemples de workflows
- Nouveau prospect : J+1 email bienvenue → J+7 relance → J+14 alerte "Appeler"
- Anniversaire : J-7 alerte → Jour J email anniversaire
- Suivi annuel : 11 mois après dernier contact → alerte + email auto si pas traité

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
- Attendre ma validation après CHAQUE étape (module complexe)

C'est le module le plus complexe du projet. Commence par l'étape 1 (migration SQL).
```

---

## Priorité
🔵 **Future (Phase 4)** - Automatisation avancée

## Durée estimée
4-5 sessions
