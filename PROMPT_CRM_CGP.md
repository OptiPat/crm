# 🎯 PROJET : CRM Desktop pour Conseillers en Gestion de Patrimoine (CGP)

> **⚠️ INSTRUCTIONS IMPORTANTES POUR LE DÉVELOPPEMENT**
> 
> 1. **Développe UNE SEULE fonctionnalité à la fois** - Ne passe pas à la suivante tant que la précédente n'est pas terminée et validée
> 2. **Attends ma validation** après chaque étape avant de continuer
> 3. **Teste chaque fonctionnalité** avant de passer à la suite
> 4. **Pose des questions** si quelque chose n'est pas clair plutôt que de faire des suppositions

---

## CONTEXTE & OBJECTIF

Tu vas m'aider à développer un **logiciel CRM desktop** destiné aux Conseillers en Gestion de Patrimoine (CGP) indépendants en France. Ce logiciel doit être :
- **100% local** : aucune donnée client ne transite par Internet (confidentialité absolue)
- **Professionnel et ergonomique** : design moderne, agréable, user-friendly
- **Performant** : capable de gérer jusqu'à 3 000 contacts par utilisateur
- **Autonome** : fonctionne hors ligne, base de données embarquée

Le logiciel sera commercialisé ultérieurement (licence annuelle par utilisateur), mais pour l'instant je développe une version pour mon usage personnel.

---

## 🛠️ STACK TECHNIQUE

### Architecture
| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Framework Desktop** | Tauri 2.x | Léger (~10 Mo), performant, Rust pour la sécurité |
| **Frontend** | React 18 + TypeScript | Écosystème riche, typage fort |
| **Build Tool** | Vite | Rapide, HMR instantané |
| **Styling** | Tailwind CSS 3 | Utilitaire, personnalisable, cohérent |
| **UI Components** | shadcn/ui | Composants accessibles, personnalisables |
| **Base de données** | SQLite + SQLCipher | Local, chiffré, performant |
| **ORM** | Drizzle ORM | Léger, type-safe, migrations simples |
| **Email** | Nodemailer | SMTP utilisateur uniquement |
| **OCR** | Tesseract.js | 100% local, pas d'API cloud |
| **PDF Lecture** | pdf-parse + pdf-lib | Extraction texte + manipulation |
| **PDF Génération** | pdf-lib | Remplissage de formulaires PDF |
| **Calendrier** | API Google Calendar / Microsoft Graph | OAuth2, lecture/écriture |
| **Icônes** | Lucide React | Cohérent, léger |
| **Graphiques** | Recharts | Simple, React-native |
| **État global** | Zustand | Léger, simple |
| **Validation** | Zod | Schémas typés |

### Distribution
- **Windows** : Installateur .exe (NSIS ou WiX via Tauri)
- **macOS** : Installateur .dmg

### Contraintes techniques
- Le **Main Process Tauri (Rust)** gère : base de données, fichiers, cryptographie, IPC
- Le **Renderer (React)** gère : interface utilisateur uniquement
- Communication via **Tauri Commands** (IPC sécurisé)
- Aucun appel réseau sauf : SMTP utilisateur, OAuth calendrier/email, mises à jour app

---

## 🗄️ ARCHITECTURE BASE DE DONNÉES

### Schéma relationnel (Drizzle ORM + SQLite)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Foyers      │────<│    Contacts     │────<│ Investissements │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Documents     │     │  Interactions   │     │   Partenaires   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │     Emails      │
                        └─────────────────┘
