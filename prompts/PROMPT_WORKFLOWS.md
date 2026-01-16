# ⚡ MODULE : Workflows Multi-étapes (Automatisation)

> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Créer des **séquences automatiques** pour automatiser les tâches répétitives :
- Envoi d'emails programmés
- Création d'alertes
- Changement de statut/catégorie
- Etc.

---

## 📋 Exemples de workflows

### Workflow 1 : Nouveau prospect
1. **Déclencheur** : Contact créé avec catégorie `PROSPECT_CLIENT`
2. **J+1** : Envoyer email de bienvenue (template "Bienvenue")
3. **J+7** : Envoyer email de relance (template "Relance")
4. **J+14** : Créer alerte "Appeler le prospect"
5. **J+30** : Si pas de réponse → Changer catégorie en `SUSPECT_CLIENT`

### Workflow 2 : Anniversaire client
1. **Déclencheur** : Date anniversaire du client
2. **J-7** : Créer alerte "Anniversaire proche"
3. **Jour J** : Envoyer email d'anniversaire

### Workflow 3 : Suivi annuel
1. **Déclencheur** : 11 mois après le dernier contact
2. **Immédiat** : Créer alerte "Suivi annuel à prévoir"
3. **J+7** : Si pas traité → Envoyer email automatique

---

## 🗄️ Tables de base de données

