# 📋 INDEX DES AGENTS - Patrimoine CRM

> **Dernière mise à jour : 31 janvier 2026**

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

### Phase 1 : Terminé

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| **12** | **Familles & Foyers v2** | `AGENT_12_FAMILLES_FOYERS.md` | 🟠 Important | 2-3 sessions | ✅ **Terminé** (regroupement dynamique) |
| **13** | **Étiquettes & Alertes** | `AGENT_13_ETIQUETTES.md` | 🟠 **Important** | 3-4 sessions | ✅ **Terminé** |

### Phase 2 : V1 Commercialisable (PRIORITAIRE)

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| 7 | Backup & Restauration | `AGENT_7_BACKUP.md` | 🔴 **Critique** | 1-2 sessions | ❌ À faire |
| 6 | Sécurité & RGPD | `AGENT_6_SECURITE_RGPD.md` | 🔴 **Critique** | 2-3 sessions | ❌ À faire |
| 9 | Onboarding (Wizard seul) | `AGENT_9_ONBOARDING.md` | 🟠 Important | 1 session | ✅ **Terminé** |

### Phase 3 : V2 (après lancement)

| Agent | Module | Fichier | Priorité | Durée | Status |
|-------|--------|---------|----------|-------|--------|
| 8 | Licences & Packaging | `AGENT_8_LICENCES.md` | 🔵 V2 | 2-3 sessions | ⏳ Reporté |
| 10 | Rapports & Exports | `AGENT_10_RAPPORTS.md` | 🔵 V2 | 2 sessions | ⏳ Reporté |
| 11 | Historique Patrimoine | `AGENT_11_HISTORIQUE_PATRIMOINE.md` | 🔵 V2 | 2-3 sessions | ⏳ Reporté |
| 4 | Workflows & Automatisation | `AGENT_4_WORKFLOWS.md` | 🟠 **Prochain** | V1.5→V4 | 🟡 Étiquettes ✅ → Pipelines à faire |
| 5 | Calendrier | `AGENT_5_CALENDRIER.md` | 🔵 V2 | 3-4 sessions | ⏳ Reporté |

### Reportés (en attente de nouveaux modèles)

| Agent | Module | Raison | Status |
|-------|--------|--------|--------|
| 1 | OCR & RIO | Nouveau modèle PDF prévu en 2026 | ⏸️ En pause |
| 2 | Génération PDF | Partenaire va créer une solution | ⏸️ En pause |
| 3 | GED | Nouveau modèle PDF prévu en 2026 | ⏸️ En pause |

---

## 🚀 Ordre recommandé pour la V1

```
✅ TERMINÉ
├── Agent Contacts/Filleuls           ✅
├── Agent Foyers/Familles             ✅
├── Agent 12 : Familles v2            ✅ (regroupement dynamique par nom)
└── Agent 13 : Étiquettes + Emails    ✅

PRIORITÉ 1 - Indispensable pour vendre
├── Agent 7 : Backup & Restauration   🔴 1-2 sessions
└── Agent 6 : Sécurité & RGPD         🔴 2-3 sessions

✅ TERMINÉ  
└── Agent 9 : Onboarding (Wizard)     ✅

🟡 PROCHAIN (très prochainement)
└── Agent 4 : Workflows & Automatisation (V1.5 Pipelines)

⏳ REPORTÉ EN V2
├── Agent 8 : Licences & Packaging
├── Agent 10 : Rapports & Exports
├── Agent 11 : Historique Patrimoine
└── Agent 5 : Calendrier

⏸️ EN PAUSE (nouveaux modèles attendus)
├── Agent 1 : OCR/RIO
├── Agent 2 : Génération PDF
└── Agent 3 : GED

TOTAL V1 : 4-6 sessions
```

---

## 🔧 Règles globales (incluses dans chaque agent)

### Commande de lancement (dev quotidien)
```powershell
cd D:\crm
.\dev.ps1
```

### Si erreur linker LNK1318 uniquement
```powershell
cd D:\crm
npm run tauri:dev:release
```

