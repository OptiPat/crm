# Checklist pilote — décision GO/STOP du mode équipe

Cette recette doit être exécutée avec le conseiller et les deux assistantes avant d'utiliser des
données réelles.

Règle de décision :

- **GO** : tous les contrôles obligatoires sont réussis, aucune erreur non expliquée et aucune
  donnée perdue ;
- **STOP** : un seul contrôle obligatoire échoue. Ne pas contourner l'échec et ne pas basculer les
  données réelles.

## 1. Identification du pilote

- Version CRM : __________________________________________
- Date : __________________________________________________
- Conseiller : ____________________________________________
- Assistante 1 : __________________________________________
- Assistante 2 : __________________________________________
- Site SharePoint : _______________________________________
- Administrateur Microsoft 365 : __________________________

Utiliser uniquement des identités et données fictives dans les scénarios ci-dessous.

## 2. Précontrôles Microsoft 365

- [ ] MFA validée pour les trois comptes.
- [ ] Conseiller dans le seul groupe conseillers.
- [ ] Deux assistantes dans le seul groupe assistantes.
- [ ] Les trois utilisateurs ouvrent le site SharePoint.
- [ ] L'application possède `Sites.Selected`.
- [ ] Le site accorde le rôle `write` à l'application CRM.
- [ ] Les listes `CRM_Data`, `CRM_Sequences`, `CRM_Locks`, `CRM_Presence`, `CRM_Audit` et
      `CRM_Members` existent.
- [ ] La bibliothèque **Documents** existe.
- [ ] Les trois comptes possèdent Full Access et Send As sur la boîte cabinet.

Résultat : ☐ GO ☐ STOP

Observations : ________________________________________________________________________________

## 3. Installation et identité

Sur chaque poste :

- [ ] Même version du CRM.
- [ ] BitLocker ou FileVault actif.
- [ ] Compte Microsoft nominatif correct affiché dans le CRM.
- [ ] Conseiller reconnu comme conseiller.
- [ ] Assistantes reconnues comme secrétaires.
- [ ] Aucun compte dans deux groupes.
- [ ] Aucun poste assistante initialisé avec une ancienne base.
- [ ] Verrouillage local et redémarrage réussis.

Résultat : ☐ GO ☐ STOP

## 4. Migration et intégrité

Sur le poste conseiller :

- [ ] Sauvegarde historique créée avant migration.
- [ ] Aperçu de migration sans erreur.
- [ ] Checksum SHA-256 conservé.
- [ ] Copie test SharePoint terminée sans échec.
- [ ] Restauration test valide.
- [ ] `integrity_check` SQLite valide.
- [ ] Clés étrangères valides.
- [ ] Synchronisation équipe activée.
- [ ] Base historique toujours présente et non modifiée.

Résultat : ☐ GO ☐ STOP

## 5. Créations simultanées et identifiants

1. Le conseiller crée un contact fictif.
2. L'assistante 1 crée en même temps un deuxième contact.
3. L'assistante 2 crée un troisième contact.

Contrôles :

- [ ] Les trois créations réussissent.
- [ ] Les trois contacts possèdent des identifiants distincts.
- [ ] Chaque contact apparaît sur les trois postes sous 20 secondes.
- [ ] Aucun doublon n'apparaît après deux cycles supplémentaires.
- [ ] Aucun message de plage d'identifiants épuisée.

Résultat : ☐ GO ☐ STOP

## 6. Modifications et verrouillage

1. Ouvrir la même fiche sur deux postes.
2. Commencer une modification sur le premier.
3. Essayer de modifier sur le second.

Contrôles :

- [ ] Un seul poste peut enregistrer.
- [ ] L'autre poste reste en lecture seule ou affiche clairement le détenteur du verrou.
- [ ] La perte du verrou referme le formulaire modifiable.
- [ ] Après libération, l'autre poste peut acquérir le verrou.
- [ ] Aucun changement n'est écrasé silencieusement.

Résultat : ☐ GO ☐ STOP

## 7. Conflit volontaire

1. Modifier le même enregistrement depuis deux postes selon le scénario prévu.
2. Attendre la détection du conflit.

Contrôles :

- [ ] Le conflit est visible dans les paramètres équipe.
- [ ] **Version SharePoint** applique la version distante.
- [ ] Un deuxième conflit permet de tester **Conserver ma version**.
- [ ] Le conflit disparaît après résolution et synchronisation.
- [ ] La version choisie devient identique sur les trois postes.
- [ ] L'action apparaît dans l'audit.

Résultat : ☐ GO ☐ STOP

## 8. Coupure réseau