### Table `workflows`
```sql
CREATE TABLE workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  description TEXT,
  declencheur JSON NOT NULL,  -- { type, conditions }
  etapes JSON NOT NULL,       -- [ { delai, action, params } ]
  actif INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

### Table `taches_workflow`
```sql
CREATE TABLE taches_workflow (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER REFERENCES workflows(id),
  contact_id INTEGER REFERENCES contacts(id),
  etape_index INTEGER NOT NULL,
  date_execution_prevue INTEGER NOT NULL,
  statut TEXT DEFAULT 'PENDING',  -- PENDING, COMPLETED, CANCELLED
  resultat TEXT,  -- Résultat de l'exécution
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## 📊 Structure des données

### Déclencheurs (triggers)

```typescript
type Trigger = 
  | { type: 'CONTACT_CREATED'; conditions?: { categorie?: string } }
  | { type: 'CONTACT_UPDATED'; conditions?: { field: string; value: any } }
  | { type: 'DAYS_SINCE_LAST_CONTACT'; days: number }
  | { type: 'DATE_FIELD'; field: 'date_naissance' | 'date_prochain_suivi'; offset?: number }
  | { type: 'MANUAL' };  // Déclenché manuellement
```

### Étapes (steps)

```typescript
interface WorkflowStep {
  delai: number;  // Jours après déclenchement (0 = immédiat)
  action: 'SEND_EMAIL' | 'CREATE_ALERT' | 'UPDATE_CONTACT' | 'ADD_NOTE';
  params: {
    // Pour SEND_EMAIL
    templateId?: number;
    
    // Pour CREATE_ALERT
    typeAlerte?: string;
    message?: string;
    
    // Pour UPDATE_CONTACT
    field?: string;
    value?: any;
    
    // Pour ADD_NOTE
    contenu?: string;
  };
  condition?: {
    // Condition pour exécuter cette étape
    // Ex: "Si l'étape précédente n'a pas eu de réponse"
    type: 'PREVIOUS_STEP_RESULT' | 'CONTACT_STATUS';
    expected: any;
  };
}
```

---

## ✨ Fonctionnalités à implémenter

### 1. Page de gestion des workflows

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Workflows automatiques                   [+ Nouveau]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 🔔 Nouveau prospect                           [Actif ✓] │
│  │ Déclencheur: Contact créé (PROSPECT_CLIENT)             │
│  │ Étapes: 4 actions sur 30 jours                          │
│  │                          [Modifier] [Désactiver] [🗑️]   │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 🎂 Anniversaire client                        [Actif ✓] │
│  │ Déclencheur: Date anniversaire                          │
│  │ Étapes: 2 actions                                       │
│  │                          [Modifier] [Désactiver] [🗑️]   │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Éditeur de workflow (builder)

Interface visuelle pour construire le workflow :

```
┌─────────────────────────────────────────────────────────────┐
│  📝 Éditer : Nouveau prospect                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DÉCLENCHEUR                                                │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 🎯 Contact créé                                          │
│  │    Catégorie = [PROSPECT_CLIENT ▼]                       │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│          │                                                  │
│          ▼                                                  │
│                                                             │
│  ÉTAPE 1 : J+1                                              │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 📧 Envoyer email                                         │
│  │    Template = [Bienvenue ▼]                              │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│          │                                                  │
│          ▼                                                  │
│                                                             │
│  ÉTAPE 2 : J+7                                              │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 📧 Envoyer email                                         │
│  │    Template = [Relance ▼]                                │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│          │                                                  │
│          ▼                                                  │
│                                                             │
│  ÉTAPE 3 : J+14                                             │
│  ┌─────────────────────────────────────────────────────────┐
│  │ 🔔 Créer alerte                                          │
│  │    Message = "Appeler le prospect"                       │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│     [+ Ajouter une étape]                                   │
│                                                             │
│           [Annuler]                    [Enregistrer]        │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Moteur d'exécution

Service qui s'exécute en arrière-plan :

```typescript
// À exécuter au lancement de l'app et toutes les heures
async function processWorkflows() {
  // 1. Récupérer les tâches planifiées à exécuter
  const tasks = await getTasksToExecute(Date.now());
  
  for (const task of tasks) {
    try {
      await executeTask(task);
      await markTaskCompleted(task.id);
    } catch (error) {
      await markTaskFailed(task.id, error.message);
    }
  }
  
  // 2. Vérifier les nouveaux déclencheurs
  await checkTriggers();
}

async function checkTriggers() {
  const workflows = await getActiveWorkflows();
  
  for (const workflow of workflows) {
    const contacts = await getContactsMatchingTrigger(workflow.declencheur);
    
    for (const contact of contacts) {
      // Vérifier si ce workflow n'est pas déjà en cours pour ce contact
      if (!await hasActiveWorkflow(workflow.id, contact.id)) {
        await startWorkflowForContact(workflow, contact);
      }
    }
  }
}
```

---

### 4. Historique et suivi

- Voir les workflows en cours pour chaque contact
- Voir l'historique des actions exécutées
- Pouvoir annuler un workflow en cours

---

## 🗂️ Fichiers à créer

```
src/pages/
└── Workflows.tsx           # Page principale

src/components/workflows/
├── WorkflowList.tsx        # Liste des workflows
├── WorkflowBuilder.tsx     # Éditeur visuel
├── TriggerSelect.tsx       # Sélection du déclencheur
├── StepEditor.tsx          # Éditeur d'étape
├── WorkflowHistory.tsx     # Historique d'exécution

src/lib/workflows/
├── engine.ts               # Moteur d'exécution
├── triggers.ts             # Logique des déclencheurs
├── actions.ts              # Exécution des actions
└── types.ts

src/lib/api/
└── tauri-workflows.ts      # API TypeScript
```

---

## 📝 Ordre de développement

1. **Étape 1** : Créer les tables `workflows` et `taches_workflow`
2. **Étape 2** : CRUD basique des workflows
3. **Étape 3** : Interface de liste des workflows
4. **Étape 4** : Éditeur de workflow (builder)
5. **Étape 5** : Moteur d'exécution (tâches planifiées)
6. **Étape 6** : Action "Envoyer email"
7. **Étape 7** : Action "Créer alerte"
8. **Étape 8** : Action "Modifier contact"
9. **Étape 9** : Déclencheurs automatiques
10. **Étape 10** : Historique et suivi

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [ ] Création de workflow fonctionne
- [ ] Les déclencheurs sont détectés
- [ ] Les étapes s'exécutent au bon moment
- [ ] Les emails sont envoyés automatiquement
- [ ] Les alertes sont créées automatiquement
- [ ] L'historique est visible
- [ ] On peut annuler un workflow en cours
