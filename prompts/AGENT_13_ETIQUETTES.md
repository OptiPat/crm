# 🏷️ Agent 13 : Étiquettes & Alertes Automatiques

> **Copie-colle ce prompt pour créer l'agent**
>
> ⚠️ **Module important** - Prévoir 3-4 sessions
>
> Ce module remplace et améliore le système d'alertes existant avec des étiquettes personnalisables par l'utilisateur.

---

## Prompt à copier

```
Tu es l'agent spécialisé dans le système d'Étiquettes pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet
- **IMPORTANT** : Ce CRM sera distribué en .exe à d'autres utilisateurs (CGP). Toute la configuration doit être accessible via l'interface graphique, pas dans le code.

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@prompts/PROMPT_DASHBOARD.md (pour le style des alertes existantes)

## Ce qui est DÉJÀ FAIT
- Configuration SMTP : `src-tauri/src/email/smtp_config.rs`
- Envoi d'email : `src-tauri/src/email/sender.rs`
- Templates d'email : Page + API (`tauri-templates-email.ts`)
- Alertes basiques : `src/pages/Suivi.tsx` + `tauri-alertes.ts`

## OBJECTIF
Créer un système d'étiquettes personnalisables qui :
1. S'affichent sur les fiches contacts (pills colorées stylisées)
2. Peuvent être attribuées manuellement OU automatiquement
3. Déclenchent optionnellement un email automatique après un délai
4. Sont entièrement configurables par l'utilisateur final via l'interface

## IMPORTANT : Utilisateur final
L'utilisateur du .exe (un CGP, pas un développeur) doit pouvoir :
- Créer ses propres étiquettes via l'interface
- Choisir les couleurs avec une palette visuelle
- Configurer les conditions via des menus déroulants (PAS de JSON visible)
- Modifier ou supprimer les étiquettes par défaut
- Tout faire sans toucher au code

## Ce qui reste À FAIRE (dans l'ordre strict)

### Phase 1 : Base de données

**Étape 1** : Migration SQL - Table `etiquettes`
```sql
CREATE TABLE etiquettes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  couleur TEXT NOT NULL DEFAULT '#3B82F6',
  icone TEXT,
  description TEXT,
  priorite INTEGER DEFAULT 0,
  
  -- Attribution automatique (optionnel, NULL = manuel uniquement)
  auto_condition_type TEXT,
  -- Types possibles :
  -- 'DELAI_SANS_CONTACT' : X jours depuis date_dernier_contact
  -- 'DATE_APPROCHE' : X jours avant un champ date
  -- 'PERIODE_ANNEE' : Entre mois X et mois Y
  -- 'TYPE_PRODUIT' : Client a un investissement de ce type
  -- NULL : Attribution manuelle uniquement
  
  auto_condition_config TEXT, -- JSON stockant les paramètres
  auto_categories TEXT,       -- JSON array des catégories concernées ["CLIENT", "PROSPECT_CLIENT"...]
  
  -- Action email (optionnel)
  email_template_id INTEGER REFERENCES templates_email(id) ON DELETE SET NULL,
  email_delai_jours INTEGER DEFAULT 0,
  email_actif INTEGER DEFAULT 0,
  
  -- Système
  is_default INTEGER DEFAULT 0, -- 1 = étiquette créée par défaut (modifiable/supprimable)
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

**Étape 2** : Migration SQL - Table `contact_etiquettes`
```sql
CREATE TABLE contact_etiquettes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  etiquette_id INTEGER NOT NULL REFERENCES etiquettes(id) ON DELETE CASCADE,
  date_attribution INTEGER DEFAULT (unixepoch()),
  attribue_par TEXT DEFAULT 'AUTO', -- 'AUTO' ou 'MANUEL'
  
  -- Suivi email
  email_envoye INTEGER DEFAULT 0,
  email_date_prevue INTEGER,
  email_date_envoi INTEGER,
  
  notes TEXT,
  UNIQUE(contact_id, etiquette_id)
);
```

### Phase 2 : Backend Rust

**Étape 3** : Models - Ajouter dans `models.rs`
```rust
// Etiquette
pub struct Etiquette {
    pub id: i64,
    pub nom: String,
    pub couleur: String,
    pub icone: Option<String>,
    pub description: Option<String>,
    pub priorite: i64,
    pub auto_condition_type: Option<String>,
    pub auto_condition_config: Option<String>,
    pub auto_categories: Option<String>,
    pub email_template_id: Option<i64>,
    pub email_delai_jours: i64,
    pub email_actif: bool,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

// ContactEtiquette (liaison)
pub struct ContactEtiquette {
    pub id: i64,
    pub contact_id: i64,
    pub etiquette_id: i64,
    pub date_attribution: i64,
    pub attribue_par: String,
    pub email_envoye: bool,
    pub email_date_prevue: Option<i64>,
    pub email_date_envoi: Option<i64>,
    pub notes: Option<String>,
}
```

