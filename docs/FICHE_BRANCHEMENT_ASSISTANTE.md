# Fiche assistante — rejoindre le CRM partagé

Cette procédure doit être exécutée séparément par chaque assistante, avec son propre compte
Microsoft 365. Compter environ 15 à 30 minutes hors téléchargement initial.

## Avant de commencer

Demander au conseiller :

- le Client ID Azure du CRM ;
- le hostname SharePoint ;
- le chemin du site ;
- l'ID Graph du site ;
- le nom du site ;
- l'Object ID du groupe conseillers ;
- l'Object ID du groupe assistantes ;
- l'adresse de la boîte cabinet.

Vérifier :

- [ ] Le conseiller a déjà activé la synchronisation équipe.
- [ ] Le CRM installé est à la même version que celui du conseiller.
- [ ] Le CRM de ce poste est vide.
- [ ] Internet fonctionne.
- [ ] La connexion Microsoft 365 avec MFA fonctionne dans le navigateur.
- [ ] BitLocker ou FileVault est activé.

## Étape 1 — Installer et ouvrir le CRM

1. Installer le CRM :
   - Windows : installateur `.exe` ;
   - macOS : ouvrir le `.dmg`, puis copier l'application dans **Applications**.
2. Ouvrir le CRM.
3. Créer le mot de passe de verrouillage local demandé au premier lancement.
4. Ne pas importer de sauvegarde et ne copier aucun fichier `.db`.

Résultat attendu : le CRM s'ouvre avec une base vide.

**STOP** si des contacts ou investissements existent déjà : prévenir le conseiller et ne pas
cliquer sur **Rejoindre sur ce poste**.

## Étape 2 — Ouvrir le panneau équipe

1. Cliquer sur **Paramètres** dans la barre latérale.
2. Ouvrir **Intégrations**.
3. Descendre jusqu'à **Mode équipe SharePoint**.

Résultat attendu : le panneau affiche la connexion Microsoft et les champs SharePoint.

## Étape 3 — Enregistrer le Client ID

1. Coller la valeur reçue dans **Client ID Azure (application CRM)**.
2. Vérifier qu'il s'agit d'un UUID complet, sans espace avant ou après.
3. Cliquer sur **Enregistrer Client ID**.

Résultat attendu : confirmation **Client ID Microsoft enregistré**.

Si le bouton **Connecter Microsoft** reste indisponible, contrôler le Client ID avec le conseiller.

## Étape 4 — Connecter son compte Microsoft

1. Cliquer sur **Connecter Microsoft**.
2. Le navigateur s'ouvre.
3. Choisir son compte professionnel nominatif.
4. Saisir son propre mot de passe Microsoft.
5. Valider la MFA.
6. Accepter les autorisations déjà approuvées par l'administrateur.
7. Revenir au CRM sans fermer l'application.

Résultat attendu : le panneau affiche l'adresse Microsoft personnelle de l'assistante.

**STOP** si l'adresse affichée est celle du conseiller, de la boîte cabinet ou d'une autre
assistante : cliquer sur **Déconnecter** tant que l'action est disponible et recommencer avec le
bon compte.

## Étape 5 — Saisir la configuration reçue

1. Activer **Activer le mode équipe SharePoint**.
2. Dans **Rôle sur cette installation**, choisir **Secrétaire**.
3. Coller l'Object ID dans **Groupe Entra — conseillers**.
4. Coller l'Object ID dans **Groupe Entra — secrétaires**.
5. Saisir l'adresse dans **Boîte cabinet Microsoft 365**.
6. Saisir le domaine dans **Hostname SharePoint**, sans `https://`.
7. Saisir le chemin dans **Chemin du site**, avec `/sites/` au début.
8. Saisir l'**ID site Graph** complet.
9. Saisir le **Nom / espace d'équipe**.
10. Relire chaque valeur avec la fiche transmise.
11. Cliquer sur **Enregistrer la configuration équipe**.

Résultat attendu :

- confirmation **Configuration équipe enregistrée** ;
- message indiquant que la configuration est verrouillée en mode secrétaire ;
- rôle Microsoft reconnu comme secrétaire.

### Si l'identité est refusée

- **Compte dans aucun groupe** : demander à l'administrateur d'ajouter le compte au groupe
  assistantes.
- **Compte dans les deux groupes** : demander son retrait immédiat du groupe conseillers.
- Attendre quelques minutes après une modification Entra, puis relancer la connexion.

Ne jamais modifier les groupes ou choisir **Conseiller** pour contourner une erreur : Entra fait
foi et l'accès restera bloqué.

