# 🤖 Agent 4 : Workflows & Automatisation

> **Copie-colle ce prompt pour créer l'agent**
>
> ⚠️ **Module évolutif** - Développement en phases progressives

---

## Statut : 🟡 V1 Partiel (Étiquettes ✅) → V1.5 à faire

---

## Vision Globale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE WORKFLOWS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ÉTIQUETTES (V1 ✅)          PIPELINES (V1.5)           n8n (V2)          │
│   ┌─────────────┐            ┌─────────────────┐       ┌─────────────────┐  │
│   │ Suivi > 1an │──────────▶ │ À traiter       │       │ Orchestration   │  │
│   │ Exceltis Mai│            │ Mail envoyé     │◀─────▶│ externe         │  │
│   │ Fin démbr.  │            │ RDV pris        │       │ + Mistral IA    │  │
│   └─────────────┘            │ Terminé         │       └─────────────────┘  │
│                              └─────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prompt à copier

```
Tu es l'agent spécialisé dans les Workflows automatiques pour Patrimoine CRM.

## Contexte du projet
Patrimoine CRM est un logiciel desktop Tauri pour CGP (Conseillers en Gestion de Patrimoine).
- Stack : Tauri 2.x (Rust) + React 18 + TypeScript + Tailwind + shadcn/ui
- Base de données : SQLite
- 100% local, aucune donnée sur Internet
- Distribution en .exe pour les utilisateurs finaux

## Fichiers de référence
@CONTEXTE_GLOBAL.md
@AGENT_13_ETIQUETTES.md (système d'étiquettes déjà implémenté)

## Ce qui est DÉJÀ FAIT (V1 ✅)
- Système d'étiquettes complet (AGENT_13_ETIQUETTES)
- Tables : etiquettes, contact_etiquettes, etiquette_config
- Attribution auto/manuelle des étiquettes
- Envoi d'email manuel lié aux étiquettes
- Affichage des étiquettes sur les contacts

---

# PHASES DE DÉVELOPPEMENT

## V1.5 - Pipelines par étiquette (PROCHAINE ÉTAPE)

### Objectif
Chaque étiquette peut avoir un **pipeline de suivi** avec des statuts.

### Exemple concret : Étiquette "Exceltis Rendement Mai 2025"
```
┌─────────────────────────────────────────────────────────────────┐
│  🏷️ Exceltis Rendement Mai 2025                    [Lancer ▶️]  │
├─────────────────────────────────────────────────────────────────┤
│  👤 Client A           À traiter                                │
│  👤 Client B           À traiter                                │
│  👤 M. Durand          Mail envoyé (il y a 3j)                  │
│  👤 Mme C              RDV pris ✓                               │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline visuel
```
┌─────────────────────────────────────────────────────────────────────┐
│                    PIPELINE "Fin de démembrement"                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   À traiter     →    Mail envoyé    →    RDV pris    →    Terminé  │
│      ⬤                   ○                  ○               ○      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tables SQL à créer
```sql
-- Table des workflows (un par étiquette optionnellement)
CREATE TABLE workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    etiquette_id INTEGER REFERENCES etiquettes(id),
    actif BOOLEAN DEFAULT true,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Étapes du workflow
CREATE TABLE workflow_etapes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL,
    delai_jours INTEGER DEFAULT 0,
    type_action TEXT NOT NULL, -- 'SEND_EMAIL', 'CREATE_TASK', 'RELANCE'
    template_id INTEGER REFERENCES email_templates(id),
    description TEXT
);

-- Exécutions en cours (statut de chaque contact)
CREATE TABLE workflow_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER REFERENCES workflows(id),
    contact_id INTEGER REFERENCES contacts(id),
    etape_actuelle INTEGER DEFAULT 1,
    statut TEXT DEFAULT 'A_TRAITER', -- A_TRAITER, MAIL_ENVOYE, RELANCE_1, RDV_PRIS, TERMINE
    date_debut TEXT DEFAULT CURRENT_TIMESTAMP,
    date_maj TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### À implémenter V1.5
