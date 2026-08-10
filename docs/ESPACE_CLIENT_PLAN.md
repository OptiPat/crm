# Espace client — plan d'implémentation

> **Statut au 10 août 2026** : phases 0 et 1 construites et testées, en local uniquement.
> Cadrage initial du 8 août. Voir §0 pour l'état d'avancement réel.
> **Public** : agent ou développeur qui reprend le sujet. Lire les sections 2 et 3 avant toute proposition alternative.

---

## 0. Où on en est

**Construit, testé, non déployé.** Le portail tourne en local, un client peut recevoir
son code par email et consulter son patrimoine. Aucune donnée réelle ne doit y transiter
tant que les points bloquants du §14 ne sont pas levés.

| Phase | État |
|---|---|
| 0 — Fondations CRM (logique pure, aperçu conseiller) | **Fait** |
| 1 — Portail en lecture, authentification client | **Fait** |
| 2 — Dépôt de documents | Non commencé (module antivirus prêt, non câblé) |
| 3 — Documents mis à disposition | Non commencé |
| 4 — Déclaration des avoirs extérieurs | Non commencé |
| 5 — Notifications et cycle de vie | Partiel (révocation faite) |
| Déploiement serveur | Non fait — `espace-portail/deploy/Caddyfile` prêt |

Documents liés : `docs/ESPACE_CLIENT_RGPD.md` (registre, bases légales, sous-traitants),
`espace-portail/README.md` (lancement, variables d'environnement, mise en ligne).

---

## 1. Ce qu'on construit

Un **espace client web permanent**, accessible depuis un téléphone, qui donne à chaque client du cabinet une vue de son patrimoine et un canal d'échange avec son conseiller.

Côté client :

- **Inventaire** : ce qu'il possède, chez quel partenaire, avec le lien vers l'extranet du partenaire
- **Deux graphiques** : répartition par catégorie d'actifs, et répartition par disponibilité (quand il peut y accéder)
- **Timeline** : les événements datés qui le concernent (fin de démembrement, échéance de prêt, prochain arbitrage, déclaration fiscale, rendez-vous)
- **Dépôt de documents** : uniquement ceux que le conseiller demande
- **Documents mis à disposition** par le conseiller (rapport, fiche conseil, attestation)
- **Déclaration de ses avoirs extérieurs**, pour compléter lui-même sa vue

Côté CRM : le conseiller pilote tout depuis l'application desktop existante.

**Une seule instance sera déployée : celle du cabinet propriétaire du CRM.** Ce n'est pas un produit livrable à d'autres cabinets (voir §2).

---

## 2. Décisions actées — ne pas relitiger

Ces points ont été tranchés après discussion. Un agent qui reprend le sujet ne doit pas les rouvrir sans élément nouveau.

| Décision | Raison |
|---|---|
| **Espace permanent**, pas un lien magique jetable | La valeur vient de la relation continue, pas d'une collecte ponctuelle |
| **Une seule instance : celle du cabinet** | Héberger des vues patrimoniales pour les clients d'autres cabinets est hors de portée d'un développeur seul (responsabilité, support, sécurité) |
| **Pas de SaaS multi-tenant, pas de version « self-hostable » distribuée** | Rendre un logiciel déployable par des tiers coûte 2 à 3× le travail, pour des utilisateurs qui ne le déploieront pas |
| **Valorisations non quotidiennes**, courbe longue (3–5 ans, pas mensuel) | Un badge « −3,2 % ce mois » génère des appels ; une trajectoire rassure. Même donnée, effet inverse |
| **Camembert plutôt que chiffres qui bougent** | Les proportions ne bougent quasiment pas quand les marchés bougent : représentation structurellement non anxiogène |
| **Authentification par code email**, pas de mot de passe | Le mot de passe sera oublié et sa récupération passe de toute façon par l'email |
| **Ré-authentification pour les actions sensibles** (documents) | Permet une session longue et confortable pour la consultation courante |
| **Documents en transit, pas en résidence** | Un CNI qui reste 9 mois en ligne est une exposition inutile |
| **Chacun son espace** dans un couple | Permet de couper un accès sans toucher à l'autre (séparation) |
| **Stack : Rust/Axum + SQLite + React statique + Caddy, un VPS européen** | Surface opérationnelle minimale, réutilise les compétences et les patterns du CRM |
| **RIO et QPI restent côté CGP** | Ce sont des documents professionnels importés depuis Stellium, pas des pièces que le client dépose |
| **Le portail envoie lui-même les codes, via Brevo** | Le CRM est une application de bureau éteinte la nuit : le laisser dans la boucle rendait la connexion impossible hors heures de bureau |
| **Première connexion par code dicté de vive voix** | Une adresse email périmée suffirait sinon à ouvrir une vue patrimoniale complète à un tiers |
| **Session : 30 jours d'appareil, 30 minutes d'inactivité** | Assez long pour ne pas décourager la consultation, assez court pour qu'un téléphone perdu cesse d'être autorisé |
| **Aucun lien de connexion dans les emails** | Les antivirus de messagerie pré-ouvrent les URL et consommeraient un jeton à usage unique |
| **Le portail vit dans le dépôt du CRM** | Une seule vérification, un seul historique ; le dépôt est public mais ne contient aucun secret |

### Options explicitement écartées

- **Signature électronique** (Yousign, Universign) — écartée par le propriétaire
- **PocketBase, Node/Next.js, PostgreSQL, tout BaaS managé** — écosystème supplémentaire à surveiller, ou garde des données par un tiers
- **Stockage des identifiants extranet des clients** — transforme le portail en cible à haute valeur, responsabilité non assurable
- **SMS comme facteur d'authentification principal** — inutile au quotidien ; conservé uniquement en second facteur ciblé (§11)
- **Notifications push comme canal principal** — friction d'installation trop élevée pour la clientèle visée
- **SharePoint / M365 comme support de l'espace** — ne sait pas rendre une vue patrimoine à un utilisateur externe

---

## 3. Invariants — règles à ne jamais casser

Ces règles sont le résultat de la conception. Toute implémentation qui les enfreint est à rejeter, même si elle « marche ».

**R1 — Traçabilité de chaque montant.** Toute valeur affichée porte sa source et sa date. Aucun total agrégé n'est affiché sans être décomposé par source (« 520 k€ suivis par votre conseiller au 31/03 — 327 k€ déclarés par vous le 12/01 »).

**R2 — Cloisonnement conjugal.** Le patrimoine **personnel** d'une personne n'est jamais visible de son conjoint. Le patrimoine **commun** (rattaché au foyer) est visible des deux. Le patrimoine de l'**enfant mineur** est visible des deux parents. En cas de doute sur le rattachement : invisible.
*C'est la règle la plus critique du projet. Exposer à un conjoint un avoir qu'il ignorait est un incident irréparable dans ce métier.*

**R3 — Les documents transitent, ils ne résident pas.** Un fichier déposé par le client est rapatrié en GED par le CRM à la synchronisation suivante, puis **effacé du portail**. Rétention exprimée en jours.

**R4 — Liens oui, identifiants jamais.** Le portail sait où aller (URL d'extranet), jamais comment entrer.

**R5 — Le portail est reconstructible.** Tout son contenu provient du CRM ou du client, et se retrouve dans le CRM après synchronisation. Si le serveur est perdu, on redéploie et on repousse. Ne jamais créer de donnée qui n'existe que sur le portail au-delà de la fenêtre de synchronisation.

**R6 — Le portail ne joint jamais le CRM.** Le CRM est une application de bureau sans adresse publique, éteinte la nuit. C'est toujours le CRM qui initie (push et pull).

**R7 — Ré-authentification pour toute action sensible.** Déposer ou consulter un document exige une authentification fraîche, même si la session de consultation est valide.

**R8 — Aucune URL de document permanente ou devinable.** Liens signés, valables quelques minutes.

**R9 — Propriété disjointe des lignes.** Le conseiller possède les lignes qu'il a saisies, le client possède celles qu'il déclare. Les deux ensembles ne se recouvrent jamais, donc aucune résolution de conflit n'est nécessaire.

**R10 — Pas de multi-tenant, pas de documentation d'installation pour des tiers.** Une seule instance.

**R11 — Fonctionnalité invisible pour les autres utilisateurs du CRM.** Le CRM est distribué en release à d'autres cabinets. Aucun élément d'interface lié à l'espace client — onglet, section de paramètres, entrée de menu, bouton, notification — ne doit apparaître chez un utilisateur qui n'a pas activé la fonctionnalité. Le comportement par défaut est **invisible**, pas « visible mais désactivé ».

**R12 — Une adresse email, un seul accès actif.** Deux contacts partageant une adresse — un couple, cas fréquent — font **refuser** la connexion. Choisir arbitrairement rattacherait la session au mauvais conjoint et lui servirait le patrimoine de l'autre, contournant R2 par la porte de service.

**R13 — Réponse identique quelle que soit la cause du refus.** Demande de code comme connexion : adresse inconnue, accès révoqué, adresse partagée ou code faux renvoient le même message et le même code HTTP. La raison réelle ne part que dans les logs serveur. Sans cela, comparer les réponses dresse la liste des clients du cabinet.

**R14 — Le code de connexion n'existe jamais en clair au repos.** Seule son empreinte va en base. Le clair ne vit qu'entre sa génération et l'appel au service d'envoi.

**R15 — Les en-têtes de proxy ne sont lus que d'un pair de confiance.** `X-Forwarded-For` et `X-Real-IP` ne sont pris en compte que si la requête vient réellement du reverse proxy (adresse locale ou privée). Autrement, n'importe qui joignant le binaire en direct change d'identité à chaque requête et annule la limitation par IP.

**R16 — Un défaut dangereux est toujours opt-in.** Le mode qui expose le patrimoine sans authentification, comme tout garde-fou désactivable, est inactif par défaut et le binaire refuse de démarrer dans les combinaisons qui le rendraient joignable. Un avertissement dans les logs ne suffit pas.

---

## 4. Ce qui existe déjà et doit être réutilisé

Chemins vérifiés dans le dépôt.

### Synchronisation — le pattern est déjà construit

Le **mode équipe SharePoint** résout exactement le même problème (application locale ↔ stockage distant permanent) :

- `src-tauri/src/database/workspace_outbox.rs` — file d'attente alimentée par **triggers SQLite** installés par table (`ensure_workspace_outbox_triggers_for_table`)
- `src-tauri/src/database/workspace_delta.rs`, `workspace_blob.rs`, `workspace_restore.rs`, `workspace_sync.rs`
- `src-tauri/src/workspace/sync/` — `push.rs`, `pull.rs`, `sequence.rs`, `rebuild.rs`, `blob.rs`, `commands.rs`
- `src-tauri/src/workspace/mode.rs`, `oauth.rs`
- `src/lib/team/team-capabilities.ts` — pattern de configuration côté UI (`WorkspaceMode`)

**Ne pas réinventer la synchronisation.** Le mécanisme outbox + curseur de séquence est à transposer vers un second destinataire.

### Données patrimoniales

`src-tauri/src/database/investissements.rs`, table `investissements` :

- `type_produit` — environ 30 valeurs, déjà groupées en commentaire (Immobilier détaillé / SCPI / Placements)
- `contact_id`, `foyer_id` — le rattachement qui porte la règle R2
- `montant_initial`, `encours`, `encours_date`
- `date_souscription`, `date_fin_demembrement`, `date_fin_pret`, `date_prochain_arbitrage`, `date_cloture`
- `url_contrat` — « lien direct vers le contrat sur l'extranet assureur »
- `origine` — `MON_CONSEIL` | `EXISTANT_CLIENT`
- `statut` — `ACTIF` | `CLOTURE`

Historique de valorisation : `support_vl_history` / `contrat_supports` (valeur liquidative datée par ISIN, jamais écrasée).

### Autres briques

- `database/documents.rs` + table `documents` (`contact_id`, `foyer_id`, `type_document`, `nom_fichier`, `chemin_fichier`, `taille_fichier`, `mime_type`, `date_document`)
- `database/partenaires.rs` + table `partenaires` (`nom`, `type_produit`, `contact_commercial`, `email`, `telephone`, `notes`) — **pas de champ URL, migration nécessaire**
- `database/alertes.rs` — types d'alertes existants dont `FIN_DEMEMBREMENT`, `SUIVI_CLIENT_ANNUEL`
- `database/templates_email.rs` + `src-tauri/src/email/oauth_send.rs` — envoi d'emails déjà opérationnel, réutilisé pour les codes et notifications
- `database/foyers.rs`, `familles.rs` — structure familiale
- `docs/CHIFFREMENT.md` — primitives de chiffrement des secrets

---

## 5. Migrations côté CRM

Migrations **runtime Rust** dans `src-tauri/src/database/mod.rs`. Idiome exact du dépôt :

```rust
if !self.table_has_column("partenaires", "url_extranet")? {
    self.conn.execute(
        "ALTER TABLE partenaires ADD COLUMN url_extranet TEXT",
        [],
    )?;
    println!("✅ Migration: colonne url_extranet sur partenaires");
}
```

Les nouvelles tables suivent `CREATE TABLE IF NOT EXISTS`. Appeler `ensure_workspace_outbox_triggers_for_table` sur les tables destinées à la synchronisation. **Synchroniser `src/lib/db/schema.ts` (Drizzle = doc/dev, la source de vérité reste le Rust).**

### 5.1 Troisième valeur d'origine — à faire en premier

`investissements.origine` accepte aujourd'hui `MON_CONSEIL` et `EXISTANT_CLIENT`. Ajouter **`DECLARE_CLIENT`**.

Distinction essentielle : `EXISTANT_CLIENT` = saisi par le conseiller depuis un document (vérifié). `DECLARE_CLIENT` = tapé par le client (déclaratif, non vérifié).

Sans cette distinction, les statistiques d'encours, la segmentation et le dashboard intègrent silencieusement des montants non vérifiés, sans moyen de les isoler rétroactivement.

**Travail associé** : auditer tout le code qui filtre ou agrège sur `origine` (dashboard, stats, segmentation, exports) et décider explicitement, cas par cas, si le déclaratif y entre.

### 5.2 Colonnes à ajouter

| Table | Colonne | Type | Rôle |
|---|---|---|---|
| `partenaires` | `url_extranet` | TEXT | Lien espace client du partenaire, partagé par tous les clients détenant le produit |
| `investissements` | `derniere_maj_client` | INTEGER | Date de dernière mise à jour par le client (affichage du vieillissement) |

### 5.3 Nouvelles tables CRM

```
espace_acces           contact_id, statut, email_utilise, active_at, revoked_at,
                       derniere_connexion, created_at, updated_at

espace_demande         id, contact_id, type_document, libelle, statut,
                       demande_at, recu_at, valide_at, annule_at

espace_publication     id, contact_id, document_id, publie_at, expire_at, retire_at

espace_sync_state      cle, curseur, derniere_synchro_at, dernier_statut
```

Les avoirs déclarés par le client n'ont **pas** de table dédiée : ils entrent dans `investissements` avec `origine = 'DECLARE_CLIENT'`.

### 5.4 Emplacement du code Rust

Créer `src-tauri/src/database/espace_client.rs` avec `impl Database { … }` et le déclarer dans `mod.rs`.

⚠️ **`database/operations.rs` est gelé — n'y ajouter aucune méthode.**

### 5.5 Verrouillage de la fonctionnalité — implémente R11

Le CRM est publié en release et installé par d'autres cabinets. La fonctionnalité doit être **totalement invisible** chez eux.

**Verrouillage à l'exécution, pas à la compilation.** Deux variantes de build imposeraient deux artefacts, deux flux de publication et deux updaters : disproportionné. Une seule release, dans laquelle la fonctionnalité ne se révèle que si une clé de configuration est présente.

**Mécanisme**

- Une clé dans la table `settings` existante (`database/settings.rs`), par exemple `espace_client_active`, **absente par défaut**
- Aucun écran des Paramètres ne permet de la créer : elle est posée manuellement, hors parcours utilisateur
- Exposée à l'UI via une seule fonction, par exemple `useEspaceClientActive()` ou un champ du contexte de configuration déjà chargé au démarrage

**Règle d'application** : tout point d'entrée UI est monté conditionnellement — onglet de `ContactDetail`, section des Paramètres, entrées de menu, boutons d'action, badges de notification. Pas d'élément grisé, pas de message « fonctionnalité non configurée » : rien.

**Vérification attendue** : avec la clé absente, une recherche visuelle dans l'application ne doit révéler aucune trace de la fonctionnalité. À contrôler avant chaque publication de version.

**Note** : le dépôt étant public, le code source reste visible sur GitHub. R11 porte sur l'interface de l'application distribuée, pas sur la confidentialité du code.

---

## 6. Logique pure à écrire — phase 0

Modules TypeScript sans React, dans `src/lib/patrimoine/`, chacun avec son `.test.ts` (Vitest). Ce sont les seules briques de la première phase, et elles servent au CRM comme au portail.

| Fichier | Entrée | Sortie |
|---|---|---|
| `categories.ts` | `type_produit` (≈30 valeurs) | Catégorie affichable : Immobilier, SCPI, Placements financiers, Retraite, Prévoyance, Autre |
| `disponibilite.ts` | `type_produit` + âge | Horizon : Immédiat, Moyen terme, Retraite, Illiquide. **Pas de « bloqué jusqu'au … »** : une fin de prêt ou de démembrement ne rend pas un actif indisponible, elle date un événement — c'est la timeline qui la porte |
| `visibilite.ts` | investissement + personne + composition du foyer | Booléen de visibilité — **implémente R2** |
| `timeline.ts` | investissements + alertes + tâches | Liste d'événements datés, triés, avec libellé client |
| `perimetre.ts` | ensemble des lignes visibles | Indicateur de complétude + décomposition du total par source (**R1**) |

**`visibilite.ts` exige une couverture de test exhaustive** : personne seule, couple avec biens communs et personnels, enfant mineur, enfant devenu majeur, personne sans foyer, investissement rattaché au foyer sans `contact_id`. C'est la règle dont une erreur coûte le plus cher.

---

## 7. Phases

L'ordre est choisi pour que le risque le plus élevé soit engagé le plus tard possible.

### Phase 0 — Fondations CRM, aucun serveur — **faite**

**Livrables**

1. Migrations §5.1 et §5.2
2. Le verrouillage §5.5 — **à mettre en place avant le premier élément d'interface**, pas après
3. Les cinq modules de logique pure §6, testés
4. Saisie de `url_extranet` dans la fiche partenaire
5. Un onglet **« Aperçu client »** dans `ContactDetail`, monté conditionnellement (**R11**), qui affiche **exactement** ce que le client verrait : inventaire, deux camemberts, timeline

**Pourquoi cette phase existe** : elle ne coûte aucun serveur, aucune sécurité, aucune synchronisation, et elle permet de juger de l'effet réel de l'écran. Elle est utile même si le portail ne voit jamais le jour.

**Critère de sortie** : montrer cet écran à quelques clients en rendez-vous et décider si on engage la suite.

### Phase 1 — Portail en lecture seule — **faite**

Activation et authentification (§11), inventaire, camemberts, timeline. Aucun document.
Synchronisation CRM → portail uniquement.

Modules livrés : `espace-portail/src/` — `auth.rs` (signature HMAC), `auth_store.rs`
(accès, codes, sessions), `client_auth.rs` (endpoints de connexion), `mailer.rs` (envoi
Brevo), `sync.rs` / `sync_auth.rs` (réception CRM), `read.rs`, `security.rs`
(limitation par IP, en-têtes), `db.rs`. UI dans `espace-portail/web/src/`.

Côté CRM : `src-tauri/src/espace_client/` — `activation.rs`, `commands.rs`, `config.rs`,
`portal_api.rs`, `push.rs`, `snapshot.rs`, `sync_payload.rs`, `visibilite.rs`.

### Phase 2 — Dépôt de documents — **non commencée**

Demandes créées depuis le CRM, dépôt par le client, accusé de réception émis par le portail (**pas** par le CRM), rapatriement en GED, purge (**R3**), ré-authentification (**R7**), liens signés (**R8**).

C'est la phase qui porte l'essentiel du poids de sécurité. À ajouter à la liste ci-dessus :

- **Analyse antivirus obligatoire** de tout fichier déposé. `espace-portail/src/document_scan.rs`
  parle déjà à clamd et refuse le dépôt si l'analyse est indisponible en production ; il est
  écrit mais **non câblé**. L'appel devra passer par `tokio::task::spawn_blocking` : le module
  est synchrone et bloquerait un thread du serveur jusqu'à trente secondes.
- **Validation du fichier** : type réel, taille maximale, nombre par demande.
- **Chiffrement au repos** des fichiers en attente de rapatriement — utile contre le vol de
  disque, sans illusion : la clé vit sur la même machine. C'est la rétention courte qui protège.

### Phase 3 — Documents mis à disposition

Publication manuelle depuis la GED, décidée au cas par cas par le conseiller. Date d'expiration, retrait possible. Aucune exposition automatique de la GED.

### Phase 4 — Déclaration des avoirs extérieurs

Saisie par le client (`origine = DECLARE_CLIENT`), jauge de complétude, vieillissement visible des lignes non mises à jour.

**Contrainte de conception** : ne jamais présenter un formulaire vide. Proposer une confirmation (« vous avez aussi un PEA, confirmez le montant ? ») plutôt qu'une saisie libre. Et l'interface doit être excellente **pour le conseiller en rendez-vous**, car c'est là que se fera l'essentiel de la complétion — saisie rapide au clavier, à deux devant l'écran.

### Phase 5 — Notifications et cycle de vie

Notifications par email, alerte sur connexion depuis un nouvel appareil, bouton de révocation d'accès, purge à la fin de la relation.

---

## 8. Stack du portail

| Couche | Choix |
|---|---|
| Backend | Rust + Axum, binaire unique |
| Base | SQLite, un fichier |
| Fichiers | Disque local, chiffrés au repos, purgés (R3) |
| Frontend | React 19 + Tailwind + Vite, compilé en statique et **servi par le binaire Rust** |
| Forme | PWA mobile, installable, pas d'app store |
| HTTPS | Caddy, certificats automatiques |
| Hébergement | VPS chez un hébergeur français (voir §8.1) |
| Déploiement | Un conteneur, une commande — pour une seule instance, donc pas de documentation d'installation à produire |

Un processus, un fichier de base, un dossier de fichiers. Le critère retenu n'est pas l'élégance mais le **nombre de fois par an où ce serveur réclamera de l'attention**.

Concurrence quasi nulle (quelques centaines de clients, trafic très faible) : SQLite est largement dimensionné, ne pas introduire PostgreSQL.

### 8.1 Hébergement

**VPS, et non conteneur managé.** La base SQLite et les fichiers en transit résident sur le disque : il faut un **volume persistant**. La plupart des offres serverless et conteneurs managés ont un système de fichiers éphémère et perdraient la base à chaque redéploiement.

| Élément | Choix |
|---|---|
| Fournisseur | OVH ou Scaleway (France) |
| Gabarit | 1 vCPU, 2 Go RAM, 20–40 Go SSD |
| Coût | ~5–7 €/mois |
| Domaine | Sous-domaine du domaine du cabinet (`espace.<cabinet>.fr`) |

Hébergeur français retenu pour une raison non technique : pouvoir affirmer à un client que ses données sont hébergées en France, de façon vérifiable.

Le disque ne se remplit pas, puisque les documents sont purgés après rapatriement (**R3**).

**Durcissement attendu** : SSH par clé uniquement, mises à jour de sécurité automatiques, pare-feu limité à 80/443, snapshot hebdomadaire chez l'hébergeur, surveillance externe de disponibilité.

La surface d'attaque reste volontairement minimale : un binaire Rust et Caddy, aucun interpréteur, aucun serveur de base de données à l'écoute. Ne rien empiler d'autre sur cette machine.

La sauvegarde est un **confort, pas une nécessité vitale** : le portail est reconstructible depuis le CRM (**R5**). Seule la fenêtre entre une saisie client et la synchronisation suivante mérite une protection.

---

## 9. Contrat de synchronisation

Le CRM initie toujours (**R6**).

```
CRM → portail    invitation / activation d'un accès
CRM → portail    lignes de patrimoine visibles (par personne, après application de R2)
CRM → portail    événements de timeline
CRM → portail    demandes de documents
CRM → portail    publications de documents

CRM ← portail    documents déposés (puis purge côté portail)
CRM ← portail    avoirs déclarés par le client
CRM ← portail    journal d'activité (connexions, consultations)
```

**Authentification de l'API** : clé propre à l'installation, signature HMAC-SHA256 du corps, horodatage avec fenêtre anti-rejeu.

**Idempotence** : chaque élément porte un identifiant stable ; rejouer une synchronisation ne duplique rien. Curseur de séquence côté CRM, comme `workspace/sync/sequence.rs`.

**Filtrage côté CRM, pas côté portail.** Le CRM n'envoie au portail que ce que la personne a le droit de voir. Le portail ne doit jamais détenir de donnée qu'il ne doit pas afficher — c'est ce qui rend R2 robuste même en cas de bug d'affichage.

**Fraîcheur** : le portail affiche toujours la date de la dernière synchronisation. Si le CRM reste fermé une semaine, le portail continue de servir, avec une date honnête.

---

## 10. Sécurité

### Authentification par paliers

| Action | Exigence |
|---|---|
| Consulter patrimoine, camemberts, timeline | Session longue (2–3 mois), liée à l'appareil |
| Déposer ou consulter un document | Ré-authentification fraîche (**R7**) |
| Première connexion depuis un appareil inconnu | Authentification complète |

**Premier facteur** : code à six chiffres par email (infrastructure d'envoi déjà présente dans le CRM).

**Second facteur pour les actions sensibles** : SMS ciblé — de l'ordre de 100 à 200 envois par an, coût négligeable — ou **passkey** proposée en option aux appareils qui la gèrent (« confirmez avec votre empreinte » : plus simple qu'un code et seul mécanisme réellement résistant au hameçonnage).

### Activation initiale — point de vigilance majeur

Toute la chaîne repose sur l'adresse email en base, et les adresses vieillissent. Envoyer une activation à une adresse obsolète revient à ouvrir une vue patrimoniale complète à un tiers.

**La première activation se fait hors ligne** : le conseiller prévient le client de vive voix, ou lui communique oralement le code de première connexion. Une fois l'appareil enregistré, le reste se déroule normalement.

### Contrôles complémentaires

- Limitation stricte des tentatives de code, avec blocage temporaire (un code à six chiffres se force en quelques minutes sans cela)
- Email d'alerte à chaque connexion depuis un nouvel appareil — c'est ce qui permet au client de détecter lui-même une compromission
- Journal d'audit : qui, quoi, quand, depuis quelle adresse
- Liens de documents signés et de courte durée (**R8**)
- Chiffrement au repos des fichiers en attente de rapatriement
- Sauvegarde légère côté portail, couvrant uniquement la fenêtre entre une saisie client et la synchronisation suivante (le reste est reconstructible, **R5**)

### Mentions à l'écran

Dès le premier écran : valeurs indicatives arrêtées à telle date, ne se substituant pas aux relevés des établissements, montants déclarés par le client non vérifiés.

Vocabulaire : « votre patrimoine au 31 mars », **pas** « reporting » — le mot a un sens précis dans le métier et un PDF ainsi intitulé ressemble à un document réglementaire.

---

## 11. Questions encore ouvertes

| Sujet | État |
|---|---|
| Enfant qui atteint 18 ans | Les parents cessent d'administrer ; les dates de naissance sont en base, l'événement est détectable. Non urgent |
| Volumétrie du besoin | Jamais chiffrée. Décision assumée de construire sur conviction plutôt que sur mesure préalable |
| CRM durablement fermé | Le portail sert des données figées ; prévoir un message au-delà d'un certain délai |
| Adresse partagée par un couple | La connexion est refusée (**R12**). Reste à donner au conseiller un message clair dans le CRM plutôt qu'une ligne de log |

Tranché depuis : l'activation hors ligne se fait par **code dicté** affiché une seule fois
au conseiller ; la révocation coupe les sessions du portail **avant** de valider côté CRM.

---

## 14. Sécurité — reste à faire

Ce qui est en place est décrit au §10 et couvert par les tests de `espace-portail/src/`.
Ce qui suit ne l'est pas.

### Bloquant avant tout usage réel

| Sujet | Pourquoi |
|---|---|
| **Déploiement HTTPS** | `deploy/Caddyfile` est prêt, rien n'est déployé. Tant que le service n'est pas derrière TLS, aucune donnée réelle ne doit y transiter |
| **Antivirus câblé** | Le module existe, l'appel n'existe pas — sans lui, le dépôt de documents ouvre un canal d'entrée vers le poste du conseiller |
| **Formalités RGPD** | `docs/ESPACE_CLIENT_RGPD.md` est rédigé mais doit être complété (coordonnées, hébergeur) et le contrat de sous-traitance Brevo activé sur le compte |

### Important

| Sujet | Pourquoi |
|---|---|
| **Séparation des clés** | Un seul secret signe la synchronisation, hache les codes et hache les jetons de session. Trois clés dérivées d'une racine coûtent une heure et évitent qu'une fuite emporte tout |
| **Délivrabilité des codes par email** | Un expéditeur Gmail via Brevo fonctionne ; certains clients (Orange, Free…) classent parfois en spam. À surveiller sur les premiers envois ; un domaine dédié du cabinet reste une amélioration optionnelle, pas un prérequis |
| **Alerte sur nouvel appareil** | Rien ne prévient le client d'une connexion depuis un appareil inconnu : c'est pourtant lui qui détecte une compromission en premier |
| **Ré-authentification pour les documents** (**R7**) | Conçue, pas encore écrite. À faire avec la phase 2 |
| **Veille des dépendances** | `cargo audit` et `npm audit` dans `verify.ps1` : une ligne chacun, et les failles connues remontent sans y penser |
| **Plan de réponse à incident** | Que couper, quels secrets tourner, comment notifier sous 72 heures. Se décide à froid |

### À prévoir

Sauvegarde du portail **et test de restauration** ; rétention et purge des documents (phase 2) ;
revue de sécurité extérieure avant d'ouvrir à l'ensemble des clients.

### Limites assumées

- **Pas de chiffrement de bout en bout.** Il supposerait une clé détenue par le client :
  perdue, tout est irrécupérable. Inapplicable à la clientèle visée. La rétention courte
  (**R3**) est la parade retenue.
- **La clé de chiffrement au repos vit sur le serveur.** Elle protège du vol de disque,
  pas d'une prise de contrôle de la machine.
- **Le maillon faible n'est pas le portail.** La base du CRM est en clair sur le poste du
  conseiller, protégée par le seul chiffrement disque de l'OS, et contient tout — quand le
  portail n'en détient qu'une copie partielle et purgée.

---

## 12. Règles du dépôt à respecter

- `src-tauri/src/database/operations.rs` est **gelé** — nouveau domaine = nouveau fichier `database/espace_client.rs`
- Logique métier hors React, dans `src/lib/<domaine>/`, testable en Vitest
- Migrations = Rust runtime (`database/mod.rs`), Drizzle (`src/lib/db/schema.ts`) tenu synchrone pour la doc
- `notify*Changed()` après toute mutation, pour rafraîchir l'UI
- Messages d'interface en français, identifiants de code en anglais
- Seuils de taille : composant `.tsx` < 300 lignes, module `.ts` < 400, module `.rs` < 600
- Tests de caractérisation **avant** tout refactor structurel
- Vérification : `npm run verify:quick` si seul `src/**` est touché, `npm run verify` dès que `src-tauri/**` ou `espace-portail/**` l'est — `verify.ps1` couvre les deux crates Rust et les deux projets TypeScript
- Aucune donnée nominative réelle dans les fixtures ou les tests (voir `donnees-sensibles.mdc`)
- Pas de `git commit` ni `git push` sans demande explicite

---

## 13. Par où commencer

Les phases 0 et 1 sont faites. La suite, dans cet ordre :

1. **Déployer** le portail derrière Caddy sur un VPS français, avec `ESPACE_PRODUCTION=1`
   et un `ESPACE_SYNC_SECRET` long et aléatoire. `deploy/README.md` décrit la procédure.
2. **Tester l'envoi des codes** avec l'expéditeur Brevo actuel (Gmail) : vérifier boîte de réception et spams chez Orange, Gmail, Outlook.
3. **Séparer les clés** et ajouter `cargo audit` / `npm audit` à la vérification.
4. **Compléter le RGPD** : coordonnées du cabinet, hébergeur, sous-traitance Brevo activée.
5. Alors seulement, **phase 2** : dépôt de documents, en câblant l'antivirus dès le premier
   endpoint d'upload plutôt qu'après.

Les trois premiers points transforment une maquette locale en service exposable. Le
quatrième conditionne le droit d'accueillir un vrai client. Le cinquième est le vrai
produit — et le moment où la sécurité cesse d'être théorique.
