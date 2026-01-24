# 📋 INDEX DES AGENTS - Patrimoine CRM

> **Dernière mise à jour : 24 janvier 2026**

---

## 🎯 Comment utiliser ces agents

1. Ouvre le fichier `AGENT_X_xxx.md` correspondant
2. Copie le contenu dans la section "Prompt à copier"
3. Colle-le dans Cursor (ou ton outil AI)
4. L'agent a tout le contexte nécessaire

---

## 📊 Tableau récapitulatif

### Phase 0 : Refonte demandée

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| ✅ | Contacts & Filleuls | `AGENT_CONTACTS_FILLEULS.md` | 🔴 Haute | 3-4 sessions | ✅ **Terminé** |
| ✅ | Foyers & Familles | `AGENT_FOYERS_FAMILLES.md` | 🔴 Haute | 2-3 sessions | ✅ **Terminé** |

### Phase 1 : Finir les fonctionnalités

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| 1 | OCR & RIO | `AGENT_1_OCR_RIO.md` | 🔴 Haute | 1-2 sessions | ⚠️ 90% fait |
| 2 | Génération PDF | `AGENT_2_PDF_GENERATION.md` | 🟠 Moyenne | 2-3 sessions | ❌ À faire |
| 3 | GED | `AGENT_3_GED.md` | 🟡 Basse | 3-4 sessions | ⚠️ 20% fait |
| **12** | **Familles & Foyers v2** | `AGENT_12_FAMILLES_FOYERS.md` | 🟠 Important | 2-3 sessions | ❌ À faire |

### Phase 2 : Préparer la commercialisation

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| 11 | Historique Patrimoine | `AGENT_11_HISTORIQUE_PATRIMOINE.md` | 🔴 **Haute** | 2-3 sessions | ❌ À faire |
| 6 | Sécurité & RGPD | `AGENT_6_SECURITE_RGPD.md` | 🔴 **Critique** | 2-3 sessions | ❌ À faire |
| 7 | Backup & Restauration | `AGENT_7_BACKUP.md` | 🔴 **Critique** | 1-2 sessions | ❌ À faire |
| 8 | Licences & Packaging | `AGENT_8_LICENCES.md` | 🔴 **Critique** | 2-3 sessions | ❌ À faire |
| 9 | Onboarding | `AGENT_9_ONBOARDING.md` | 🟠 Important | 1-2 sessions | ❌ À faire |
| 10 | Rapports & Exports | `AGENT_10_RAPPORTS.md` | 🟠 Important | 2 sessions | ❌ À faire |

### Phase 3 : V2 (après lancement)

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| 4 | Workflows | `AGENT_4_WORKFLOWS.md` | 🔵 Future | 4-5 sessions | ❌ V2 |
| 5 | Calendrier | `AGENT_5_CALENDRIER.md` | 🔵 Future | 3-4 sessions | ❌ V2 |

---

## 🚀 Ordre recommandé pour la V1

```
ÉTAPE 0 - Refonte en cours
└── ✅ TERMINÉ

ÉTAPE 1 - Finir les fonctionnalités
├── Agent 1 : OCR/RIO (finir)         🔴 1-2 sessions
├── Agent 11 : Historique Patrimoine  🔴 2-3 sessions (NOUVEAU)
├── Agent 2 : Génération PDF          🟠 2-3 sessions
└── Agent 3 : GED                     🟡 3-4 sessions

ÉTAPE 2 - Sécurité (OBLIGATOIRE)
├── Agent 6 : Sécurité & RGPD         🔴 2-3 sessions
└── Agent 7 : Backup & Restauration   🔴 1-2 sessions

ÉTAPE 3 - Monétisation
└── Agent 8 : Licences & Packaging    🔴 2-3 sessions

ÉTAPE 4 - Polish
├── Agent 9 : Onboarding              🟠 1-2 sessions
└── Agent 10 : Rapports               🟠 2 sessions

TOTAL ESTIMÉ : 17-25 sessions pour V1 commercialisable
```

---

## 🔧 Règles globales (incluses dans chaque agent)

### Commande de lancement obligatoire
```powershell
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1; if ($proc) { taskkill /F /PID $proc 2>$null }; cd D:\crm; npm run tauri:dev -- --release
```

### Si erreur de compilation
```powershell
cd D:\crm\src-tauri
cargo clean
cd ..
npm run tauri:dev -- --release
```