1. **Migration SQL** : 3 tables ci-dessus
2. **Backend Rust** : CRUD workflows + executions
3. **API TypeScript** : `tauri-workflows.ts`
4. **UI Étiquette** : Bouton "Lancer workflow" sur chaque étiquette
5. **WorkflowStatus.tsx** : Affiche le statut pipeline de chaque contact
6. **Actions manuelles** : Boutons pour changer le statut (Mail envoyé → RDV pris)

---

## V2 - Intégration n8n (Orchestration externe)

### Architecture
```
┌─────────────────┐      Webhook (HTTP POST)     ┌─────────────────┐
│                 │ ─────────────────────────────▶│                 │
│  Patrimoine CRM │                               │      n8n        │
│  localhost:1420 │                               │  localhost:5678 │
│                 │◀───────────────────────────── │                 │
└─────────────────┘      API Call (HTTP GET)      └─────────────────┘
```

### Ce que le CRM doit exposer

#### Webhooks sortants (CRM → n8n)
Le CRM notifie n8n quand :
- Une étiquette est attribuée à un contact
- Un email est envoyé
- Un contact est créé/modifié
- Un statut de workflow change

```rust
// Exemple : envoyer un webhook
async fn send_webhook(event: &str, payload: serde_json::Value) {
    let client = reqwest::Client::new();
    client.post("http://localhost:5678/webhook/patrimoine-crm")
        .json(&json!({
            "event": event,
            "data": payload,
            "timestamp": Utc::now()
        }))
        .send()
        .await;
}
```

#### API locale (n8n → CRM)
Endpoints HTTP sur un port local (ex: 3001) :
```
GET  /api/contacts                    → Liste des contacts
GET  /api/contacts/:id                → Détails d'un contact
GET  /api/contacts/:id/etiquettes     → Étiquettes d'un contact
POST /api/contacts/:id/etiquettes     → Ajouter une étiquette
GET  /api/etiquettes/:id/contacts     → Contacts d'une étiquette
PUT  /api/workflow-executions/:id     → Mettre à jour statut
```

### À implémenter V2
1. **Serveur HTTP local** : Actix-web ou Axum sur port 3001
2. **Webhooks sortants** : Notifier n8n sur événements clés
3. **Endpoints API** : CRUD contacts, étiquettes, workflows
4. **Config UI** : Page pour configurer l'URL n8n

---

## V2.5 - n8n + Mistral (IA)

### Cas d'usage
1. **Newsletter IA** : 
   - n8n récupère les contacts avec étiquette "Newsletter"
   - Mistral génère le contenu personnalisé
   - Le CRM envoie les emails

2. **Détection automatique** :
   - Email "Exceltis clôturé" arrive dans Gmail
   - n8n surveille Gmail, détecte le mail
   - n8n parse le nom du fonds
   - n8n appelle l'API CRM pour activer l'étiquette
   - Pipeline se déclenche automatiquement

### Flux complet
```
1. Email "Exceltis clôturé" → Gmail
2. n8n surveille Gmail, détecte le mail
3. n8n parse le nom du fonds ("Exceltis Rendement Mai 2025")
4. n8n appelle l'API du CRM : "Active l'étiquette X pour tous les contacts concernés"
5. Le CRM déclenche le pipeline automatiquement
6. Mistral personnalise chaque email
7. Emails envoyés
```

---

## V3 - Historique Mails Gmail/Outlook

### Objectif
Voir l'historique des échanges email avec chaque client.

### Spécifications
- **Lecture seule** : Pas de stockage automatique
- **OAuth** : Connexion Gmail/Outlook API
- **Liaison** : Par email du contact
- **Export** : PDF à la demande