## Étape 6 — Rejoindre l'espace équipe

1. Vérifier que le conseiller n'est pas en train de migrer ou reconstruire le cache.
2. Cliquer sur **Rejoindre sur ce poste**.
3. Lire la confirmation.
4. Confirmer le téléchargement.
5. Laisser le CRM ouvert et connecté à Internet.
6. Ne pas éteindre le poste pendant l'opération.

Résultat attendu :

- message **Espace équipe rejoint** ;
- nombre d'enregistrements téléchargés ;
- contacts et dossiers visibles ;
- absence de bannière ambre ;
- synchronisation automatique active.

**STOP** en cas d'erreur. Copier le message exact et l'envoyer au conseiller ; ne pas supprimer
manuellement les fichiers du CRM.

## Étape 7 — Contrôles obligatoires

Avec le conseiller :

1. Comparer le nombre de contacts affiché.
2. Créer un contact fictif portant un nom générique.
3. Attendre au maximum 10 à 20 secondes.
4. Faire vérifier son apparition sur le poste conseiller.
5. Faire modifier ce contact par le conseiller.
6. Vérifier la modification sur le poste assistante.
7. Ouvrir simultanément la même fiche sur deux postes :
   - un poste peut modifier ;
   - l'autre doit voir le verrou ou rester en lecture seule.
8. Ajouter puis ouvrir un document fictif sur un autre poste.
9. Envoyer un email fictif :
   - **Envoyer depuis** doit proposer uniquement **Cabinet (...)** ;
   - le destinataire doit voir l'adresse de la boîte cabinet.
10. Vérifier que les exports et archives complètes sont indisponibles.
11. Verrouiller puis déverrouiller le CRM.

Ne pas utiliser de données réelles tant qu'un de ces contrôles échoue.

## Usage quotidien

1. Ouvrir le CRM avec son mot de passe local.
2. Vérifier l'absence de bannière ambre avant de modifier des données.
3. Laisser Internet actif.
4. Respecter les messages de verrouillage des fiches.
5. Attendre la synchronisation avant d'éteindre le poste.
6. Résoudre ou signaler immédiatement tout conflit.
7. Envoyer les emails depuis **Cabinet (...)**.
8. Verrouiller le CRM dès que le poste est laissé sans surveillance.

Ne jamais :

- travailler volontairement hors ligne ;
- partager son compte Microsoft ;
- copier la base locale ;
- placer la base dans OneDrive ou SharePoint ;
- supprimer les fichiers du cache ;
- tenter de contourner l'interdiction d'export.

## Dépannage rapide

### Le bouton Rejoindre est grisé

Contrôler :

- compte Microsoft connecté ;
- configuration enregistrée ;
- ID Graph renseigné ;
- rôle secrétaire reconnu ;
- synchronisation déjà activée par le conseiller.

### Accès SharePoint refusé

Envoyer au conseiller le message exact. L'administrateur doit vérifier :

- l'accès personnel au site ;
- le consentement `Sites.Selected` ;
- le grant `write` de l'application sur ce site.

### L'envoi cabinet échoue

L'administrateur doit vérifier **Full Access**, **Send As** et `Mail.Send.Shared`. Les droits
Exchange peuvent demander jusqu'à 60 minutes pour se propager.

### Une bannière indique que la synchronisation est suspendue

1. Arrêter les modifications.
2. Vérifier Internet.
3. Ouvrir les paramètres équipe.
4. Copier le message exact.
5. Contacter le conseiller.

### Le cache équipe est absent

Utiliser **Restaurer le cache équipe** si le bouton est proposé sur l'écran de déverrouillage.
Sinon, contacter le conseiller. Ne restaurer aucune ancienne base manuellement.

## Validation finale

- [ ] Mon adresse Microsoft nominative est affichée.
- [ ] Mon rôle effectif est secrétaire.
- [ ] Je vois les dossiers partagés.
- [ ] Une création se synchronise vers le conseiller.
- [ ] Une modification du conseiller revient sur mon poste.
- [ ] Le verrou d'édition fonctionne.
- [ ] Un document fictif est lisible.
- [ ] L'email cabinet fonctionne.
- [ ] Les exports sont indisponibles.
- [ ] Le verrouillage et le redémarrage fonctionnent.
- [ ] Je sais reconnaître et signaler une bannière de synchronisation.

Nom de l'assistante : ____________________________________

Date du branchement : ____________________________________

Validation assistante : __________________________________

Validation conseiller : __________________________________