**Étape 4** : Operations - CRUD étiquettes dans `operations.rs`
- get_all_etiquettes()
- get_etiquette_by_id(id)
- create_etiquette(new_etiquette)
- update_etiquette(id, etiquette)
- delete_etiquette(id)
- get_etiquettes_by_contact(contact_id)
- attribuer_etiquette(contact_id, etiquette_id, attribue_par)
- retirer_etiquette(contact_id, etiquette_id)
- get_contacts_by_etiquette(etiquette_id)

**Étape 5** : Commands - Exposer dans `commands.rs` et enregistrer dans `main.rs`

### Phase 3 : API TypeScript

**Étape 6** : Créer `src/lib/api/tauri-etiquettes.ts`
```typescript
export interface Etiquette {
  id: number;
  nom: string;
  couleur: string;
  icone: string | null;
  description: string | null;
  priorite: number;
  auto_condition_type: string | null;
  auto_condition_config: string | null;
  auto_categories: string | null;
  email_template_id: number | null;
  email_delai_jours: number;
  email_actif: boolean;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

// + fonctions invoke pour chaque commande
```

### Phase 4 : Interface - Gestion des étiquettes

**Étape 7** : Page `src/pages/Etiquettes.tsx`
- Liste des étiquettes avec leur style (pill coloré)
- Compteur de contacts par étiquette
- Boutons Modifier / Supprimer
- Bouton "+ Nouvelle étiquette"

**Étape 8** : Formulaire `src/components/etiquettes/EtiquetteForm.tsx`
- Dialog modal pour créer/éditer une étiquette
- Champ nom
- Palette de couleurs cliquable (pas de saisie hex obligatoire)
- Sélection icône (optionnel)
- Radio : Manuel / Automatique
- Si Automatique : menu déroulant pour le type de condition
  - "Le client n'a pas été contacté depuis X jours"
  - "La date de prochain suivi est dans X jours"
  - "La fin de démembrement est dans X jours"
  - "Nous sommes entre [mois] et [mois]"
- Checkboxes catégories concernées
- Section email : toggle actif, sélection template, délai en jours
- Prévisualisation du pill en temps réel

**Étape 9** : Composant `src/components/etiquettes/EtiquetteBadge.tsx`
```tsx
// Pill stylisé réutilisable
interface EtiquetteBadgeProps {
  etiquette: Etiquette;
  onRemove?: () => void; // Si on peut retirer l'étiquette
  size?: 'sm' | 'md';
}
```
Style : rounded-full, couleur de fond, texte blanc ou noir selon contraste, shadow-sm, hover effect

### Phase 5 : Affichage sur contacts

**Étape 10** : Modifier `src/components/contacts/ContactDetail.tsx`
- Afficher les étiquettes du contact sous le nom
- Bouton "+ Ajouter étiquette" qui ouvre un sélecteur

**Étape 11** : Composant `src/components/etiquettes/EtiquetteSelector.tsx`
- Popover avec liste des étiquettes disponibles
- Checkbox pour chaque étiquette
- Filtre/recherche si beaucoup d'étiquettes

### Phase 6 : Moteur automatique

**Étape 12** : Fonction `check_and_apply_auto_etiquettes()` dans operations.rs
- Parcourt toutes les étiquettes avec auto_condition_type != NULL
- Pour chaque étiquette, vérifie les contacts qui matchent la condition
- Attribue l'étiquette si pas déjà attribuée
- Planifie l'email si email_actif = 1

**Étape 13** : Fonction `send_scheduled_emails()` dans operations.rs
- Parcourt contact_etiquettes où email_envoye = 0 ET email_date_prevue <= now
- Récupère le template, remplace les variables
- Envoie l'email via EmailSender
- Marque email_envoye = 1

**Étape 14** : Intégration au lancement
- Appeler check_and_apply_auto_etiquettes() au démarrage de l'app
- Appeler send_scheduled_emails() au démarrage
- Optionnel : timer pour ré-exécuter toutes les heures

### Phase 7 : Étiquettes par défaut

**Étape 15** : Seed des étiquettes par défaut
Au premier lancement (si table etiquettes vide), créer :