### Règles de code
- TypeScript strict (pas de `any`)
- Messages UI en français
- Noms variables/fonctions en anglais
- UNE fonctionnalité à la fois
- Attendre validation après chaque étape

---

## 📁 Structure des fichiers prompts

```
prompts/
├── INDEX_AGENTS.md              ← CE FICHIER
├── CONTEXTE_GLOBAL.md           ← Contexte général du projet
│
│── PHASE 0 : REFONTE DEMANDÉE
├── AGENT_CONTACTS_FILLEULS.md   ← Onglets Clients/Filleuls + Import MLM ✅
├── AGENT_FOYERS_FAMILLES.md     ← Foyers intégrés aux contacts
│
│── PHASE 1 : FONCTIONNALITÉS
├── AGENT_1_OCR_RIO.md           ← Compléter import RIO
├── AGENT_11_HISTORIQUE_PATRIMOINE.md ← Évolution patrimoniale année/année
├── AGENT_12_FAMILLES_FOYERS.md  ← Hiérarchie Famille → Foyers (NOUVEAU)
├── AGENT_2_PDF_GENERATION.md    ← Générer bulletins souscription
├── AGENT_3_GED.md               ← Organisation documents
│
│── PHASE 2 : COMMERCIALISATION
├── AGENT_6_SECURITE_RGPD.md     ← Sécurité + conformité légale
├── AGENT_7_BACKUP.md            ← Sauvegarde automatique
├── AGENT_8_LICENCES.md          ← Système de licence + packaging
├── AGENT_9_ONBOARDING.md        ← Première utilisation
├── AGENT_10_RAPPORTS.md         ← Exports Excel/PDF
│
│── PHASE 3 : V2
├── AGENT_4_WORKFLOWS.md         ← Automatisation (V2)
├── AGENT_5_CALENDRIER.md        ← Google/Outlook (V2)
│
│── SPECS DÉTAILLÉES
├── PROMPT_PDF_OCR.md
├── PROMPT_PDF_GENERATION.md
├── PROMPT_GED.md
├── PROMPT_WORKFLOWS.md
├── PROMPT_CALENDRIER.md
├── PROMPT_DASHBOARD.md          ← ✅ Terminé
└── PROMPT_INVESTISSEMENTS.md    ← ✅ Terminé
```

---

## ✅ Modules terminés (pas besoin d'agent)

| Module | Status |
|--------|--------|
| Dashboard | ✅ 100% |
| Investissements | ✅ 100% |
| Import Excel | ✅ 100% |
| Authentification | ✅ 100% |
| Contacts CRUD | ✅ 100% |
| Foyers CRUD | ✅ 100% (intégré dans Contacts) |
| Partenaires CRUD | ✅ 100% |
| Templates email | ✅ 100% |
| Alertes & Suivi | ✅ 100% |
| **Prescripteurs** | ✅ 100% (arbre généalogique recommandations) |
| **Dates suivi indépendantes** | ✅ 100% (client vs filleul) |
| **Nettoyage données orphelines** | ✅ 100% (dans Paramètres) |

---

## 💰 Checklist V1 commercialisable

- [x] **Agent Contacts/Filleuls : Refonte onglets + Import MLM** ✅ Terminé
- [x] **Agent Foyers/Familles : Regroupement visuel + Détection import** ✅ Terminé
- [x] **Prescripteurs : Arbre des recommandations + Patrimoine apporté** ✅ Terminé (24/01/2026)
- [x] **Dates de suivi indépendantes : Client vs Filleul** ✅ Terminé (24/01/2026)
- [x] **Nettoyage données orphelines** ✅ Terminé (24/01/2026)
- [ ] Agent 11 : Historique patrimonial année après année
- [ ] Agent 1 : Détection doublons investissements RIO
- [ ] Agent 1 : OCR PDF scannés (Tesseract)
- [ ] Agent 2 : Génération PDF pré-remplis
- [ ] Agent 3 : GED avec arborescence
- [ ] **Agent 6 : Verrouillage auto + RGPD** 🔴
- [ ] **Agent 7 : Backup automatique** 🔴
- [ ] **Agent 8 : Système de licence** 🔴
- [ ] Agent 9 : Wizard de première utilisation
- [ ] Agent 10 : Exports Excel + PDF rapports