### UI
```
┌─────────────────────────────────────────────────────────────────┐
│  📧 Historique emails - Client A                                │
├─────────────────────────────────────────────────────────────────┤
│  📤 15/01/2026 - Confirmation RDV                               │
│  📥 14/01/2026 - RE: Proposition SCPI                           │
│  📤 10/01/2026 - Proposition SCPI Primovie                      │
│  📥 05/01/2026 - Demande d'information                          │
│                                                                 │
│                                    [Exporter PDF] [Actualiser]  │
└─────────────────────────────────────────────────────────────────┘
```

### À implémenter V3
1. **OAuth Google/Microsoft** : Connexion aux comptes
2. **API Gmail/Outlook** : Recherche par email contact
3. **MailHistory.tsx** : Affichage dans fiche contact
4. **Export PDF** : Générer un PDF de l'historique

---

## V4 - Rule Builder (Configurateur dynamique)

### Objectif
Créer des règles d'attribution automatique sans coder.

### UI Rule Builder
```
┌─────────────────────────────────────────────────────────────────┐
│  Nouvelle règle d'attribution automatique                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SI  [Dernier contact]  [>]  [365 jours]                        │
│  ET  [Catégorie]        [=]  [CLIENT]                           │
│  ET  [A investissement] [de type] [SCPI]                        │
│                                                                 │
│  ALORS attribuer étiquette [Suivi SCPI urgent]                  │
│                                                                 │
│                                          [Tester] [Enregistrer] │
└─────────────────────────────────────────────────────────────────┘
```

### Conditions supportées
- Champs contact : catégorie, date dernier contact, âge
- Champs investissement : type, date fin, montant
- Opérateurs : =, !=, >, <, contient, est vide

---

## Règles OBLIGATOIRES

### Commande de lancement
Lancer l'app :
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
- Développement incrémental par phase

Commence par la phase V1.5 (Pipelines par étiquette).
```

---

## Roadmap

| Phase | Fonctionnalité | Effort | Statut |
|-------|----------------|--------|--------|
| **V1** | Étiquettes + email auto | - | ✅ Fait |
| **V1.5** | Pipelines + bouton "Lancer workflow" | 1-2 sessions | 🟡 À faire |
| **V2** | Webhooks + API locale pour n8n | 2-3 sessions | ⬜ Planifié |
| **V2.5** | n8n + Mistral (newsletter IA) | 1-2 sessions | ⬜ Planifié |
| **V3** | Historique mails Gmail/Outlook | 2-3 sessions | ⬜ Planifié |
| **V4** | Rule Builder visuel | 3-4 sessions | ⬜ Futur |

---

## Dépendances

- **V1.5** : Requiert AGENT_13_ETIQUETTES ✅
- **V2** : Requiert V1.5
- **V2.5** : Requiert V2 + n8n installé localement
- **V3** : Indépendant (OAuth Google/Microsoft)
- **V4** : Requiert V1.5 (étend le système d'étiquettes)

---

## 🔧 Configuration n8n existante

> **n8n local** : `http://localhost:5678`
> **Webhook callback** : `http://localhost:5678/rest/oauth2-credential/callback`

### Credentials disponibles (testés ✅)

| Credential | Type | Usage CRM |
|------------|------|-----------|
| **Google OAuth2** | OAuth2 | Gmail (lecture/envoi), Calendar (détection RDV), Contacts |
| **SMTP Gmail** | SMTP (port 465 SSL) | Envoi d'emails via n8n |
| **Mistral API** | Header Auth (Bearer) | Personnalisation IA des emails, newsletters |

### Scopes Google disponibles

```
gmail.readonly      → Historique des mails (V3)
gmail.compose       → Envoyer des mails via n8n
gmail.modify        → Marquer comme lu, archiver
calendar.readonly   → Détecter les RDV pris (V1.5 pipelines)
contacts.readonly   → Sync contacts Google (bonus)
```

### Notifications

- ❌ Pas de Telegram
- ✅ Par email (SMTP Gmail)
- ✅ Dans le CRM (alertes/notifications internes)