### Si erreur de compilation persistante (dernier recours)
```powershell
cd D:\crm\src-tauri
cargo clean
cd ..
npm run tauri:dev
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
│── TERMINÉ
├── AGENT_CONTACTS_FILLEULS.md   ← ✅ Terminé
├── AGENT_FOYERS_FAMILLES.md     ← ✅ Terminé
├── AGENT_12_FAMILLES_FOYERS.md  ← ✅ Terminé (regroupement dynamique)
├── AGENT_13_ETIQUETTES.md       ← ✅ Terminé
│
│── PRIORITÉ V1
├── AGENT_7_BACKUP.md            ← 🔴 Backup & Restauration
├── AGENT_6_SECURITE_RGPD.md     ← 🔴 Sécurité + RGPD
├── AGENT_9_ONBOARDING.md        ← ✅ Wizard de configuration (terminé)
│
│── PROCHAIN
├── AGENT_4_WORKFLOWS.md         ← 🟡 Workflows & Automatisation (V1.5→V4)
│
│── REPORTÉ V2
├── AGENT_8_LICENCES.md          ← Système de licence
├── AGENT_10_RAPPORTS.md         ← Exports Excel/PDF
├── AGENT_11_HISTORIQUE_PATRIMOINE.md ← Évolution patrimoniale
├── AGENT_5_CALENDRIER.md        ← Google/Outlook
│
│── EN PAUSE
├── AGENT_1_OCR_RIO.md           ← ⏸️ Nouveau modèle PDF attendu
├── AGENT_2_PDF_GENERATION.md    ← ⏸️ Partenaire crée solution
├── AGENT_3_GED.md               ← ⏸️ Nouveau modèle PDF attendu
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
| **Familles** | ✅ 100% (regroupement dynamique par nom) |
| Partenaires CRUD | ✅ 100% |
| Templates email | ✅ 100% |
| Alertes & Suivi | ✅ 100% (remplacé par système Étiquettes) |
| **Étiquettes personnalisables** | ✅ 100% (page dédiée, intégration contacts, emails auto) |
| **Prescripteurs** | ✅ 100% (arbre généalogique recommandations) |
| **Dates suivi indépendantes** | ✅ 100% (client vs filleul) |
| **Nettoyage données orphelines** | ✅ 100% (dans Paramètres) |
| **Affichage patrimoine foyer** | ✅ 100% (indicateur 🏠 + montant) |

---

## 💰 Checklist V1 commercialisable

### ✅ Terminé
- [x] Agent Contacts/Filleuls : Refonte onglets + Import MLM
- [x] Agent Foyers/Familles : Regroupement visuel + Détection import
- [x] Agent 12 : Familles v2 (regroupement dynamique)
- [x] Prescripteurs : Arbre des recommandations + Patrimoine apporté
- [x] Dates de suivi indépendantes : Client vs Filleul
- [x] Nettoyage données orphelines
- [x] Agent 13 : Étiquettes personnalisables + Emails automatiques
- [x] Affichage patrimoine foyer (indicateur 🏠)

### 🔴 À faire (prioritaire)
- [ ] **Agent 7 : Backup automatique**
- [ ] **Agent 6 : Verrouillage auto + RGPD**
- [x] ~~Agent 9 : Wizard de première utilisation~~ ✅

### 🟡 Prochain (très prochainement)
- [ ] **Agent 4 : Workflows V1.5** (Pipelines + bouton "Lancer workflow")

### ⏳ Reporté V2
- [ ] Agent 4 V2 : Webhooks + API locale pour n8n
- [ ] Agent 4 V2.5 : n8n + Mistral (newsletter IA)
- [ ] Agent 4 V3 : Historique mails Gmail/Outlook
- [ ] Agent 4 V4 : Rule Builder visuel
- [ ] Agent 8 : Système de licence
- [ ] Agent 10 : Exports Excel + PDF rapports
- [ ] Agent 11 : Historique patrimonial année après année
- [ ] Agent 5 : Calendrier Google/Outlook

### ⏸️ En pause
- [ ] Agent 1 : OCR/RIO (nouveau modèle PDF attendu)
- [ ] Agent 2 : Génération PDF (partenaire crée solution)
- [ ] Agent 3 : GED (nouveau modèle PDF attendu)
