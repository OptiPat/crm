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
| Connexion OAuth Gmail / Outlook | `EmailOAuthConnect`, `src-tauri/src/email/oauth_*` |
| Templates | `templates_email`, page Templates email |
| Variables + aperçu | `etiquette-email-preview.ts` |
| File d’envoi | `EtiquetteEnvoisTab`, `get_etiquette_email_queue` |
| Envoi | `send_email` → OAuth (Gmail API / Microsoft Graph) |

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
- Envoi via **Gmail API** ou **Microsoft Graph** (seule méthode dans l’interface).
- Identifiants client dans l’app ; guide : `docs/EMAIL_OAUTH_SETUP.md`.
- `test_email_connection` (compte OAuth connecté).
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

## Signature Gmail

L’API Gmail **n’ajoute pas** la signature configurée dans Gmail. Dans **Paramètres → Profil** :

- **Importer depuis Gmail** (recommandé) : conserve le **logo** et la mise en forme (envoi en HTML).
- Ou coller du texte seul (sans image).

Si vous voyez `&#39;` au lieu d’apostrophes : **réimportez depuis Gmail** puis **Enregistrer** le profil (ou rechargez l’app : les apostrophes sont corrigées à la lecture). Ne modifiez pas le texte après import si vous voulez garder le logo.

La signature est ajoutée en fin de chaque message dans la file d’envoi (aperçu texte + envoi HTML si logo importé), y compris l’**email de test** OAuth (Paramètres → Email → Tester la connexion), si elle est configurée dans le profil.

## Suivi après envoi (relance)

| Réglage | Où | Défaut |
|---------|-----|--------|
| Délai sans retour | Paramètres → Profil → **Délai relance** | 5 jours |

Après envoi depuis **Suivi → Envois**, si aucun retour n’est enregistré au bout de N jours, l’onglet **À relancer** propose :

- **Relancer** : remet le contact dans **Prêts à envoyer** avec le **template de relance** lié au modèle initial (Paramètres template → « Template de relance (2e email) »). Sans lien configuré, le même modèle est réutilisé.
- **Icône mail / calendrier** : marquer réponse par email ou RDV pris,
- **Ignorer** : ne plus proposer de relance pour cet envoi.

Indice : si la **date de dernier contact** sur la fiche est postérieure à l’envoi, un bandeau bleu signale un contact possible — à confirmer manuellement.

**Journal des échanges campagne** (envoi + réponse) : données sur `contact_etiquettes` (`email_sent_template_nom`, `email_reponse_body`, etc.), affichées dans **Historique des échanges** et sur la fiche contact (**Relation client**), avec le **nom du template** (pas le corps de l’envoi) et la **réponse client complète** quand elle est importée ou synchronisée depuis Gmail. Les anciennes traces texte dans `interactions` (« Campagne … — email envoyé », relance…) ne sont plus affichées en double sur la fiche : le fil unifié les remplace.

Les **échanges manuels** (appel, RDV, note saisie à la main) restent des lignes `interactions` éditables dans **Relation client**. Pour **répondre** à un email campagne, utiliser **Historique des échanges** (bouton depuis la fiche : « Répondre dans Historique »).

**Dernier contact** (fiche client) : mis à jour **automatiquement** seulement si la réponse campagne est un **RDV** (bouton calendrier, ou détection Agenda Google). Une **réponse par email** enregistre le fil et sort le contact de « À relancer », mais **ne modifie pas** la date de dernier contact ni les alertes suivi client — à mettre à jour **manuellement** après un vrai échange (RDV, appel noté, champ sur la fiche).

Les étiquettes auto (ex. **Suivi > 1 an**) suivent `date_dernier_contact` : elles restent tant que vous n’avez pas saisi la date de votre dernier RDV / contact réel. **Déclaration IR** dépend de la période fiscale, pas du dernier contact.

L’interface se rafraîchit sans action manuelle (Suivi, Envois, fiche ouverte).

### Détection automatique (Google)

Nécessite **Google connecté** avec les droits Gmail (lecture) et **Google Calendar** (lecture). Si l’accès Agenda échoue : **Paramètres → Email → reconnecter Google**.

| Source | Détection |
|--------|-----------|
| **Gmail** | Réponse du client dans le fil de discussion (thread enregistré à l’envoi) ou message `from:client` après la date d’envoi |
| **Agenda** | Événement sur l’agenda principal avec le client en participant, après l’envoi |

Déclenchement : à l’**actualisation** de la file, ou bouton **Vérifier réponses** (Suivi → Envois). Les contacts détectés sont marqués « répondu » (mail ou RDV) et sortent de **À relancer**.

Limite : envois **avant** cette version sans thread Gmail enregistré — la recherche par expéditeur compense en partie. Microsoft / SMTP : pas de sync auto (marquage manuel).

---

## Campagne par étiquette : éligibilité vs date fixe

| Mode (formulaire étiquette) | Champ SQLite | Comportement |
|-----------------------------|--------------|--------------|
| **Dès éligibilité** | `email_envoi_heure` (ex. `09:00`) | Chaque contact reçoit une date d’envoi calculée à partir de **sa** date d’attribution (ou du recalcul auto). Ex. règle « Suivi > 1 an » : le mail devient **Prêt** dès que le délai est dépassé, au créneau horaire du jour (ou immédiatement si l’heure est déjà passée). |
| **Date fixe** | `email_envoi_prevu` (timestamp) | Même date/heure pour tous les contacts déjà tagués (campagnes ponctuelles type « envoi le 15/06 à 10h »). |

Prérequis pour voir des lignes dans **Suivi → Envois** :

1. Campagne email **activée** sur l’étiquette + template choisi.
2. Pour les étiquettes auto : lancer **Recalculer les règles** (contacts tagués + dates recalculées).
3. OAuth connecté ; envoi manuel depuis l’onglet **Prêts**.

Les deux modes sont exclusifs : enregistrer l’un efface l’autre côté base.

## Templates ↔ étiquettes

- Dans **Templates email** → modifier un modèle : section **Étiquettes qui utilisent ce template** (cases à cocher). Enregistrement = `email_template_id` mis à jour sur chaque étiquette cochée.
- Dans **Étiquette** : le template reste aussi sélectionnable dans « Paramètres campagne » ; la suggestion par nom (`Suggérer`) complète le lien sans remplacer la liste template→étiquettes.

---

## Parcours cible (utilisateur CGP)

1. Connecter la boîte Gmail ou Outlook (étape 3).
2. Créer ou choisir des templates (étape 2) ; lier les étiquettes concernées depuis le formulaire template.
3. Sur chaque étiquette : activer la campagne, choisir le template, mode **Dès éligibilité** (heure) ou **Date fixe**, puis recalculer si règle auto.
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