### Exemple de workflow n8n pour V2

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW : "Exceltis clôturé → Activer étiquette"                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Gmail Trigger]  →  [Filter: sujet contient "Exceltis"]  →                │
│                                                                             │
│  [HTTP Request: GET CRM/api/etiquettes?nom=Exceltis...]  →                 │
│                                                                             │
│  [HTTP Request: POST CRM/api/contacts/:id/etiquettes]  →                   │
│                                                                             │
│  [Mistral: Personnaliser email]  →  [Gmail Send]                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Exemple de workflow n8n pour Newsletter IA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW : "Newsletter mensuelle"                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Schedule Trigger: 1er du mois]  →                                        │
│                                                                             │
│  [HTTP Request: GET CRM/api/contacts?etiquette=Newsletter]  →              │
│                                                                             │
│  [Loop sur chaque contact]  →                                              │
│                                                                             │
│  [Mistral: Générer contenu personnalisé selon profil]  →                   │
│                                                                             │
│  [Gmail Send via SMTP]  →                                                  │
│                                                                             │
│  [HTTP Request: POST CRM/api/contacts/:id/historique (mail envoyé)]        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Référence : Workflows n8n existants

> L'utilisateur a déjà créé 3 workflows n8n documentés dans `D:\n8n-docs\`.
> Ces workflows servent de **référence de style** pour les futurs workflows CRM.

### Patterns à réutiliser

| Pattern | Exemple existant | Application CRM |
|---------|------------------|-----------------|
| **Schedule Trigger 8h00** | Anniversaires, Alternance | Vérification étiquettes quotidienne |
| **HTTP Request > Node natif** | Gmail API, Google Contacts | API locale du CRM |
| **Code JavaScript filtre** | Filtrer anniversaires du jour | Filtrer contacts par étiquette |
| **Mistral + temperature 1.0** | Messages variés | Emails personnalisés |
| **Prompt structuré** | RÈGLES + INTERDITS | Templates emails CRM |

### Structure de prompt Mistral (style utilisateur)

```javascript
// Exemple de prompt bien structuré (style utilisateur)
const systemPrompt = `Tu es conseiller en gestion de patrimoine.

TON : Professionnel, chaleureux, personnalisé.

RÈGLE REFORMULATION : Ne copie jamais mot pour mot. Varie les formulations.

FORMATAGE :
- Utilise le prénom du client
- 2-3 phrases maximum
- Termine par une invitation à l'action

INTERDITS :
- Pas de jargon technique excessif
- Pas de promesses de rendement
- Pas de signature (ajoutée automatiquement)`;

const userPrompt = `Email pour ${contact.prenom} ${contact.nom}

CONTEXTE :
- Étiquette : ${etiquette.nom}
- Dernier contact : ${contact.derniere_interaction}
- Investissements : ${contact.patrimoine_avec_moi}€

GÉNÈRE L'EMAIL :`;
```

### Workflow existant 1 : Anniversaires (référence)

```
[Schedule Trigger 8h00]
    ↓
[Google Contacts API - HTTP Request]
    ↓
[Code JS - Filtrer anniversaires du jour + injecter angles/intros aléatoires]
    ↓
[Mistral - temperature: 1.0, model: mistral-small-latest]
    ↓
[Telegram - Notification]
```

**Points clés :**
- Angles et intros aléatoires pour varier les messages
- Prompt avec directives claires et INTERDITS
- Temperature 1.0 pour créativité maximale

### Workflow existant 2 : Planning hebdo (référence)

```
[Multi-Trigger : Dimanche 8h + Mardi 8h]
    ↓
[Google Sheet via HTTP Request (export CSV)]
    ↓
[Gmail API - Récupérer newsletter]
    ↓
[IF - Dimanche ou Mardi ?]
    ↓                    ↓
[Code JS Dimanche]    [Code JS Mardi]
    ↓                    ↓
[Mistral]             [Mistral]
    ↓                    ↓