| Nom | Couleur | Condition | Email |
|-----|---------|-----------|-------|
| Suivi > 1 an | #EF4444 (rouge) | DELAI_SANS_CONTACT, 365 jours, CLIENT | - |
| Suivi à planifier | #F97316 (orange) | DATE_APPROCHE, date_prochain_suivi, 30 jours | - |
| Fin démembrement | #3B82F6 (bleu) | DATE_APPROCHE, date_fin_demembrement, 180 jours | - |
| Déclaration IR | #8B5CF6 (violet) | PERIODE_ANNEE, avril-mai + TYPE_PRODUIT PER/FIP/PINEL... | - |
| RDV fin d'année | #10B981 (vert) | PERIODE_ANNEE, oct-nov + TYPE_PRODUIT PER/FIP/PINEL... | - |

Ces étiquettes ont is_default = 1 mais sont modifiables et supprimables par l'utilisateur.

### Phase 8 : Lien avec page Suivi

**Étape 16** : Modifier `src/pages/Suivi.tsx`
- Remplacer ou compléter les alertes actuelles par les étiquettes
- Afficher les contacts avec étiquettes actives
- Permettre de traiter/retirer une étiquette

## Design des étiquettes (IMPORTANT)

Les étiquettes doivent être **visuellement attrayantes** :

```tsx
// Exemple de style
<span 
  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full 
             text-sm font-medium shadow-sm
             hover:shadow-md transition-all cursor-default"
  style={{ 
    backgroundColor: etiquette.couleur,
    color: getContrastColor(etiquette.couleur) // blanc ou noir selon luminosité
  }}
>
  {etiquette.icone && <span>{etiquette.icone}</span>}
  <span>{etiquette.nom}</span>
</span>
```

Palette de couleurs suggérée (l'utilisateur peut choisir) :
- 🔴 #EF4444 - Rouge (urgent)
- 🟠 #F97316 - Orange (attention)
- 🟡 #EAB308 - Jaune (info)
- 🟢 #10B981 - Vert (ok)
- 🔵 #3B82F6 - Bleu (standard)
- 🟣 #8B5CF6 - Violet (fiscal)
- ⚫ #374151 - Gris foncé (neutre)
- 🩷 #EC4899 - Rose (spécial)

## Types de conditions automatiques

| Type | Label UI | Paramètres |
|------|----------|------------|
| `DELAI_SANS_CONTACT` | "Le client n'a pas été contacté depuis X jours" | jours: number |
| `DATE_APPROCHE` | "La date de [champ] est dans moins de X jours" | champ: string, jours_avant: number |
| `PERIODE_ANNEE` | "Nous sommes entre [mois] et [mois]" | mois_debut: number, mois_fin: number |
| `TYPE_PRODUIT` | "Le client détient un produit de type..." | types: string[] |

Champs disponibles pour DATE_APPROCHE :
- date_prochain_suivi
- date_fin_demembrement
- date_naissance (anniversaire)

Types de produits pour TYPE_PRODUIT :
- PER, FIP_FCPI, PINEL, MALRAUX, MONUMENT_HISTORIQUE, DEFICIT_FONCIER, G3F, SCPI_DEMEMBREMENT, NUE_PROPRIETE

## Règles OBLIGATOIRES

### Commande de lancement
TOUJOURS utiliser cette commande :
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
- Attendre ma validation après CHAQUE étape
- Interface intuitive pour utilisateurs non-développeurs

Commence par l'étape 1 (migration SQL table etiquettes).
```

---

## Priorité
🟠 **Moyenne-Haute** - Amélioration UX importante

## Durée estimée
3-4 sessions

## Dépendances
- ✅ Configuration SMTP (existe)
- ✅ Templates email (existe)
- ✅ Alertes basiques (existe, sera amélioré)

## Fichiers à créer/modifier

### Nouveaux fichiers
```
src/pages/Etiquettes.tsx
src/components/etiquettes/EtiquetteForm.tsx
src/components/etiquettes/EtiquetteBadge.tsx
src/components/etiquettes/EtiquetteSelector.tsx
src/lib/api/tauri-etiquettes.ts
drizzle/XXXX_add_etiquettes.sql
```

### Fichiers à modifier
```
src-tauri/src/database/models.rs
src-tauri/src/database/operations.rs
src-tauri/src/commands.rs
src-tauri/src/main.rs
src/components/contacts/ContactDetail.tsx
src/pages/Suivi.tsx
src/App.tsx (ajouter route)
src/components/layout/Sidebar.tsx (ajouter lien)
```
