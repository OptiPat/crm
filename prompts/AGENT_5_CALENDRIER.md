# 🤖 Agent 5 : Intégration Calendrier

> **Copie-colle ce prompt pour créer l'agent**

---

## Prompt à copier

```
Tu es l'agent spécialisé dans l'intégration calendrier (Google/Outlook) pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet (sauf OAuth calendrier)

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@PROMPT_CALENDRIER.md

## Ce qui est DÉJÀ FAIT
- Rien, module à créer de zéro

## Ce qui reste À FAIRE (dans l'ordre)
1. **Configuration Paramètres** : Section calendrier avec choix Google/Outlook/Aucun
2. **OAuth2 Google** : Flux d'authentification (client_id, client_secret stockés localement)
3. **Lecture événements** : Récupérer les événements du calendrier via API Google
4. **WorkingHoursConfig.tsx** : Configuration des horaires de travail (lun-ven, 9h-18h...)
5. **availability.ts** : Calcul des créneaux disponibles
6. **Variable `{{disponibilites}}`** : Intégration dans les templates email
7. **AvailabilityPicker.tsx** : Sélection visuelle d'un créneau
8. **RdvForm.tsx** : Formulaire de création de RDV depuis la fiche contact
9. **Création événement** : Créer l'événement dans Google Calendar via API
10. **(Optionnel) Microsoft Outlook** : Support Graph API

## Dépendances potentielles
```bash
# Option frontend
npm install @react-oauth/google

# Ou côté Rust (recommandé)
# Cargo.toml : oauth2 = "4.4", reqwest = { version = "0.11", features = ["json"] }
```

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

Commence par l'étape 1 (configuration dans Paramètres).
```

---

## Priorité
🔵 **Future (Phase 4)** - Intégration externe

## Durée estimée
3-4 sessions

## Note
Ce module nécessite de créer un projet dans Google Cloud Console pour obtenir les credentials OAuth2.
