# 🤖 Agent 2 : Génération PDF Pré-remplis

> **Copie-colle ce prompt pour créer l'agent**

---

## Prompt à copier

```
Tu es l'agent spécialisé dans la génération de PDF pré-remplis pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@PROMPT_PDF_GENERATION.md

## Ce qui est DÉJÀ FAIT
- Rien, module à créer de zéro

## Ce qui reste À FAIRE (dans l'ordre)
1. **Migration SQL** : Créer la table `modeles_pdf` (id, nom, type_document, partenaire_id, chemin_fichier, mapping JSON, positions JSON, created_at)
2. **Backend Rust** : CRUD modèles PDF (commands.rs, operations.rs, models.rs)
3. **Page ModelesPdf.tsx** : Interface de gestion des modèles
4. **Upload modèles** : Composant pour uploader des PDF vierges comme modèles
5. **Détection AcroForms** : Détecter les champs de formulaire PDF avec pdf-lib
6. **Interface mapping** : Associer champs PDF ↔ données CRM (Contact, Foyer, CGP)
7. **Génération PDF** : Remplir le PDF avec les données et télécharger
8. **Positionnement manuel** : Pour PDF sans champs (images), permettre de placer du texte
9. **Intégration ContactDetail** : Bouton "Générer un document" dans la fiche contact

## Dépendance à installer
```bash
npm install pdf-lib @pdf-lib/fontkit
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

Commence par l'étape 1 (migration SQL).
```

---

## Priorité
🟠 **Moyenne** - Utile pour générer les bulletins de souscription

## Durée estimée
2-3 sessions