1. Synchroniser complètement l'assistante 1.
2. Couper sa connexion réseau.
3. Attendre plus de 45 secondes.
4. Essayer de modifier une donnée.

Contrôles :

- [ ] L'écriture locale est refusée.
- [ ] Le message explique que la synchronisation est indisponible.
- [ ] Aucune modification fantôme n'apparaît dans l'interface.
- [ ] Après retour du réseau, la synchronisation reprend.
- [ ] Les données distantes reçues ne créent pas de doublon.

Résultat : ☐ GO ☐ STOP

## 9. Documents

1. Ajouter un petit document fictif sur un poste.
2. Attendre la synchronisation.
3. L'ouvrir sur les deux autres postes.
4. Comparer le contenu.

Contrôles :

- [ ] Le document se télécharge à la demande.
- [ ] Son empreinte SHA-256 est validée.
- [ ] Aucun chemin local Windows/macOS n'est publié dans SharePoint.
- [ ] Le document reste accessible après redémarrage et resynchronisation.
- [ ] Le cache documentaire local est purgé au verrouillage.
- [ ] Une suppression se propage sans supprimer un autre document.

Résultat : ☐ GO ☐ STOP

## 10. Emails

Depuis une assistante :

- [ ] Seule l'option **Cabinet (...)** est proposée.
- [ ] Le message est reçu avec l'adresse cabinet comme expéditeur.
- [ ] Une tentative d'adresse personnelle est refusée.

Depuis le conseiller :

- [ ] L'adresse personnelle est proposée si elle est configurée.
- [ ] L'adresse cabinet est également proposée.
- [ ] Une réponse issue de Gmail envoyée par la boîte cabinet est explicitement traitée comme un
      nouveau message, sans faux threading.

Résultat : ☐ GO ☐ STOP

## 11. Restrictions assistantes

Sur chaque poste assistante :

- [ ] Export contacts indisponible.
- [ ] Export investissements indisponible.
- [ ] Archive ou sauvegarde complète indisponible.
- [ ] Répertoire de sauvegarde externe non modifiable.
- [ ] Configuration d'équipe verrouillée.
- [ ] Désactivation locale du mode équipe impossible.
- [ ] Les fonctions CRM normales hors export restent utilisables.

Résultat : ☐ GO ☐ STOP

## 12. Révocation

Avec un compte de test assistante :

1. Retirer temporairement le compte du groupe assistantes.
2. Attendre le prochain contrôle d'identité.

Contrôles :

- [ ] L'identité n'est plus autorisée.
- [ ] Les nouvelles écritures SQLite sont refusées.
- [ ] Les opérations sensibles sont bloquées.
- [ ] La bannière d'autorité est visible.
- [ ] Après réintégration contrôlée au groupe, l'accès revient sans altération de données.

Résultat : ☐ GO ☐ STOP

## 13. Fermeture, scellement et récupération

- [ ] Verrouiller chaque poste.
- [ ] Vérifier qu'aucune base équipe claire ne reste exploitable après fermeture normale.
- [ ] Redémarrer les trois CRM.
- [ ] Vérifier l'intégrité et la reprise de synchronisation.
- [ ] Sur un poste de test, exécuter **Reconstruire le cache depuis SharePoint** sans modification
      en attente.
- [ ] Vérifier les compteurs après reconstruction.
- [ ] Vérifier qu'une reconstruction est refusée en présence d'une modification locale en attente.

Résultat : ☐ GO ☐ STOP

## 14. Audit et présence

- [ ] Les trois personnes apparaissent avec leur identité nominative.
- [ ] Les actions partagées récentes sont visibles.
- [ ] Les créations, modifications, suppressions, emails et conflits testés sont attribuables.
- [ ] Aucun token, chemin local ou contenu sensible n'apparaît dans les messages d'erreur.

Résultat : ☐ GO ☐ STOP

## 15. Décision finale

Nombre de sections en GO : ______ / 13

Anomalies restantes :

________________________________________________________________________________________________

________________________________________________________________________________________________

Décision :

- [ ] **GO** — toutes les sections sont validées ; le passage aux données réelles est autorisé.
- [ ] **STOP** — au moins une anomalie subsiste ; le mode équipe ne doit pas être utilisé en
      production.

Validation administrateur Microsoft 365 :

- Nom : __________________________________
- Date : __________________________________
- Signature : _____________________________

Validation conseiller :

- Nom : __________________________________
- Date : __________________________________
- Signature : _____________________________

Validation assistante 1 :

- Nom : __________________________________
- Date : __________________________________
- Signature : _____________________________

Validation assistante 2 :

- Nom : __________________________________
- Date : __________________________________
- Signature : _____________________________