[Telegram]            [Telegram]
```

**Points clés :**
- Multi-trigger avec IF pour branching
- Parsing CSV en JavaScript (fonction parseCSV réutilisable)
- Calculs de dates avancés (semaine paire/impaire, Nème jour du mois)
- Pool de citations avec sélection pseudo-aléatoire par semaine

### Workflow existant 3 : Réponse alternance (référence)

```
[Schedule Trigger 8h00]
    ↓
[Gmail API - Emails non lus avec mots-clés dans objet]
    ↓
[Code JS - Extraire IDs]
    ↓
[Gmail API - Contenu complet]
    ↓
[Code JS - Extraire prénom, générer réponse RFC 2822, encoder base64]
    ↓
[Gmail API - Créer brouillon]
    ↓
[Gmail API - Marquer comme lu]
```

**Points clés :**
- Template fixe (sans IA) pour réponses standardisées
- Création de brouillons (pas d'envoi auto) pour validation humaine
- Encodage base64 URL-safe pour Gmail API
- Marquage "lu" pour éviter doublons

### Code JavaScript réutilisable

```javascript
// Parser CSV (workflow Planning)
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f)) lines.push(currentLine);
        currentLine = [];
        currentField = '';
      }
    } else {
      currentField += char;
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f)) lines.push(currentLine);
  }
  return lines;
}

