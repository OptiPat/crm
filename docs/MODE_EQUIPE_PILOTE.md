# Pilote du mode équipe SharePoint

Le mode équipe ne doit pas être activé sur des données réelles avant validation de
ce pilote. Le mode individuel reste le fonctionnement par défaut.

## Prérequis Microsoft 365

- un compte nominatif avec MFA par utilisateur ;
- un site SharePoint dédié au CRM ;
- un groupe Entra pour les conseillers et un groupe pour les secrétaires ;
- une boîte Microsoft 365 partagée pour l’adresse du cabinet ;
- l’application Entra configurée en client public avec PKCE ;
- les permissions déléguées `Sites.Selected`, `GroupMember.Read.All` et
  `Mail.Send.Shared`, consenties par un administrateur ;
- le rôle `manage` accordé explicitement à l’application sur le seul site CRM
  pendant le provisionnement des listes, puis ramené à `write` en exploitation ;
- BitLocker activé sur Windows et FileVault activé sur macOS.

La permission effective est l’intersection des droits de l’application sur le site
et des droits propres de l’utilisateur. Un compte partagé ne doit jamais servir à
ouvrir le CRM.

## Préparation

1. Sauvegarder et contrôler la base historique du conseiller.
2. Utiliser exclusivement une copie anonymisée pour le premier essai.
3. Provisionner les listes techniques et contrôler la bibliothèque « Documents » du site.
4. Migrer la copie, comparer les compteurs et valider l’intégrité SQLite.
5. Initialiser un cache distinct sur chaque poste secrétaire.
6. Conserver la base historique intacte et hors de tout dossier synchronisé.

## Scénarios obligatoires

- connexion et reconnexion OAuth sur un Mac et deux postes Windows ;
- création simultanée de contacts et d’investissements depuis deux postes ;
- modification concurrente d’une même fiche et résolution des deux versions ;
- perte d’un verrou pendant une édition ;
- coupure réseau, blocage des écritures puis reprise de la synchronisation ;
- fermeture forcée entre l’écriture locale et l’acquittement SharePoint ;
- suppression concurrente d’un parent et d’un enfant ;
- téléchargement, modification et suppression d’un document ;
- verrouillage/fermeture avec un document non encore envoyé, puis reprise sans perte ;
- absence de chemin local dans `CRM_Data` et purge de `documents/_team_cache` au verrouillage ;
- envoi depuis la boîte partagée par chaque secrétaire ;
- vérification que la boîte personnelle du conseiller reste inaccessible ;
- exécution unique des automatisations avec plusieurs postes ouverts ;
- révocation d’un membre Entra pendant une session ;
- refus de tous les exports et sauvegardes pour une secrétaire ;
- reconstruction d’un cache local et restauration contrôlée par le conseiller ;
- contrôle du journal SharePoint et des versions natives.

## Critères de validation

- aucune perte, duplication ou collision d’identifiants ;
- aucune modification silencieusement écrasée ;
- aucune donnée réelle dans les journaux techniques ou fichiers de test ;
- base historique inchangée après migration ;
- cache local reconstructible depuis SharePoint ;
- tests TypeScript, Rust et builds Mac/Windows entièrement verts ;
- validation écrite du conseiller avant la bascule de production.

## Limites assumées

- l’interdiction d’export bloque les fonctions du CRM, pas les captures d’écran ni
  la recopie manuelle de données consultables ;
- SharePoint et Microsoft Graph imposent Internet, des quotas et une cohérence
  éventuellement différée ;
- Google Drive, Dropbox, iCloud et OneDrive personnel peuvent héberger des
  documents, mais ne remplacent pas les listes SharePoint pour les données,
  versions, verrous et journaux du CRM ;
- OneDrive Entreprise et Teams reposent sur SharePoint et peuvent utiliser la même
  architecture documentaire.
