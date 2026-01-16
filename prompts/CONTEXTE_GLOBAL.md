# 📋 CONTEXTE GLOBAL - Patrimoine CRM

> **⚠️ DONNE CE FICHIER AU DÉBUT DE CHAQUE NOUVELLE DISCUSSION**

---

## 🎯 Projet

**Patrimoine CRM** est un logiciel desktop pour Conseillers en Gestion de Patrimoine (CGP).
- **100% local** : aucune donnée client ne transite par Internet
- **Jusqu'à 3 000 contacts** par utilisateur
- **Commercialisation prévue** : licence annuelle par utilisateur

---

## 🛠️ Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework Desktop | **Tauri 2.x** (Rust) |
| Frontend | **React 18 + TypeScript + Vite** |
| Styling | **Tailwind CSS 3 + shadcn/ui** |
| Base de données | **SQLite + Drizzle ORM** |
| Icônes | **Lucide React** |
| Graphiques | **Recharts** (à ajouter) |
| État global | **Zustand** (à ajouter si besoin) |
| Validation | **Zod** (à ajouter si besoin) |
| OCR | **Tesseract.js** (à ajouter) |
| PDF | **pdf-lib** (à ajouter) |

---

## 📁 Structure du projet

```
patrimoine-crm/
├── src-tauri/              # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs         # Point d'entrée + commandes Tauri
│   │   ├── commands.rs     # Commandes CRUD principales
│   │   ├── auth/           # Authentification (mot de passe, clé récupération)
│   │   ├── database/       # SQLite (models.rs, operations.rs)
│   │   └── email/          # SMTP (config, envoi)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # Frontend React
│   ├── components/
│   │   ├── ui/             # shadcn/ui (button, card, dialog, input, select...)
│   │   ├── layout/         # Sidebar, Header, Layout
│   │   ├── contacts/       # ContactForm, ContactDetail, ContactImport
│   │   ├── foyers/         # FoyerForm, FoyerDetail
│   │   ├── partenaires/    # PartenaireForm, PartenaireDetail
│   │   ├── documents/      # DocumentUpload
│   │   └── emails/         # SmtpConfigForm, TemplateEmailForm
│   ├── pages/              # Dashboard, Contacts, Foyers, Documents, etc.
│   ├── lib/
│   │   ├── api/            # Appels Tauri (tauri-contacts.ts, tauri-alertes.ts...)
│   │   ├── db/             # schema.ts (Drizzle), types
│   │   └── utils.ts
│   ├── styles/globals.css  # Tailwind + custom
│   ├── App.tsx             # Router + Auth flow
│   └── main.tsx
├── drizzle/                # Migrations SQL
└── package.json
```

---

## 🗄️ Base de données (10 tables)

| Table | Description |
|-------|-------------|
| `foyers` | Groupes familiaux |
| `contacts` | Personnes physiques (5 catégories) |
| `partenaires` | Fournisseurs de produits financiers |
| `investissements` | Produits souscrits par les clients |
| `documents` | Fichiers attachés aux contacts |
| `interactions` | Historique des échanges (emails, appels, RDV) |
| `emails` | Emails envoyés |
| `templates_email` | Modèles d'emails avec variables |
| `alertes` | Alertes de suivi automatiques |
| `parametres` | Configuration (SMTP, etc.) |

### Catégories de contacts
- `CLIENT`
- `PROSPECT_CLIENT`
- `PROSPECT_FILLEUL`
- `SUSPECT_CLIENT`
- `SUSPECT_FILLEUL`

### Types de produits
- `IMMOBILIER`, `SCPI`, `SCPI_DEMEMBREMENT`, `ASSURANCE_VIE`
- `FIP_FCPI`, `FCPR`, `PER`, `G3F`, `AUTRE`

---

## ✅ Ce qui est FAIT (Phase 1 - 90%)

| Fonctionnalité | Status |
|----------------|--------|
| Setup Tauri + React + Vite + Tailwind | ✅ |
| Authentification (mot de passe, clé récupération) | ✅ |
| Layout (Sidebar, Header) | ✅ |
| CRUD Contacts avec catégorisation | ✅ |
| Code couleur priorité (🔴🟠🟢) + tri | ✅ |
| Import Excel/CSV avec mapping intelligent | ✅ |
| CRUD Foyers | ✅ |
| CRUD Partenaires | ✅ |
| Templates d'emails avec variables | ✅ |
| Configuration SMTP + envoi emails | ✅ |
| Alertes automatiques + page Suivi | ✅ |
| Upload de documents (basique) | ✅ |

---

## 🔄 Ce qui reste À FAIRE

### Phase 2 - Productivité
| Fonctionnalité | Module |
|----------------|--------|
| Dashboard avec KPIs et graphiques | `PROMPT_DASHBOARD.md` |
| Import/lecture PDF avec OCR | `PROMPT_PDF_OCR.md` |
| Génération PDF pré-remplis | `PROMPT_PDF_GENERATION.md` |

### Phase 3 - Approfondissement
| Fonctionnalité | Module |
|----------------|--------|
| Suivi des investissements (UI) | `PROMPT_INVESTISSEMENTS.md` |
| Gestion documentaire GED | `PROMPT_GED.md` |

### Phase 4 - Automatisation
| Fonctionnalité | Module |
|----------------|--------|
| Workflows multi-étapes | `PROMPT_WORKFLOWS.md` |
| Intégration calendrier OAuth2 | `PROMPT_CALENDRIER.md` |
| Comparaison RIO | `PROMPT_RIO.md` |

### Améliorations diverses
- Import IMAP (emails reçus)
- Verrouillage auto après 15 min
- Déverrouillage biométrique
- SQLCipher (nécessite OpenSSL)

---

## 🎨 Design

- **Thème** : Mode clair uniquement
- **Couleurs** : Bleu profond (#1E3A5F), Or (#C9A227), Fond gris (#F8FAFC)
- **Typographies** : Playfair Display (titres), Plus Jakarta Sans (corps)
- **Composants** : shadcn/ui, Lucide React

---

## 📜 Règles de développement

1. **UNE SEULE fonctionnalité à la fois**
2. **Attendre validation** avant de passer à la suite
3. **Code complet** (pas de "..." ou raccourcis)
4. **TypeScript strict** (pas de `any`)
5. **Messages UI en français**
6. **Noms de variables/fonctions en anglais**

---

## 🚀 Commandes utiles

```bash
# Développement
npm run tauri:dev

# Build production
npm run tauri:build

# Si erreur LNK1318 (trop de symboles debug)
# Utiliser mode release
npm run tauri:dev -- --release
```

---

## 📝 Pour commencer une nouvelle discussion

Colle ce message :

```
Je continue le développement de Patrimoine CRM.

Voici le contexte global : @CONTEXTE_GLOBAL.md

Voici la structure actuelle du projet : @d:\crm\

Je veux travailler sur : [NOM DU MODULE]
Voici les spécifications : @PROMPT_[MODULE].md

Développe une fonctionnalité à la fois.
Attends ma validation après chaque étape.
```
