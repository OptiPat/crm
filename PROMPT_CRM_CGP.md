# 🎯 PATRIMOINE CRM - Guide de Développement

> **⚠️ CE FICHIER EST LE POINT D'ENTRÉE PRINCIPAL**
> 
> Pour chaque nouveau module, utilise les prompts dédiés dans le dossier `prompts/`

---

## 📊 ÉTAT ACTUEL DU PROJET

**Date de mise à jour** : 15 janvier 2026  
**Version** : 0.1.0  
**Progression globale** : ~40% (Phase 1 complétée à 90%)

---

## ✅ CE QUI EST FAIT (Phase 1)

| Fonctionnalité | Status | Fichiers |
|----------------|--------|----------|
| Setup Tauri + React + Vite + Tailwind | ✅ | Configuration complète |
| Authentification (mot de passe + clé récupération) | ✅ | `auth/`, `SetupPassword`, `UnlockScreen` |
| Layout (Sidebar + Header) | ✅ | `components/layout/` |
| CRUD Contacts avec 5 catégories | ✅ | `Contacts.tsx`, `ContactForm.tsx` |
| Code couleur priorité (🔴🟠🟢) + tri | ✅ | `Contacts.tsx` |
| Import Excel/CSV avec mapping intelligent | ✅ | `ContactImport.tsx` |
| CRUD Foyers | ✅ | `Foyers.tsx`, `FoyerForm.tsx` |
| CRUD Partenaires | ✅ | `Partenaires.tsx`, `PartenaireForm.tsx` |
| Templates d'emails avec variables | ✅ | `TemplatesEmail.tsx`, `TemplateEmailForm.tsx` |
| Configuration SMTP + envoi emails | ✅ | `email/`, `SmtpConfigForm.tsx` |
| Alertes automatiques + page Suivi | ✅ | `Suivi.tsx`, `tauri-alertes.ts` |
| Upload de documents (basique) | ✅ | `DocumentUpload.tsx` |

### ⚠️ Partiellement fait
- **SQLCipher** : Implémenté mais désactivé (nécessite OpenSSL)
- **Import IMAP** : Non fait (seulement SMTP)

---

## 🔄 CE QUI RESTE À FAIRE

### Phase 2 - Productivité
| Module | Prompt dédié | Priorité |
|--------|--------------|----------|
| Dashboard avec KPIs et graphiques | `prompts/PROMPT_DASHBOARD.md` | 🔴 Haute |
| Import/lecture PDF avec OCR | `prompts/PROMPT_PDF_OCR.md` | 🟠 Moyenne |
| Génération PDF pré-remplis | `prompts/PROMPT_PDF_GENERATION.md` | 🟠 Moyenne |

### Phase 3 - Approfondissement
| Module | Prompt dédié | Priorité |
|--------|--------------|----------|
| Suivi des investissements (UI) | `prompts/PROMPT_INVESTISSEMENTS.md` | 🟠 Moyenne |
| Gestion documentaire (GED) | `prompts/PROMPT_GED.md` | 🟡 Basse |

### Phase 4 - Automatisation avancée
| Module | Prompt dédié | Priorité |
|--------|--------------|----------|
| Workflows multi-étapes | `prompts/PROMPT_WORKFLOWS.md` | 🟡 Basse |
| Intégration calendrier OAuth2 | `prompts/PROMPT_CALENDRIER.md` | 🟡 Basse |
| Comparaison RIO | À créer | 🟡 Basse |

---

## 📁 STRUCTURE DU PROJET

```
patrimoine-crm/
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs             # Point d'entrée + 42 commandes Tauri
│   │   ├── commands.rs         # CRUD contacts, foyers, partenaires, documents, alertes
│   │   ├── auth/               # Authentification (Argon2, clé récupération)
│   │   │   ├── mod.rs
│   │   │   └── commands.rs
│   │   ├── database/           # SQLite
│   │   │   ├── mod.rs
│   │   │   ├── models.rs       # Structs Rust
│   │   │   └── operations.rs   # Fonctions CRUD
│   │   └── email/              # SMTP
│   │       ├── mod.rs
│   │       ├── smtp_config.rs
│   │       ├── sender.rs
│   │       └── commands.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # Frontend React
│   ├── components/
│   │   ├── ui/                 # shadcn/ui (button, card, dialog, input, select...)
│   │   ├── layout/             # Sidebar, Header, Layout
│   │   ├── contacts/           # ContactForm, ContactDetail, ContactImport
│   │   ├── foyers/             # FoyerForm, FoyerDetail
│   │   ├── partenaires/        # PartenaireForm, PartenaireDetail
│   │   ├── documents/          # DocumentUpload
│   │   └── emails/             # SmtpConfigForm, TemplateEmailForm
│   ├── pages/
│   │   ├── Dashboard.tsx       # 🔄 À améliorer (KPIs + graphiques)
│   │   ├── Contacts.tsx        # ✅ Complet
│   │   ├── Foyers.tsx          # ✅ Complet
│   │   ├── Partenaires.tsx     # ✅ Complet
│   │   ├── Documents.tsx       # ⚠️ Basique
│   │   ├── TemplatesEmail.tsx  # ✅ Complet
│   │   ├── Suivi.tsx           # ✅ Complet
│   │   ├── Parametres.tsx      # ✅ Config SMTP
│   │   ├── SetupPassword.tsx   # ✅ Premier lancement
│   │   └── UnlockScreen.tsx    # ✅ Déverrouillage
│   ├── lib/
│   │   ├── api/                # Appels Tauri
│   │   │   ├── tauri-contacts.ts
│   │   │   ├── tauri-foyers.ts
│   │   │   ├── tauri-partenaires.ts
│   │   │   ├── tauri-documents.ts
│   │   │   ├── tauri-templates-email.ts
│   │   │   ├── tauri-alertes.ts
│   │   │   └── tauri-email.ts
│   │   ├── db/
│   │   │   └── schema.ts       # Types Drizzle (10 tables)
│   │   └── utils.ts
│   ├── styles/globals.css      # Tailwind + custom (Playfair, Plus Jakarta Sans)
│   ├── App.tsx                 # Router + Auth flow
│   └── main.tsx
├── drizzle/                    # Migrations SQL
├── prompts/                    # ✨ PROMPTS POUR CHAQUE MODULE
│   ├── CONTEXTE_GLOBAL.md
│   ├── PROMPT_DASHBOARD.md
│   ├── PROMPT_INVESTISSEMENTS.md
│   ├── PROMPT_PDF_OCR.md
│   ├── PROMPT_PDF_GENERATION.md
│   ├── PROMPT_GED.md
│   ├── PROMPT_WORKFLOWS.md
│   └── PROMPT_CALENDRIER.md
├── package.json
└── RAPPORT_IMPLEMENTATION.md   # Détails techniques
```

