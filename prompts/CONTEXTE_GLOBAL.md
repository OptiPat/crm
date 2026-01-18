# 📋 CONTEXTE GLOBAL - Patrimoine CRM

> **⚠️ DONNE CE FICHIER AU DÉBUT DE CHAQUE NOUVELLE DISCUSSION**
>
> **Dernière mise à jour : 17 janvier 2026**

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
| Graphiques | **Recharts** ✅ |
| PDF Lecture | **PDF.js (pdfjs-dist)** ✅ |
| OCR | **Tesseract.js** (à ajouter) |
| PDF Génération | **pdf-lib** (à ajouter) |

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
│   │   ├── documents/      # DocumentUpload, PatrimoineTriDialog, ExtractedDataPreview
│   │   ├── dashboard/      # StatCard, CategoryPieChart, ProductPieChart, etc.
│   │   ├── investissements/ # InvestissementForm
│   │   └── emails/         # SmtpConfigForm, TemplateEmailForm
│   ├── pages/              # Dashboard, Contacts, Foyers, Documents, Investissements, etc.
│   ├── lib/
│   │   ├── api/            # Appels Tauri (tauri-contacts.ts, tauri-alertes.ts...)
│   │   ├── db/             # schema.ts (Drizzle), types
│   │   ├── pdf/            # extractor.ts, parsers/ (RIO, generic)
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
| `investissements` | Produits souscrits + champ `origine` (MON_CONSEIL / EXISTANT_CLIENT) |
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
- `FIP_FCPI`, `FCPR`, `PER`, `PEA_CTO`, `LIVRET_EPARGNE`, `AUTRE`

### Origine des investissements (nouveau)
- `MON_CONSEIL` : Investissement placé par le CGP
- `EXISTANT_CLIENT` : Patrimoine existant du client (détecté via RIO)

---

## ✅ Ce qui est FAIT (75% du projet)

### Phase 1 - Fondations ✅
| Fonctionnalité | Status |
|----------------|--------|
| Setup Tauri + React + Vite + Tailwind | ✅ |
| Authentification (mot de passe, clé récupération) | ✅ |
| Layout (Sidebar, Header) | ✅ |
| CRUD Contacts avec catégorisation | ✅ |
| Code couleur priorité (🔴🟠🟢) + tri | ✅ |
| Import Excel/CSV avec mapping intelligent | ✅ |
| Fuzzy matching partenaires (Levenshtein) | ✅ |
| CRUD Foyers | ✅ |
| CRUD Partenaires (simplifié) | ✅ |
| Templates d'emails avec variables | ✅ |
| Configuration SMTP + envoi emails | ✅ |
| Alertes automatiques + page Suivi | ✅ |
| Upload de documents (basique) | ✅ |

### Phase 2 - Productivité ✅
| Fonctionnalité | Status |
|----------------|--------|
| Dashboard avec KPIs (5 cartes) | ✅ |
| Graphiques Recharts (catégories, produits, pipeline, mensuel) | ✅ |
| Aperçu alertes + actions rapides | ✅ |
| Module Investissements (CRUD complet) | ✅ |
| Filtres et recherche investissements | ✅ |

### Phase 3 - Import RIO ✅
| Fonctionnalité | Status |
|----------------|--------|
| Extraction texte PDF natif (PDF.js) | ✅ |
| Parsers RIO (standard, advanced, patrimoine) | ✅ |
| Parser générique (email, téléphone, nom) | ✅ |
| Preview des données extraites | ✅ |
| Tri patrimoine "Avec moi" / "À côté" | ✅ |
| Champ `origine` investissements | ✅ |
| Badge gris pour investissements "À côté" | ✅ |
| Mise à jour catégorie contact après RIO | ✅ |

---

## 🔄 Ce qui reste À FAIRE (25%)

### Phase 3 - Compléments RIO
| Fonctionnalité | Module | Priorité |
|----------------|--------|----------|
| Détection doublons investissements lors import RIO | `PROMPT_PDF_OCR.md` | 🔴 Haute |
| OCR Tesseract.js pour PDF scannés | `PROMPT_PDF_OCR.md` | 🟠 Moyenne |
| Détection couples dans RIO | `PROMPT_PDF_OCR.md` | 🟡 Basse |

### Phase 4 - Fonctionnalités avancées
| Fonctionnalité | Module | Priorité |
|----------------|--------|----------|
| Génération PDF pré-remplis | `PROMPT_PDF_GENERATION.md` | 🟠 Moyenne |
| GED complète (arborescence, navigation) | `PROMPT_GED.md` | 🟡 Basse |
| Workflows multi-étapes | `PROMPT_WORKFLOWS.md` | 🔵 Future |
| Intégration calendrier OAuth2 | `PROMPT_CALENDRIER.md` | 🔵 Future |

### Améliorations diverses (optionnelles)
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
# Développement (mode release pour éviter LNK1318)
npm run tauri:dev -- --release

# Build production
npm run tauri:build

# Si port 1420 déjà utilisé (PowerShell)
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1; if ($proc) { taskkill /F /PID $proc }

# Appliquer migration SQL
node apply-migration-origine.cjs
```

---

## 📊 Résumé état du projet

| Module | Status | Prompt |
|--------|--------|--------|
| Dashboard | ✅ 100% | `PROMPT_DASHBOARD.md` |
| Investissements | ✅ 100% | `PROMPT_INVESTISSEMENTS.md` |
| Import Excel Clients | ✅ 100% | (intégré dans Contacts) |
| **Contacts & Filleuls** | ✅ 100% | `AGENT_CONTACTS_FILLEULS.md` |
| Import RIO | ✅ 90% | `PROMPT_PDF_OCR.md` |
| Génération PDF | ❌ 0% | `PROMPT_PDF_GENERATION.md` |
| GED | ⚠️ 20% | `PROMPT_GED.md` |
| Sécurité & RGPD | ❌ 0% | `AGENT_6_SECURITE_RGPD.md` |
| Backup | ❌ 0% | `AGENT_7_BACKUP.md` |
| Licences | ❌ 0% | `AGENT_8_LICENCES.md` |
| Workflows | ❌ 0% | `PROMPT_WORKFLOWS.md` |
| Calendrier | ❌ 0% | `PROMPT_CALENDRIER.md` |

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
