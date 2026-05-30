# Module email — feuille de route

Guide produit et technique pour le module mail du CRM Patrimoine.  
État initial commité : SMTP + templates + file Suivi → Envois (confirmation manuelle).

---

## Principe non négociable (phase actuelle)

**L’envoi réel nécessite le CRM ouvert** (processus Tauri actif).

| Action | CRM fermé | CRM ouvert |
|--------|-----------|------------|
| Remplir la file (étiquettes, dates) | Oui (SQLite) | Oui |
| Prévisualiser / éditer un brouillon | Non | Oui |
| **Envoyer** un email | **Non** | Oui (clic utilisateur) |

Pas d’envoi en arrière-plan tant qu’on n’a pas explicitement ajouté un service tray / tâche planifiée (phase ultérieure, optionnelle).

---

## Ce qui existe déjà

| Brique | Fichiers / écrans |
|--------|-------------------|
| SMTP Gmail / Outlook (preset + mot de passe app) | `SmtpConfigForm`, `src-tauri/src/email/` |
| Templates | `templates_email`, page Templates email |
| Variables + aperçu | `etiquette-email-preview.ts` |
| File d’envoi | `EtiquetteEnvoisTab`, `get_etiquette_email_queue` |
| Envoi | `send_email` → OAuth (Gmail / Graph) ou repli SMTP |

---

## Étapes (ordre d’implémentation)

### Étape 1 — Fondations ✅

- Documenter la feuille de route (`docs/EMAIL.md`).
- Rappel UI : CRM ouvert pour envoyer (Suivi → Envois, Paramètres → Email).
- Pas de changement d’architecture d’envoi.

### Étape 2 — Templates métier ✅

- Bibliothèque par **intention** (`RELANCE`, `FISCALITE`, `SUIVI_ANNUEL`, …) — page Templates Email.
- **7 modèles par défaut** (`seed_default_email_templates`, bouton « Modèles par défaut »).
- Variables documentées : `src/lib/emails/template-email-meta.ts`.
- Suggestion **étiquette → template** (`suggestTemplateIdForEtiquette`, bouton Suggérer dans EtiquetteForm).
- Aperçu live (contact fictif ou réel), **duplication**, regroupement par catégorie.

### Étape 3 — Connexion moderne (OAuth) ✅

- Paramètres → **Connecter Google** / **Connecter Microsoft** (PKCE, port local `3847`).
- Envoi via **Gmail API** ou **Microsoft Graph** ; repli **SMTP** si pas de OAuth.
- Identifiants client dans l’app ; guide : `docs/EMAIL_OAUTH_SETUP.md`.
- `test_email_connection` unifié (OAuth ou SMTP).
- Tokens OAuth chiffrés au repos (clé CRM) — voir [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md#sécurité-des-données-locales).

### Étape 4 — File d’envoi enrichie

- Envoi **groupé** (sélection multiple, barre de progression).
- Journal `email_send_log` (contact, template, statut, horodatage).
- Onglet Historique dans Suivi → Envois.

### Étape 5 — Planification locale (optionnel, toujours CRM actif)

- « Envoyer à telle date/heure » tant que l’app tourne (timer Rust côté Tauri).
- Icône barre des tâches : rappel si des mails sont prêts.
- **Pas** d’envoi silencieux sans validation humaine (recommandé CGP).

### Étape 6 — Rédaction assistée (opt-in)

- Assist **local** (reformulation du brouillon).
- IA cloud **désactivée par défaut**, clé API utilisateur si activée.

---

## Parcours cible (utilisateur CGP)

1. Connecter la boîte (étape 3) ou configurer SMTP (aujourd’hui).
2. Créer ou choisir des templates (étape 2).
3. Activer campagne email sur une étiquette → contacts entrent dans la file.
4. Ouvrir **Suivi → Envois** avec le CRM lancé → valider et envoyer.
5. Consulter l’historique (étape 4).

---

## Fichiers de référence

| Sujet | Document |
|-------|----------|
| Étiquettes + file | [ETIQUETTES.md](./ETIQUETTES.md) |
| OAuth Gmail / Microsoft | [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md) |
| Tests | [TESTS.md](./TESTS.md) |
| Agents | [AGENTS.md](../AGENTS.md) |