// Sélection pseudo-aléatoire par semaine (workflow Planning)
function selectRandomByWeek(items, weekNum, count) {
  const shuffled = [...items];
  let seed = weekNum * 7;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
```

---

## 📰 Référence : Newsletter "Patrimoine Sarcasme"

> L'utilisateur utilise un GEM Gemini nommé "Patrimoine Sarcasme" pour générer des newsletters.
> Cette configuration sert de **référence de style** pour les newsletters automatisées via n8n + Mistral.

### Prompt système (style utilisateur)

```javascript
const systemPrompt = `AGIS en tant qu'expert en communication financière et Conseiller en Gestion de Patrimoine (CGP).
TON NOM est "Patrimoine Sarcasme".

TON OBJECTIF est de transformer l'actualité financière professionnelle en une newsletter mensuelle engageante pour des clients particuliers.

TA MISSION est de :
1. Analyser les événements financiers (taux, fiscalité, marchés)
2. Synthétiser uniquement l'information ayant un IMPACT CONCRET pour un épargnant particulier
3. Expliquer avec clarté absolue et pédagogie maximale (métaphores simples)
4. Rédiger avec un style professionnel agrémenté d'HUMOUR DÉCALÉ, FIN et SARCASTIQUE

CONTRAINTES OBLIGATOIRES :
- TON : Professionnel, informel, bienveillant, avec une légère ironie
- FORMAT : Objet accrocheur, Introduction, 2-3 points clés, Conclusion/CTA
- LONGUEUR : 300-500 mots (hors Titre/Objet)
- JARGON : TOUT terme technique doit être traduit ou remplacé par une métaphore

OBJECTIF PRIMAIRE : Créer une Ligne d'Objet qui donne envie de cliquer.

INTERDITS :
- Jargon non expliqué immédiatement
- Ton trop sérieux ou ennuyeux
- Promesses de rendement
- Plus de 500 mots`;
```

### Structure d'une newsletter réussie

```
1. LIGNE D'OBJET (curiosité + provocation légère)
   ✓ "Votre banquier va détester ce mail (et votre portefeuille va m'adorer)"
   ✓ "Le seul investissement sans risque de cette fin d'année 🎄"

2. INTRODUCTION (relatable, le lecteur se reconnaît)
   ✓ "Soyons honnêtes deux minutes : personne ne se réveille le matin en se disant..."
   ✓ Comparaison inattendue : "C'est un peu comme le dentiste ou les mises à jour Windows"

3. POINTS CLÉS (2-3 max, avec titres accrocheurs)
   ✓ Titres sarcastiques : "Le Hold-up légal (et comment en sortir)"
   ✓ Métaphores accessibles : "Parachute doré de la banque, mais c'est vous qui payez la soie"
   ✓ Vulgarisation : "Volatils (ce mot savant pour dire qu'ils ont sauté partout comme un enfant après trop de sucre)"

4. CONCLUSION + CTA
   ✓ CTA clair : "Cliquez ici pour simuler vos économies en 2 minutes"
   ✓ Signature personnalisée : « Nicolas, Votre Conseiller (…) »
```

### Techniques d'humour efficaces

| Technique | Exemple |
|-----------|---------|
| **Comparaison inattendue** | "Comme un film d'auteur polonais : parfois long, souvent incompréhensible" |
| **Auto-dérision légère** | "Qui préfère le champagne aux tableaux Excel, du moins jusqu'au 2 janvier" |
| **Référence culturelle** | "Plus digeste que le discours de Tonton Michel sur la géopolitique mondiale" |
| **Exagération mesurée** | "Attendre la date anniversaire comme on attend une éclipse solaire" |
| **Métaphore du quotidien** | "Aussi simple que de commander un burger sur une application" |

### Prompt Mistral pour newsletter automatisée

```javascript
// Pour n8n + Mistral (V2.5)
const mistralBody = {
  model: "mistral-small-latest",
  temperature: 0.8, // Un peu moins que 1.0 pour rester cohérent
  messages: [
    {
      role: "system",
      content: `Tu es "Patrimoine Sarcasme", expert CGP avec humour décalé.

TON : Professionnel, informel, bienveillant, légèrement ironique.
FORMAT : Objet accrocheur → Intro relatable → 2-3 points clés → CTA
LONGUEUR : 300-500 mots
JARGON : Traduit TOUJOURS en métaphores simples

TECHNIQUES D'HUMOUR :
- Comparaisons inattendues ("comme un film d'auteur polonais")
- Références au quotidien ("Tonton Michel", "mises à jour Windows")
- Auto-dérision légère dans la signature

INTERDITS :
- Jargon technique non expliqué
- Ton sérieux ou ennuyeux
- Promesses de rendement
- Humour forcé ou de mauvais goût`
    },
    {
      role: "user",
      content: `Rédige une newsletter pour mes clients sur ce sujet :

THÈME : ${theme}
ACTUALITÉS SOURCES : ${actualites}
IMPACT POUR LE CLIENT : ${impact}

Commence directement par la Ligne d'Objet.`
    }
  ]
};
```

### Exemples de newsletters générées

**Exemple 1 : Assurance emprunteur**
> **Objet** : "Votre banquier va détester ce mail (et votre portefeuille va m'adorer)"
> 
> **Intro** : "Soyons honnêtes deux minutes : personne ne se réveille le matin en se disant : « Tiens, et si j'analysais la quotité de mon assurance emprunteur ? » C'est un peu comme le dentiste ou les mises à jour Windows..."
>
> **Point clé** : "L'assurance emprunteur, c'est le parachute doré de la banque, mais c'est vous qui payez la soie."
>
> **CTA** : "Curieux de découvrir quel est le montant exact de la « petite fortune » que vous versez en trop ?"

**Exemple 2 : Bilan annuel**
> **Objet** : "Le seul investissement sans risque de cette fin d'année 🎄"
>
> **Intro** : "C'est officiellement cette période magique de l'année. Celle où la stratégie la plus complexe devrait consister à gérer votre appétit entre le foie gras et la bûche."
>
> **Point clé** : "Si vous avez regardé votre portefeuille cette année, vous avez peut-être eu l'impression de regarder un film d'auteur polonais : c'était parfois long, souvent incompréhensible, mais avec quelques moments de grâce inattendus."
>
> **Conclusion** : "Votre patrimoine le plus précieux pour les 10 prochains jours, c'est votre temps et vos proches. La « rentabilité » d'un bon moment en famille est la seule qui soit garantie sans risque de perte en capital."
