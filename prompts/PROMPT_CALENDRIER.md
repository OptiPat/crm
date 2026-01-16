# 📅 MODULE : Intégration Calendrier (Google Agenda / Outlook)

> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Intégrer **Google Agenda** et **Outlook Calendar** pour :
- Lire les disponibilités du CGP
- Proposer des créneaux dans les emails
- Créer des RDV depuis le CRM
- Synchronisation bidirectionnelle

---

## 🔐 Authentification OAuth2

### Google Calendar

1. Créer un projet Google Cloud Console
2. Activer l'API Google Calendar
3. Créer des identifiants OAuth 2.0 (Desktop app)
4. Stocker `client_id` et `client_secret`

### Microsoft Graph (Outlook)

1. Enregistrer l'app dans Azure AD
2. Configurer les permissions Calendar.ReadWrite
3. Créer des identifiants OAuth 2.0
4. Stocker `client_id` et `tenant_id`

---

## 📦 Dépendances

### Option 1 : Côté Frontend (simple)
```bash
npm install @react-oauth/google
```

### Option 2 : Côté Rust (recommandé pour sécurité)
```toml
# Cargo.toml
oauth2 = "4.4"
reqwest = { version = "0.11", features = ["json"] }
```

---

## ✨ Fonctionnalités à implémenter

### 1. Configuration OAuth dans Paramètres

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Calendrier                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Fournisseur : ○ Google Agenda  ○ Outlook  ○ Aucun         │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐
│  │  ✅ Connecté à Google Agenda                            │
│  │  Compte : cgp@gmail.com                                 │
│  │                              [Déconnecter]              │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│  Calendrier à utiliser : [Mon calendrier principal ▼]       │
│                                                             │
│  Créneaux proposés :                                        │
│  ☑️ Lundi      09:00 - 12:00, 14:00 - 18:00                 │
│  ☑️ Mardi      09:00 - 12:00, 14:00 - 18:00                 │
│  ☑️ Mercredi   09:00 - 12:00                                │
│  ☑️ Jeudi      09:00 - 12:00, 14:00 - 18:00                 │
│  ☑️ Vendredi   09:00 - 12:00, 14:00 - 17:00                 │
│  ☐ Samedi                                                   │
│  ☐ Dimanche                                                 │
│                                                             │
│            [Enregistrer]                                    │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Lecture des disponibilités

```typescript
interface TimeSlot {
  start: Date;
  end: Date;
}

interface Availability {
  date: string;  // YYYY-MM-DD
  slots: TimeSlot[];
}

async function getAvailabilities(
  startDate: Date,
  endDate: Date,
  duration: number = 60  // minutes
): Promise<Availability[]> {
  // 1. Récupérer les événements existants
  const events = await getCalendarEvents(startDate, endDate);
  
  // 2. Calculer les créneaux libres selon les horaires configurés
  const availabilities: Availability[] = [];
  
  for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayConfig = getWorkingHours(d.getDay());
    if (!dayConfig.enabled) continue;
    
    const dayEvents = events.filter(e => isSameDay(e.start, d));
    const freeSlots = calculateFreeSlots(dayConfig.hours, dayEvents, duration);
    
    if (freeSlots.length > 0) {
      availabilities.push({ date: formatDate(d), slots: freeSlots });
    }
  }
  
  return availabilities;
}
```

---

### 3. Proposer des créneaux dans les emails

Variable de template : `{{disponibilites}}`

```html
<!-- Rendu dans l'email -->
<p>Voici mes prochaines disponibilités :</p>
<ul>
  <li>Lundi 20 janvier : 10h00, 14h00, 16h00</li>
  <li>Mardi 21 janvier : 09h00, 11h00, 15h00</li>
  <li>Mercredi 22 janvier : 10h00</li>
</ul>
<p>Cliquez sur le créneau qui vous convient : [lien Calendly ou formulaire]</p>
```

---

### 4. Créer un RDV depuis le CRM

Dans la fiche contact :

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Planifier un RDV avec Jean MARTIN                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Type de RDV : [Suivi annuel           ▼]                  │
│                                                             │
│  Date : [📅 22/01/2026]                                    │
│                                                             │
│  Créneaux disponibles :                                     │
│  ○ 09:00 - 10:00                                           │
│  ● 10:00 - 11:00  ← sélectionné                            │
│  ○ 14:00 - 15:00                                           │
│  ○ 16:00 - 17:00                                           │
│                                                             │
│  Lieu : ○ Téléphone  ○ Visio  ● Bureau                     │
│                                                             │
│  Notes : [________________________]                         │
│                                                             │
│  ☑️ Envoyer une invitation par email au client              │
│  ☑️ Ajouter à mon calendrier                                │
│                                                             │
│           [Annuler]                    [Créer le RDV]       │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Synchronisation bidirectionnelle

- **CRM → Calendrier** : Créer événement quand RDV ajouté
- **Calendrier → CRM** : Détecter les nouveaux RDV (polling régulier)
- Lier les événements aux contacts (par email ou recherche)

---

## 🔌 API Google Calendar

```typescript
// Authentification
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'  // Desktop app
);

// Récupérer les événements
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const events = await calendar.events.list({
  calendarId: 'primary',
  timeMin: startDate.toISOString(),
  timeMax: endDate.toISOString(),
  singleEvents: true,
  orderBy: 'startTime',
});

// Créer un événement
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'RDV avec Jean MARTIN - Suivi annuel',
    start: { dateTime: '2026-01-22T10:00:00', timeZone: 'Europe/Paris' },
    end: { dateTime: '2026-01-22T11:00:00', timeZone: 'Europe/Paris' },
    attendees: [{ email: 'jean.martin@email.com' }],
  },
});
```

---

## 🗂️ Fichiers à créer

```
src/components/calendar/
├── CalendarConnect.tsx     # Bouton de connexion OAuth
├── AvailabilityPicker.tsx  # Sélection de créneau
├── RdvForm.tsx             # Formulaire de RDV
├── WorkingHoursConfig.tsx  # Configuration horaires

src/lib/calendar/
├── google.ts               # API Google Calendar
├── microsoft.ts            # API Microsoft Graph
├── availability.ts         # Calcul des disponibilités
└── types.ts

src/lib/api/
└── tauri-calendar.ts       # API TypeScript

src-tauri/src/calendar/     # Backend Rust (optionnel)
├── mod.rs
├── google.rs
└── microsoft.rs
```

---

## ⚠️ Considérations

### Stockage des tokens
- Tokens OAuth stockés localement (chiffrés)
- Refresh token pour renouvellement automatique
- Expiration gérée automatiquement

### Confidentialité
- Les données de calendrier ne sont lues que localement
- Aucune synchronisation cloud tierce
- Le client autorise explicitement l'accès

---

## 📝 Ordre de développement

1. **Étape 1** : Configuration OAuth Google (credentials)
2. **Étape 2** : Flux d'authentification Google
3. **Étape 3** : Lecture des événements
4. **Étape 4** : Configuration des horaires de travail
5. **Étape 5** : Calcul des disponibilités
6. **Étape 6** : Intégration dans les templates email
7. **Étape 7** : Formulaire de création de RDV
8. **Étape 8** : Création d'événement dans le calendrier
9. **Étape 9** : Support Microsoft Outlook (optionnel)

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [ ] Connexion OAuth fonctionne
- [ ] Les événements sont récupérés
- [ ] Les disponibilités sont calculées correctement
- [ ] La variable `{{disponibilites}}` fonctionne dans les emails
- [ ] La création de RDV fonctionne
- [ ] L'événement apparaît dans le calendrier
