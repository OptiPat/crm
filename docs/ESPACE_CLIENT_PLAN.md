# Espace client — plan d'implémentation

> **Statut au 12 août 2026** : en production, phases 0 à 2 faites, premiers clients en bêta.
> Cadrage initial du 8 août. Voir §0 pour l'état d'avancement réel.
> **Public** : agent ou développeur qui reprend le sujet. Lire les sections 2 et 3 avant toute
> proposition alternative, et **§15 avant de toucher à un écran client**.

---

## 0. Où on en est

**En production, ouvert aux premiers clients.** Le portail tourne sur un VPS OVH en
France, en HTTPS, avec ses sauvegardes quotidiennes. Le parcours complet — consultation
du patrimoine, demande de document, dépôt, rapatriement en GED, purge — a été joué de
bout en bout sur un contact fictif. Trois investisseurs entrent en phase bêta.

| Phase | État |
|---|---|
| 0 — Fondations CRM (logique pure, aperçu conseiller) | **Fait** |
| 1 — Portail en lecture, authentification client | **Fait** |
| 2 — Dépôt de documents | **Fait**, validé en production |
| 3 — Documents mis à disposition | Non commencé — c'est là que se branchera la ré-authentification (R7) |
| 4 — Déclaration des avoirs extérieurs | Non commencé. Une première tranche existe : le client met à jour ses SCPI conseillées |
| 5 — Notifications et cycle de vie | Partiel : révocation, alerte nouvel appareil, annonce des événements |
| Déploiement serveur | **Fait** — procédure dans `espace-portail/deploy/README.md` |

Ajouts postérieurs au plan initial, non prévus ici mais livrés :

- **Échéances rédigées par le conseiller**, affichées au client et annoncées par email
  une seule fois. Elles remplacent les alertes et tâches, retirées de la vue client.
- **Prise de rendez-vous** : un bouton permanent branché sur un lien d'agenda désigné
  dans les réglages, et un lien par échéance. Les liens sont ceux du profil CGP, déjà
  utilisés par les modèles d'emails.
- **Section Paramètres → Espace client** : connexion au portail, bouton de rendez-vous,
  synchronisation de tous les clients actifs.
- **Mise à jour des placements par le client** : SCPI (suivie par le cabinet ou détenue
  à côté) avec valorisation et revenus perçus ; épargne et placements financiers **à côté**
  avec l'encours ; immobilier **à côté** avec valorisation, loyer, mensualité et fin de
  prêt. Aucune création de ligne — uniquement la mise à jour de ce qui est déjà
  synchronisé. Le conseiller est prévenu par email et reprend la déclaration à l'import.
  Plafond de 10 000 000 € par montant, jour civil en UTC comme le reste de la chaîne.
- **Historique de valorisation étiqueté par source** : « Valorisé par votre conseiller »
  ou « Déclaré par vous », les deux sources fusionnées dans une seule liste. Applique
  **R1** là où le client ne voyait auparavant que ses propres déclarations.