```

### Tables principales

#### `foyers` (Groupe familial)
- id, nom, date_creation, notes

#### `contacts` (Personnes physiques)
- id, foyer_id (nullable), categorie (enum), civilite, nom, prenom, email, telephone, adresse, code_postal, ville, date_naissance, profession, situation_familiale, source_lead, profil_risque_sri (1-7), date_dernier_contact, date_prochain_suivi, statut_suivi (enum), notes, created_at, updated_at

**Enum `categorie`** : CLIENT | PROSPECT_CLIENT | PROSPECT_FILLEUL | SUSPECT_CLIENT | SUSPECT_FILLEUL

**Enum `statut_suivi`** : ACTIF | EN_PAUSE | ARCHIVE

#### `investissements`
- id, contact_id, foyer_id (nullable = investissement commun), type_produit (enum), partenaire_id, nom_produit, montant_initial, date_souscription, date_fin_demembrement (nullable), versement_programme (boolean), montant_versement_programme, frequence_versement, reinvestissement_dividendes (boolean), notes, created_at, updated_at

**Enum `type_produit`** : IMMOBILIER | SCPI | SCPI_DEMEMBREMENT | ASSURANCE_VIE | FIP_FCPI | FCPR | PER | G3F | AUTRE

#### `partenaires` (Fournisseurs de produits)
- id, nom, type_produit, contact_commercial, email, telephone, notes

#### `documents`
- id, contact_id, foyer_id (nullable), type_document (enum), nom_fichier, chemin_fichier, date_document, hash_fichier, created_at

**Enum `type_document`** : RIO | FICHE_PROFIL_RISQUE | DER | RELEVE_COMPTE | RIB | AVIS_IMPOSITION | BULLETIN_SOUSCRIPTION | LETTRE_MISSION | RAPPORT_ADEQUATION | FICHE_CONSEIL | ANNEXE_DURABILITE | AUTRE

#### `interactions` (Historique des échanges)
- id, contact_id, type_interaction (enum), sujet, contenu, date_interaction, email_id (nullable), created_at

**Enum `type_interaction`** : EMAIL_ENVOYE | EMAIL_RECU | APPEL | RDV | NOTE

#### `emails`
- id, contact_id, interaction_id, message_id_smtp, sujet, corps, de, a, date_envoi, statut (enum)

**Enum `statut_email`** : BROUILLON | ENVOYE | ERREUR

#### `templates_email`
- id, nom, sujet, corps, categorie (enum), variables (JSON), created_at, updated_at

**Enum `categorie_template`** : SUIVI_ANNUEL | ARBITRAGE | FISCALITE | BIENVENUE | RELANCE | AUTRE

#### `workflows` (Séquences automatiques)
- id, nom, declencheur (JSON), etapes (JSON), actif (boolean), created_at

#### `taches_workflow`
- id, workflow_id, contact_id, etape_index, date_execution_prevue, statut (enum), created_at

#### `alertes`
- id, contact_id, type_alerte (enum), message, date_alerte, lue (boolean), traitee (boolean), created_at

**Enum `type_alerte`** : SUIVI_CLIENT_ANNUEL | SUIVI_PROSPECT_6MOIS | FIN_DEMEMBREMENT | ANNIVERSAIRE | WORKFLOW

#### `parametres`
- id, cle, valeur (JSON), updated_at

---

## ✨ FONCTIONNALITÉS PAR PRIORITÉ

### PHASE 1 (MVP) - Fondations

#### 1. Import des contacts (Excel/Google Sheets)
- Import fichier .xlsx, .csv
- Mapping intelligent des colonnes (détection automatique nom/prénom/email/téléphone)
- Prévisualisation avant import
- Détection des doublons (par email ou téléphone)
- Option : fusionner ou ignorer les doublons
- Format attendu : colonnes libres, le système s'adapte

#### 2. Gestion des contacts avec catégorisation
- Vue tableau principale avec colonnes personnalisables
- Filtres rapides par catégorie (Client, Prospect, Suspect...)
- Recherche globale instantanée
- Fiche contact détaillée en slide-over ou page dédiée
- Création/modification/suppression de contacts
- Liaison contacts ↔ foyer (couples, familles)
- Code couleur priorité :
  - 🔴 Rouge : Client sans contact depuis > 12 mois
  - 🟠 Orange : Suspect sans contact depuis > 6 mois
  - 🟢 Vert : Suivi à jour
- Tri automatique : contacts urgents en haut

#### 3. Templates d'emails + Connexion boîte mail
- Configuration SMTP de l'utilisateur (Gmail, Outlook, Yahoo, autre)
- OAuth2 pour Gmail et Outlook (pas de mot de passe stocké)
- Éditeur de templates avec variables : {{prenom}}, {{nom}}, {{lien_calendly}}, etc.
- Catégories de templates : Suivi annuel, Arbitrage, Fiscalité, Bienvenue, Relance
- Envoi d'email depuis la fiche contact
- Historique des emails envoyés rattaché au contact
- Import des emails reçus/envoyés depuis la boîte mail (IMAP) et rattachement automatique aux contacts par adresse email

#### 4. Alertes de suivi automatiques
- Pop-up au lancement : liste des contacts à recontacter
- Clients : alerte si > 12 mois sans contact
- Suspects : alerte si > 6 mois sans contact
- Page dédiée "Suivi" avec liste des alertes
- Actions rapides :
  - Envoyer un email (choix du template)
  - Reporter le suivi (3 mois, 6 mois, personnalisé)
  - Marquer comme traité
  - Arrêter le suivi pour ce contact

### PHASE 2 - Productivité

#### 5. Import/lecture de PDF (OCR)
- Import de PDF dans la fiche contact
- Détection automatique du type de document (RIO, Avis d'imposition, etc.)
- Extraction OCR des données (Tesseract.js, 100% local)
- Proposition de pré-remplissage de la fiche contact avec les données extraites
- Support des PDF scannés (images) et PDF texte
- Gestion des PDF multi-personnes (couples) : détection et proposition de rattachement à 2 contacts

Documents à lire :
- RIO (Recueil d'Informations et d'Objectifs)
- Fiche profil risque
- DER (Document d'Entrée en Relation)
- Relevés de compte
- RIB
- Avis d'imposition

#### 6. Génération de PDF pré-remplis
- Upload de PDF "modèles" (formulaires avec champs)
- Mapping des champs du PDF aux données du contact
- Génération d'un PDF rempli en 1 clic
- Support des PDF avec champs de formulaire (AcroForms)
- Support des PDF "image" : positionnement manuel du texte

Documents à générer :
- Bulletins de souscription SCPI (un modèle par SCPI)
- Fiche conseil
- Annexe durabilité
- Lettre de mission
- Rapport d'adéquation

#### 7. Tableau de bord avec KPIs
Page d'accueil avec :
- Nombre de clients / prospects / suspects
- Encours total sous gestion (somme des investissements)
- Taux de conversion (suspects → prospects → clients)
- Nombre de clients à rappeler
- Graphiques :
  - Évolution du patrimoine global (courbe temporelle)
  - Répartition par type de produit (camembert)
  - Pipeline commercial (funnel)
  - Nombre de nouveaux clients par mois (barres)

### PHASE 3 - Approfondissement

#### 8. Suivi des investissements
- Liste des investissements par contact
- Détails : type, partenaire, montant, date, options (VP, réinvestissement)
- Pour SCPI démembrées : date de fin de démembrement avec alerte automatique
- Vue consolidée par foyer (patrimoine commun + individuel)
- Export de la liste des investissements

#### 9. Gestion documentaire (GED)
- Arborescence automatique par contact :
  ```
  📁 [Nom Prénom]
     📁 Identité (CNI, justificatifs)
     📁 Fiscalité (avis d'imposition)
     📁 Investissements
        📁 [Nom du produit]
     📁 RIO
     📁 Correspondance
  ```
- Upload par drag & drop
- Prévisualisation des PDF/images
- Recherche dans les noms de fichiers

### PHASE 4 - Automatisation avancée

#### 10. Workflows multi-étapes
- Création de séquences automatiques
- Déclencheurs : nouveau contact, tag ajouté, date anniversaire, X jours sans contact
- Actions : envoyer email, créer alerte, changer catégorie, ajouter note
- Exemple : Nouveau prospect → J+1 email bienvenue → J+7 email relance → J+14 alerte appel

#### 11. Intégration Calendrier
- Connexion Google Agenda / Outlook Calendar (OAuth2)
- Lecture des disponibilités pour proposer des créneaux dans les emails
- Création d'événements RDV depuis le CRM
- Synchronisation bidirectionnelle

#### 12. Comparaison RIO
- Import de plusieurs RIO pour un même client (années différentes)
- Comparaison automatique : évolution patrimoine, revenus, charges
- Graphiques de progression
- Export du rapport de suivi

---

## 🎨 DESIGN & UX

### Principes directeurs
- **Clarté** : information hiérarchisée, pas de surcharge visuelle
- **Efficacité** : actions fréquentes accessibles en 1-2 clics
- **Cohérence** : mêmes patterns UI partout
- **Feedback** : confirmations visuelles des actions

### Thème visuel
- **Mode clair uniquement** (pour l'instant)
- Palette de couleurs :
  - Primaire : Bleu profond (#1E3A5F) - confiance, professionnalisme
  - Accent : Or/Doré (#C9A227) - patrimoine, luxe discret
  - Fond : Gris très clair (#F8FAFC)
  - Texte : Gris foncé (#1E293B)
  - Succès : Vert (#10B981)
  - Alerte : Orange (#F59E0B)
  - Erreur : Rouge (#EF4444)
- Typographie :
  - Titres : Playfair Display (serif, élégant)
  - Corps : Plus Jakarta Sans (sans-serif, lisible, moderne)
- Bordures arrondies (radius: 8px)
- Ombres subtiles pour la profondeur
- Icônes : Lucide, style outline

### Layout principal
```
┌─────────────────────────────────────────────────────────────────┐
│  Logo    [Recherche globale]                    [Notifications] │
├─────────┬───────────────────────────────────────────────────────┤
│         │                                                       │
│  Nav    │                     Contenu principal                 │
│         │                                                       │
│ 📊 Dash │                                                       │
│ 👥 Cont │                                                       │
│ 📁 Docs │                                                       │
│ 📧 Email│                                                       │
│ ⚙️ Param│                                                       │
│         │                                                       │
└─────────┴───────────────────────────────────────────────────────┘
```

### Interactions
- Slide-over pour édition rapide (fiche contact)
- Modales pour confirmations et actions critiques
- Toast notifications pour feedback
- Skeleton loaders pendant les chargements
- Animations subtiles (Framer Motion) : 
  - Apparition des cartes en cascade
  - Transitions de page fluides

---

## 🔒 SÉCURITÉ

### Chiffrement
- Base SQLite chiffrée avec **SQLCipher** (AES-256)
- Mot de passe défini au premier lancement
- Clé de récupération générée et à sauvegarder par l'utilisateur
- Documents stockés dans un dossier local, noms de fichiers hashés

### Authentification
- Mot de passe au lancement de l'application
- Verrouillage automatique après 15 min d'inactivité
- Option : déverrouillage biométrique (Windows Hello, Touch ID)

### Sauvegarde
- Sauvegarde automatique locale (copie du fichier .db chiffré)
- Export manuel vers dossier au choix (OneDrive, Google Drive, disque externe)
- Format de sauvegarde : fichier .zip chiffré contenant DB + documents

### RGPD
- Export complet des données d'un contact (JSON + PDF)
- Suppression définitive d'un contact (et tous documents liés)
- Aucune télémétrie, aucun tracking

---

## 📁 STRUCTURE DU PROJET

```
patrimoine-crm/
├── src-tauri/              # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # Commandes IPC
│   │   ├── database/       # SQLite + SQLCipher
│   │   ├── pdf/            # Lecture/génération PDF
│   │   ├── email/          # SMTP + IMAP
│   │   └── crypto/         # Chiffrement
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # Frontend React
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── layout/         # Sidebar, Header, etc.
│   │   ├── contacts/       # Composants contacts
│   │   ├── documents/      # Composants GED
│   │   ├── emails/         # Composants emails
│   │   └── dashboard/      # Composants tableau de bord
│   ├── pages/
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts          # Appels Tauri commands
│   │   ├── db.ts           # Types Drizzle
│   │   └── utils.ts
│   ├── stores/             # Zustand stores
│   ├── styles/
│   │   └── globals.css     # Tailwind + custom
│   ├── App.tsx
│   └── main.tsx
├── drizzle/                # Migrations DB
├── public/
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

---

## 🚀 INSTRUCTIONS DE DÉVELOPPEMENT

### Règles strictes à suivre

1. **UNE FONCTIONNALITÉ À LA FOIS** : Ne développe qu'une seule fonctionnalité par échange
2. **ATTENDS MA VALIDATION** : Après chaque étape, attends que je confirme que tout fonctionne avant de continuer
3. **CODE COMPLET** : Fournis toujours le code complet des fichiers, pas de "..." ou de raccourcis
4. **TESTS** : Explique-moi comment tester chaque fonctionnalité
5. **ERREURS** : Si une erreur survient, aide-moi à la corriger avant de continuer

### Pour chaque fonctionnalité, fournis :
1. Les fichiers à créer/modifier avec le code complet
2. Les commandes à exécuter (installation de packages, migrations)
3. Les instructions de test
4. Une confirmation de ce qu'on doit voir à l'écran

### Approche
- TypeScript strict, pas de `any`
- Composants réutilisables
- Pas de code dupliqué
- Commente les parties complexes
- Noms de variables/fonctions explicites en anglais
- Messages UI en français

---

## 📝 ORDRE DE DÉVELOPPEMENT

### ÉTAPE 0 : Setup initial
1. Initialisation du projet Tauri + React + Vite + TypeScript + Tailwind
2. Configuration de shadcn/ui
3. Configuration de SQLite + SQLCipher + Drizzle ORM
4. Écran de création de mot de passe (premier lancement)
5. Écran de déverrouillage (lancements suivants)
6. Layout principal avec navigation (sidebar + header)

### ÉTAPE 1 : Import des contacts
- Voir détails dans "PHASE 1 - Fonctionnalité 1"

### ÉTAPE 2 : Gestion des contacts
- Voir détails dans "PHASE 1 - Fonctionnalité 2"

### ÉTAPE 3 : Templates d'emails
- Voir détails dans "PHASE 1 - Fonctionnalité 3"

### ÉTAPE 4 : Alertes de suivi
- Voir détails dans "PHASE 1 - Fonctionnalité 4"

*(Et ainsi de suite...)*

---

## ⏳ COMMENÇONS

**Commence par l'ÉTAPE 0 : Setup initial**

Fournis-moi les instructions étape par étape pour :
1. Initialiser le projet Tauri + React + Vite + TypeScript + Tailwind

**ATTENDS MA VALIDATION avant de passer à la suite.**
