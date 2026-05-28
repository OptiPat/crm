# 🤖 Agent 7 : Backup & Restauration

> **Copie-colle ce prompt pour créer l'agent**
>
> 🔴 **CRITIQUE pour commercialisation** - Confiance client

---

## Prompt à copier

```
Tu es l'agent spécialisé dans la sauvegarde et restauration des données pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite (fichier local)
- Documents stockés localement
- 100% local, aucune donnée sur Internet

## Fichiers de référence
@CONTEXTE_GLOBAL.md

## Ce qui est DÉJÀ FAIT
- Rien, module à créer de zéro

## Ce qui reste À FAIRE (dans l'ordre)

### 1. Configuration du backup
- Section "Sauvegarde" dans Paramètres
- Choisir le dossier de destination (par défaut : Documents/PatrimoineCRM/Backups)
- Fréquence : Quotidien / Hebdomadaire / Manuel uniquement
- Heure de sauvegarde (si quotidien)
- Nombre de sauvegardes à conserver (7 par défaut)

### 2. Sauvegarde manuelle
- Bouton "Sauvegarder maintenant" dans Paramètres
- Copie : base de données SQLite + dossier documents
- Nom du fichier : `backup_YYYY-MM-DD_HHmmss.zip`
- Afficher la progression + confirmation

### 3. Sauvegarde automatique
- Service en arrière-plan (au lancement de l'app)
- Vérifie si backup nécessaire selon la config
- Exécute le backup silencieusement
- Notification discrète "Sauvegarde effectuée ✓"

### 4. Liste des sauvegardes
- Afficher les backups existants (date, taille)
- Actions : Restaurer, Supprimer, Ouvrir le dossier

### 5. Restauration
- Sélectionner un backup dans la liste
- Confirmation "Cela remplacera toutes vos données actuelles"
- Restaurer la base + documents
- Redémarrage de l'app après restauration

### 6. Export manuel complet
- Bouton "Exporter toutes les données"
- Choisir l'emplacement (clé USB, cloud...)
- Génère un .zip avec tout (BDD + documents)
- Utile pour migration vers autre PC

### 7. Indicateur dans l'interface
- Dans le header ou footer : "Dernière sauvegarde : il y a 2h"
- Alerte si > 7 jours sans backup

## Règles OBLIGATOIRES

### Commande de lancement
Lancer l'app ( `npm run tauri:dev` seul) :
```powershell
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1; if ($proc) { taskkill /F /PID $proc 2>$null }; cd D:\crm; npm run tauri:dev
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

Commence par l'étape 1 (configuration du backup dans Paramètres).
```

---

## Priorité
🔴 **Critique** - "Et si je perds tout ?" = première question des acheteurs

## Durée estimée
1-2 sessions