---

## 🗄️ BASE DE DONNÉES (10 tables)

| Table | Status | Description |
|-------|--------|-------------|
| `foyers` | ✅ | Groupes familiaux |
| `contacts` | ✅ | 5 catégories (CLIENT, PROSPECT_*, SUSPECT_*) |
| `partenaires` | ✅ | Fournisseurs de produits |
| `investissements` | ✅ Table, 🔄 UI | Produits souscrits |
| `documents` | ✅ | Fichiers attachés |
| `interactions` | ✅ Table | Historique des échanges |
| `emails` | ✅ | Emails envoyés |
| `templates_email` | ✅ | Modèles avec variables |
| `alertes` | ✅ | Alertes de suivi |
| `parametres` | ✅ | Configuration |

---

## 🎨 DESIGN

- **Thème** : Mode clair uniquement
- **Primaire** : Bleu profond `#1E3A5F`
- **Accent** : Or `#C9A227`
- **Fond** : Gris clair `#F8FAFC`
- **Titres** : Playfair Display (serif)
- **Corps** : Plus Jakarta Sans (sans-serif)
- **Icônes** : Lucide React
- **Composants** : shadcn/ui

---

## 📜 RÈGLES DE DÉVELOPPEMENT

### À suivre ABSOLUMENT

1. **UNE SEULE fonctionnalité à la fois** - Ne passe jamais à la suivante sans validation
2. **Attends ma validation** après chaque étape
3. **Code complet** - Pas de "..." ou raccourcis
4. **TypeScript strict** - Pas de `any`
5. **Messages UI en français** - Variables/fonctions en anglais
6. **Teste chaque fonctionnalité** avant de continuer

### Structure du code
- Composants réutilisables
- Pas de code dupliqué
- Commentaires sur parties complexes
- Types Drizzle dans `schema.ts`
- API Tauri dans `lib/api/`

---

## 🚀 COMMANDES UTILES

```bash
# Développement
npm run tauri:dev

# Si erreur LNK1318 (Windows)
npm run tauri:dev -- --release

# Build production
npm run tauri:build

# Migrations DB
npm run db:generate
npm run db:migrate
```

---

## 📝 COMMENT CONTINUER LE DÉVELOPPEMENT

### Option 1 : Continuer dans cette discussion
```
Je veux travailler sur le Dashboard.
Lis le prompt : prompts/PROMPT_DASHBOARD.md
Développe une fonctionnalité à la fois.
```

### Option 2 : Nouvelle discussion (recommandé pour gros modules)
```
Je continue le développement de Patrimoine CRM.

Contexte global : @prompts/CONTEXTE_GLOBAL.md
Structure du projet : @d:\crm\

Je veux travailler sur : [NOM DU MODULE]
Spécifications : @prompts/PROMPT_[MODULE].md

Développe une fonctionnalité à la fois.
Attends ma validation après chaque étape.
```

---

## 📋 ORDRE DE DÉVELOPPEMENT RECOMMANDÉ

1. **Dashboard** (PROMPT_DASHBOARD.md) - Pour avoir une vue d'ensemble
2. **Investissements** (PROMPT_INVESTISSEMENTS.md) - Core business
3. **PDF OCR** (PROMPT_PDF_OCR.md) - Productivité
4. **PDF Génération** (PROMPT_PDF_GENERATION.md) - Productivité
5. **GED** (PROMPT_GED.md) - Organisation
6. **Workflows** (PROMPT_WORKFLOWS.md) - Automatisation
7. **Calendrier** (PROMPT_CALENDRIER.md) - Intégration externe

---

## 📚 DOCUMENTATION

- `README.md` - Présentation du projet
- `GUIDE_UTILISATION.md` - Guide utilisateur
- `RAPPORT_IMPLEMENTATION.md` - Détails techniques Phase 1
- `INSTALLATION_OPENSSL.md` - Pour activer SQLCipher
- `prompts/CONTEXTE_GLOBAL.md` - Contexte pour nouvelles discussions

---

**🎯 Prochaine étape recommandée : Dashboard avec KPIs et graphiques**