Documents liés : `docs/ESPACE_CLIENT_RGPD.md` (registre, bases légales, sous-traitants),
`docs/ESPACE_CLIENT_INCIDENT.md` (plan de réponse à incident),
`espace-portail/deploy/README.md` (déploiement, sauvegarde, pièges rencontrés),
`espace-portail/README.md` (lancement, variables d'environnement),
`.cursor/rules/deploiement-espace-portail.mdc` (mise à jour du portail par un agent).

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

**R7 — Ré-authentification pour **consulter** un document.** Lire une pièce déjà déposée exige une authentification fraîche, même si la session est valide : c'est le seul moment où une pièce d'identité ressort du serveur.

Le **dépôt en est exclu**, délibérément. Il envoie un fichier vers le conseiller ; rien ne sort. Exiger un code n'y protégerait rien et ferait renoncer un client venu déposer son avis d'imposition. Les risques du dépôt sont couverts ailleurs : antivirus, type réel du fichier, taille.

**R8 — Aucune URL de document permanente ou devinable.** Liens signés, valables quelques minutes.

**R9 — Propriété disjointe des lignes.** Le conseiller possède les lignes qu'il a saisies, le client possède celles qu'il déclare. Les deux ensembles ne se recouvrent jamais, donc aucune résolution de conflit n'est nécessaire.

**R10 — Pas de multi-tenant, pas de documentation d'installation pour des tiers.** Une seule instance.

**R11 — Fonctionnalité invisible pour les autres utilisateurs du CRM.** Le CRM est distribué en release à d'autres cabinets. Aucun élément d'interface lié à l'espace client — onglet, section de paramètres, entrée de menu, bouton, notification — ne doit apparaître chez un utilisateur qui n'a pas activé la fonctionnalité. Le comportement par défaut est **invisible**, pas « visible mais désactivé ».

**R12 — Une adresse email, un seul accès actif.** Deux contacts partageant une adresse — un couple, cas fréquent — font **refuser** la connexion. Choisir arbitrairement rattacherait la session au mauvais conjoint et lui servirait le patrimoine de l'autre, contournant R2 par la porte de service.

**R13 — Réponse identique quelle que soit la cause du refus.** Demande de code comme connexion : adresse inconnue, accès révoqué, adresse partagée ou code faux renvoient le même message et le même code HTTP. La raison réelle ne part que dans les logs serveur. Sans cela, comparer les réponses dresse la liste des clients du cabinet.

**R14 — Le code de connexion n'existe jamais en clair au repos.** Seule son empreinte va en base. Le clair ne vit qu'entre sa génération et l'appel au service d'envoi.

**R15 — Les en-têtes de proxy ne sont lus que d'un pair de confiance.** `X-Forwarded-For` et `X-Real-IP` ne sont pris en compte que si la requête vient réellement du reverse proxy (adresse locale ou privée). Autrement, n'importe qui joignant le binaire en direct change d'identité à chaque requête et annule la limitation par IP.

**R17 — Le portail ne peut pas lire les pièces déposées.** Chaque dépôt est scellé avec la **clé publique** du CRM avant d'être écrit sur le disque ; la clé privée ne quitte jamais le poste du conseiller, où elle est chiffrée au repos. Un serveur entièrement compromis ne livre que du chiffré. Le nom d'origine du fichier n'apparaît pas non plus dans l'arborescence : `CNI_DUPONT_Jean.pdf` se lirait sans même ouvrir le fichier.

**R18 — L'aperçu du conseiller et l'écran du client sortent du même code.** Deux écrans
censés être identiques mais écrits séparément divergent, toujours, et rien ne le signale :
l'aperçu affirme au conseiller ce que le client verra, il ne le montre pas. La règle a trois
conséquences pratiques.

- **Les règles d'affichage appartiennent au moteur Rust**, jamais à un composant. Timeline,
  historique de valorisation, bouton de rendez-vous, pièces attendues : l'aperçu lit
  `build_espace_client_preview` — la même fonction que la photo envoyée au portail — et se
  contente de la rendre. Un test compare les deux sorties événement par événement
  (`advisor_preview_shows_the_same_timeline_as_the_portal`).
- **Un rendu = un composant**, partagé par les deux applications (`src/components/contacts/
  client-preview/`). Le portail ne redessine rien pour son compte.
- **Ce qui reste différent doit être nommé et justifié** dans le composant : le cadre
  simulateur, le bouton de déconnexion inerte, le logo du cabinet à défaut de celui du
  serveur. Tout le reste est un défaut.

Le corollaire vaut pour les **règles métier** : le portail ne classe pas les produits, ne
décide pas de ce qui est immobilier ou SCPI, ne recopie aucune liste de types. Il lit ce
que la photo annonce (§9). Une liste dupliquée d'un langage à l'autre est la même dette que
deux écrans dupliqués, avec la même issue silencieuse.

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

### Phase 2 — Dépôt de documents — **faite**, validée en production

Demandes créées depuis le CRM, dépôt par le client, accusé de réception émis par le portail (**pas** par le CRM), rapatriement en GED, purge (**R3**), ré-authentification (**R7**), liens signés (**R8**).

C'est la phase qui porte l'essentiel du poids de sécurité. À ajouter à la liste ci-dessus :

Faits : analyse antivirus obligatoire (`document_scan.rs`, appelée via
`spawn_blocking`, le portail refusant de démarrer en production sans clamd), validation du
type réel par les octets d'en-tête, taille plafonnée, authentification fraîche exigée
(**R7**), et scellement asymétrique des dépôts (**R17**).

Le scellement remplace avantageusement le « chiffrement au repos » initialement prévu :
une clé posée sur le serveur n'aurait protégé que du vol de disque, puisqu'un attaquant
ayant la main sur la machine l'aurait trouvée à côté des fichiers. Ici la clé privée est
sur le poste du conseiller — voir `espace_client/depot_crypto.rs`, dupliqué à l'identique
des deux côtés.

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
CRM → portail    historique de valorisation, chaque point étiqueté cabinet / client
CRM → portail    demandes de documents
CRM → portail    publications de documents

CRM ← portail    documents déposés (puis purge côté portail)
CRM ← portail    déclarations SCPI du client (valorisation, revenus)
CRM ← portail    avoirs déclarés par le client
CRM ← portail    journal d'activité (connexions, consultations)
```

**Version de schéma** : `ESPACE_SYNC_SCHEMA_VERSION = 7` (5 = liens de rendez-vous,
6 = historique de valorisation étiqueté, 7 = nature du placement transmise). Le portail ne
compare pas cette valeur : un champ absent d'une photo ancienne doit dégrader proprement,
pas faire échouer la lecture.

**La classification des produits appartient au CRM.** Chaque ligne annonce `estImmobilier`
et `estScpi` ; le portail ne tient aucune liste de types. Ces deux caractères commandent
des champs différents — loyer et crédit d'un côté, revenu perçu de l'autre — et le second
ouvre en plus un droit, celui de déclarer sur un placement suivi par le cabinet. D'où deux
comportements opposés face à une photo antérieure au schéma 7 : `estImmobilier` absent
laisse passer, l'import du CRM revérifiant avant d'écrire ; `estScpi` absent refuse, un
refus que le client voit, plutôt que d'ouvrir le droit à n'importe quelle ligne.

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

### Levé depuis la rédaction du plan

| Sujet | Où en est-on |
|---|---|
| **Déploiement HTTPS** | Fait. Caddy, Let's Encrypt, en-têtes de sécurité, pare-feu limité à 22/80/443, le binaire n'écoute qu'en local |
| **Antivirus câblé** | Fait. `require_clamd_available` fait paniquer le binaire au démarrage en production : un portail qui accepte des dépôts sans analyse serait pire qu'un portail arrêté |
| **Formalités RGPD** | Fait. Page d'information en production avec les mentions du cabinet, registre tenu en interne, annexe des conditions Brevo valant contrat de sous-traitance |
| **Séparation des clés** | Fait. `ESPACE_AUTH_SECRET` distinct du secret de synchronisation, exigé en production. Attention : l'empreinte du code d'activation est calculée par le CRM avec le **secret de sync** — c'est avec lui qu'elle se vérifie |
| **Alerte sur nouvel appareil** | Fait. Email au client, empreinte insensible aux mises à jour de navigateur pour ne pas crier tous les mois |
| **Veille des dépendances** | Fait. `npm audit` et `cargo audit` dans `verify.ps1`, en lecture seule — pas de correction automatique |
| **Plan de réponse à incident** | Fait. `docs/ESPACE_CLIENT_INCIDENT.md`, fiche contacts nominative hors dépôt |
| **Sauvegarde et restauration** | Fait. Tâche planifiée quotidienne, contrôle d'intégrité immédiat, restauration jouée avec succès |
| **Rétention et purge des documents** | Fait. Le fichier scellé est supprimé sur accusé de réception du CRM, après comparaison d'empreinte |
| **Cloison conseiller / client** | Fait. Alertes et tâches ne quittent plus le CRM ; le portail écarte en outre celles des anciennes photos |
| **Miroir aperçu / portail** | Fait. Un seul moteur de règles, des composants partagés, un test qui compare les deux sorties (**R18**). Voir §15 : c'est la dette qui a coûté le plus cher |
| **Textes libres dans les emails** | Fait. Titres, messages et navigateur annoncé par le visiteur sont échappés avant insertion dans le HTML |

### Reste à faire

| Sujet | Pourquoi |
|---|---|
| **Délivrabilité des codes par email** | Expéditeur Gmail via Brevo, décision assumée. C'est le seul maillon dont l'échec est silencieux : noter le fournisseur de messagerie à chaque activation, et rouvrir la question du domaine authentifié au premier échec |
| **Ré-authentification à la consultation** (**R7**) | Écrite et testée, mais branchée sur rien tant que la mise à disposition de documents (phase 3) n'existe pas |
| **Test de restauration mensuel** | Une sauvegarde jamais restaurée n'est pas une sauvegarde |
| **Migration `oauth2` 4.4 → 5.0** | Seule dette technique réelle : elle fait disparaître les trois avis RUSTSEC neutralisés dans `src-tauri/.cargo/audit.toml`. Déclencheur : le jour où l'on touche à l'authentification Gmail |
| **Revue de sécurité extérieure** | Aucun regard tiers sur un service qui héberge des données patrimoniales nominatives |

### Limites assumées

- **Pas de chiffrement de bout en bout depuis le navigateur.** Les dépôts sont scellés
  au repos et le portail ne détient que la clé publique — il ne peut pas les relire. Mais
  le fichier traverse sa mémoire en clair le temps du scellement. Un chiffrement côté
  navigateur n'y changerait rien : c'est le serveur qui livre le JavaScript, donc un
  attaquant qui le contrôle sert un script modifié. La rétention courte (**R3**) reste la
  vraie parade.
- **Plusieurs sessions simultanées par client**, sans possibilité pour lui de les lister
  ou de les fermer. C'est voulu — téléphone et ordinateur —, la révocation depuis le CRM
  étant le seul levier, mais elle coupe tout d'un coup.
- **Le maillon faible n'est pas le portail.** La base du CRM est en clair sur le poste du
  conseiller, protégée par le seul chiffrement disque de l'OS, et contient tout — quand le
  portail n'en détient qu'une copie partielle et purgée.

---

## 15. Erreurs commises — à ne pas refaire

Cette section n'est pas un journal de contrition : c'est la partie du plan qui a été payée
en défauts réels, dont plusieurs n'ont été vus qu'en production. **La lire avant de toucher
à un écran client.**

### Le miroir aperçu / portail — la dette la plus coûteuse

L'onglet « Aperçu client » promet au conseiller de montrer ce que verra son client. Cette
promesse a été rompue quatre fois, de quatre manières différentes, parce que deux écrans
identiques étaient produits par deux codes distincts. Aucun test ne pouvait le voir : chaque
côté était correct de son point de vue.

| Ce qui a divergé | Comment ça s'est manifesté |
|---|---|
| **La timeline, écrite deux fois** (Rust pour le portail, TypeScript pour l'aperçu) | Le Rust transmettait des alertes internes que le TypeScript masquait. Le client recevait donc dans son JSON des notes de travail — « client injoignable », « prospect à relancer » — que l'interface avait la bonté de ne pas afficher |
| **Les échéances du conseiller** | Elles existaient côté portail et n'apparaissaient pas dans l'aperçu, qui perdait ainsi son objet : le conseiller ne pouvait pas relire ce qu'il venait d'écrire à son client |
| **Le fond de la fenêtre de détail** | Correct dans l'aperçu, **transparent chez le client**. Les variables de couleur étaient portées par `.cp-root` ; la fenêtre, elle, est rendue par `createPortal` dans `document.body` — hors de cet élément, donc sans palette. Dans l'aperçu la fenêtre reste dans le cadre du téléphone, à l'intérieur de `.cp-root` : le défaut y était invisible par construction |
| **La position de cette même fenêtre** | Centrée dans l'aperçu, ancrée en bas de l'écran sur le portail. Une fiche courte — immobilier, épargne bancaire — se tassait dans un coin quand une fiche longue paraissait centrée |

Ce qui a été mis en place en réponse est l'invariant **R18** : un seul moteur de règles
(Rust), un seul composant de rendu par élément, un test qui compare l'aperçu et la photo,
et l'obligation de nommer dans le code ce qui reste volontairement différent.

**Le piège de fond** : un défaut d'aperçu ne se voit pas en développant, puisque le
développement se fait dans l'aperçu. Toute modification d'un écran client doit être
regardée **sur le portail déployé**, pas seulement dans le CRM.

### Les autres défauts, et ce qu'ils ont appris

| Défaut | Ce qui l'a rendu possible | Règle retenue |
|---|---|---|
| **Première connexion impossible** pendant une demi-journée | La séparation des secrets : le CRM calcule l'empreinte du code d'activation avec le secret de synchronisation, le portail la vérifiait avec son nouveau secret d'authentification. Les tests des deux côtés passaient | Une empreinte se vérifie avec le secret qui l'a produite. Quand une frontière relie deux binaires, la tester d'un seul côté ne prouve rien |
| **La sauvegarde n'existait pas** alors qu'elle était écrite | `sqlite3` n'était pas installé, les scripts n'étaient pas copiés sur le serveur, et la planification n'existait qu'en commentaire | Ne jamais déclarer une tâche d'exploitation « faite » sans l'avoir déclenchée et sans avoir restauré |
| **Le script de sauvegarde absent du dépôt** | Un motif `.gitignore` destiné aux exports locaux l'avalait. Sur un clone neuf, l'installation échouait | Vérifier qu'un fichier référencé par l'installeur est bien suivi par Git |
| **404 sur l'accusé de réception SCPI** | Le CRM appelait une route que le portail déployé ne connaissait pas encore. Une adresse inconnue renvoyant la page de l'application, le CRM recevait du HTML là où il attendait du JSON | Le portail se déploie **avant** le CRM quand une route nouvelle est appelée |
| **La valeur déclarée disparaissait de l'écran du client** | L'accusé de réception partait avant la nouvelle photo : le portail cessait d'afficher la déclaration alors que la photo était encore l'ancienne | Écrire, publier, **puis** accuser. Une déclaration non accusée est réimportée sans dommage, les écritures étant idempotentes par jour |
| **Dates décalées d'un jour** | Le portail interprétait le jour civil dans le fuseau du serveur, quand le CRM classe ses valorisations par jour UTC. Une déclaration du 15 pouvait écraser une valorisation du 14 | Un jour civil est un jour **UTC**, du navigateur jusqu'à la base |
| **« 1 M€ » pour 1 004 299 €** | Une écriture compacte au-delà du million, alors que toutes les autres lignes de l'écran affichent le montant exact. Le total contredisait visiblement la somme de ses parties | Ne pas arrondir un chiffre que l'écran décompose juste en dessous |
| **Échecs d'envoi d'email avalés** | `let _ = mailer.send(...)`. Une panne de Brevo aurait laissé le conseiller ignorer qu'un client avait déclaré quelque chose, sans trace | Aucun envoi silencieux : soit journalisé en erreur, soit reproposé |
| **Deux emails pour un même événement** | La marque « déjà annoncé » était posée après l'envoi : deux synchronisations concurrentes sélectionnaient le même événement | Réserver avant d'envoyer, rendre la réservation si l'envoi échoue |
| **Antivirus déclaré injoignable alors qu'il répondait** | La réponse de `clamd` se termine par un octet nul, et le transport par défaut sous Debian est un socket local, pas un port TCP | Lire la réponse réelle du démon avant de conclure |
| **La documentation affirmait l'inverse du code** | Le README présentait ClamAV comme optionnel quand le binaire refuse de démarrer sans lui | Une affirmation de doc sur un garde-fou se vérifie dans le code |
| **Les listes de types recopiées d'un langage à l'autre** | L'ouverture de la mise à jour aux placements « à côté » a créé quatre copies de la liste immobilière — TypeScript, portail, import, et une cinquième incomplète dans un email — plus trois copies de la liste SCPI. Ces listes décident de l'enregistrement du loyer et du revenu : un type oublié d'un côté, et le montant saisi par le client disparaît sans un mot | La classification appartient au CRM et voyage dans la photo (`estImmobilier`, `estScpi`) ; le portail n'en tient aucune. Les deux listes qui restent, une par langage, sont comparées par un test qui lit les deux fichiers. À l'inverse, « placements financiers » est un **complément** et non une liste : rien ne peut y être oublié |

---

## 12. Règles du dépôt à respecter

- `src-tauri/src/database/operations.rs` est **gelé** — nouveau domaine = nouveau fichier `database/espace_client.rs`
- Logique métier hors React, dans `src/lib/<domaine>/`, testable en Vitest
- Migrations = Rust runtime (`database/mod.rs`), Drizzle (`src/lib/db/schema.ts`) tenu synchrone pour la doc
- `notify*Changed()` après toute mutation, pour rafraîchir l'UI
- Messages d'interface en français, identifiants de code en anglais
- Seuils de taille : composant `.tsx` < 300 lignes, module `.ts` < 400, module `.rs` < 600
- Tests de caractérisation **avant** tout refactor structurel
- **Un écran client ne se juge pas dans l'aperçu** : le regarder sur le portail déployé (**R18**, §15)
- Vérification : `npm run verify:quick` si seul `src/**` est touché, `npm run verify` dès que `src-tauri/**` ou `espace-portail/**` l'est — `verify.ps1` couvre les deux crates Rust et les deux projets TypeScript
- Aucune donnée nominative réelle dans les fixtures ou les tests (voir `donnees-sensibles.mdc`)
- Pas de `git commit` ni `git push` sans demande explicite

---

## 13. Feuille de route

Les cinq étapes du plan initial — déploiement HTTPS, envoi des codes, séparation des clés,
formalités RGPD, dépôt de documents — sont faites. Ce qui suit, dans cet ordre :

1. **Ouvrir l'espace à un premier vrai client, en rendez-vous.** Il n'y a plus de code à
   écrire pour cela ; ce qui manque est de l'usage. Un client de 65 ans devant l'écran
   apprendra en dix minutes ce que trois semaines de développement ne diraient pas.
2. **Surveiller la réception des codes** pendant cette phase. C'est le seul maillon dont
   l'échec est silencieux : personne ne prévient qu'un message est parti en indésirables.
   Noter le fournisseur de messagerie à chaque activation, et rouvrir la question du
   domaine authentifié au premier échec constaté.
3. **Phase 3 — documents mis à disposition.** C'est là que se branche enfin la
   ré-authentification à la consultation (**R7**), écrite et testée mais reliée à rien.
4. **Phase 4 — déclaration des avoirs extérieurs.** La tranche SCPI en donne le patron :
   saisie côté client, notification du conseiller, reprise à l'import, plafond de bon sens.
   C'est ce qui rendra le camembert honnête, puisqu'il ne montre aujourd'hui que ce que le
   cabinet connaît.
5. **Phase 5 — notifications restantes** : rappels, messages du conseiller, purge en fin de
   relation.

Dettes à traiter en chemin, sans urgence propre : le test de restauration mensuel, la
migration `oauth2` 4.4 → 5.0 le jour où l'on touche à l'authentification Gmail, et une revue
de sécurité extérieure.
