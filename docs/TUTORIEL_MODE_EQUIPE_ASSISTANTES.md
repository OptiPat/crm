# Brancher un conseiller et ses assistantes au mode équipe SharePoint

Ce guide décrit la configuration d'un conseiller et de deux assistantes, chacune avec son propre
compte Microsoft 365 et sa propre installation du CRM.

## 1. Répartition des tâches

- **Administrateur Microsoft 365** : comptes, MFA, groupes Entra, application Entra, site
  SharePoint, autorisation `Sites.Selected` et boîte partagée.
- **Conseiller** : sauvegarde, configuration du CRM, provisionnement SharePoint, migration puis
  activation de la synchronisation.
- **Chaque assistante** : installation sur un poste vide, connexion avec son compte nominatif puis
  téléchargement du cache partagé.

Ne jamais utiliser le compte du conseiller sur le poste d'une assistante.

## 2. Préparer les trois postes

1. Mettre à jour le CRM sur les trois postes avec la même version.
2. Activer BitLocker sous Windows ou FileVault sous macOS.
3. Vérifier que chaque personne possède une session Windows/macOS personnelle protégée.
4. Conserver la base historique uniquement sur le poste du conseiller.
5. Les postes des assistantes doivent partir d'un CRM vide : ne pas y copier
   `patrimoine-crm.db`.
6. Ne jamais placer un fichier SQLite du CRM dans un dossier SharePoint ou OneDrive synchronisé.

## 3. Créer les comptes et imposer la MFA

Dans le centre d'administration Microsoft 365 :

1. Créer ou vérifier trois comptes professionnels nominatifs :
   - le conseiller ;
   - l'assistante 1 ;
   - l'assistante 2.
2. Attribuer à chacun une licence donnant accès à SharePoint Online et Exchange Online.
3. Activer la MFA avec les règles de sécurité ou l'accès conditionnel du tenant.
4. Faire tester une connexion à `https://portal.office.com` par chaque personne.

Le CRM ne contrôle pas lui-même la MFA : elle doit être imposée par Microsoft Entra.

## 4. Créer les groupes de rôles Entra

Dans **Microsoft Entra admin center → Identity → Groups → All groups** :

1. Créer un groupe de sécurité `CRM - Conseillers`.
2. Créer un groupe de sécurité `CRM - Assistantes`.
3. Ouvrir chaque groupe et copier son **Object ID**.
4. Ajouter uniquement le conseiller à `CRM - Conseillers`.
5. Ajouter les deux assistantes à `CRM - Assistantes`.
6. Vérifier qu'aucune personne n'appartient aux deux groupes.

Conserver les deux UUID : ils seront saisis sur les trois installations du CRM.

## 5. Créer le site SharePoint

1. Créer un site dédié, par exemple :
   `https://cabinet.sharepoint.com/sites/crm-patrimoine`.
2. Ajouter le conseiller et les deux assistantes comme membres du site.
3. Noter :
   - le hostname : `cabinet.sharepoint.com` ;
   - le chemin : `/sites/crm-patrimoine`.
4. Vérifier que les trois utilisateurs ouvrent le site dans leur navigateur.

Ne pas créer manuellement les listes `CRM_*` : le conseiller les provisionnera depuis le CRM.

## 6. Créer l'application Microsoft Entra du CRM

Dans **Microsoft Entra admin center → App registrations → New registration** :

1. Nommer l'application `Patrimoine CRM`.
2. Choisir les comptes de cet annuaire organisationnel.
3. Dans **Authentication**, ajouter la plateforme **Mobile and desktop applications**.
4. Ajouter exactement l'URI de redirection :
   `http://127.0.0.1:3847/callback`.
5. Autoriser les flux clients publics. Le CRM utilise OAuth PKCE et aucun secret client.
6. Dans **API permissions → Microsoft Graph → Delegated permissions**, ajouter :
   - `User.Read` ;
   - `GroupMember.Read.All` ;
   - `Sites.Selected` ;
   - `Mail.Send.Shared` ;
   - `offline_access` ;
   - `openid` ;
   - `email`.
7. Accorder le consentement administrateur au tenant.
8. Copier l'**Application (client) ID**.

Le Client ID est une valeur publique de configuration. Ne jamais créer ni transmettre de secret
client pour le CRM desktop.

## 7. Autoriser l'application uniquement sur le site CRM

Le consentement à `Sites.Selected` ne donne encore accès à aucun site. Un administrateur doit
accorder explicitement l'application au site CRM.

### 7.1 Obtenir l'ID Graph du site

Avec Microsoft Graph Explorer, connecté comme administrateur SharePoint ou administrateur global :

```http
GET https://graph.microsoft.com/v1.0/sites/cabinet.sharepoint.com:/sites/crm-patrimoine
```

Copier la propriété `id`, par exemple :

```text
cabinet.sharepoint.com,GUID-SITE,GUID-WEB
```

### 7.2 Accorder temporairement le rôle `manage`

L'administrateur qui exécute cette opération doit consentir `Sites.FullControl.All` dans Graph
Explorer. Cette permission sert à administrer le grant ; elle ne doit pas être ajoutée à
l'application CRM.

```http
POST https://graph.microsoft.com/v1.0/sites/{ID-DU-SITE}/permissions
Content-Type: application/json
```

```json
{
  "roles": ["manage"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "CLIENT-ID-DU-CRM",
        "displayName": "Patrimoine CRM"
      }
    }
  ]
}
```

Conserver l'`id` de la permission retournée. Le rôle `manage` est nécessaire pendant la création
des listes et de leurs colonnes.

### 7.3 Réduire à `write` après le provisionnement

Après l'étape 11 de ce guide :

1. Lister les permissions :

```http
GET https://graph.microsoft.com/v1.0/sites/{ID-DU-SITE}/permissions
```

2. Supprimer le grant `manage` de l'application CRM :

```http
DELETE https://graph.microsoft.com/v1.0/sites/{ID-DU-SITE}/permissions/{ID-PERMISSION}
```

3. Recréer le même grant avec `"roles": ["write"]`.
4. Relancer **Tester SharePoint** dans le CRM.

Documentation Microsoft de référence :
`https://learn.microsoft.com/graph/permissions-selected-overview`.

## 8. Créer la boîte partagée du cabinet

Dans **Microsoft 365 admin center → Teams & groups → Shared mailboxes** :

1. Créer la boîte, par exemple `cabinet@example.com`.
2. Ouvrir **Manage mailbox permissions**.
3. Accorder au conseiller et aux deux assistantes :
   - **Read and manage / Full Access** ;
   - **Send As**.
4. Ne pas utiliser **Send on behalf** : le destinataire doit voir uniquement l'adresse du cabinet.
5. Attendre jusqu'à 60 minutes pour la propagation Exchange.

La boîte partagée n'est pas un compte de connexion au CRM. Chaque utilisateur reste connecté avec
son compte nominatif.

## 9. Préparer la fiche de configuration

Rassembler les valeurs suivantes :

- Client ID de l'application Entra ;
- hostname SharePoint ;
- chemin du site ;
- ID Graph du site ;
- nom lisible du site ;
- Object ID du groupe conseillers ;
- Object ID du groupe assistantes ;
- adresse de la boîte partagée.

Transmettre cette fiche par un canal interne sécurisé aux deux assistantes.

## 10. Configurer le poste du conseiller

1. Ouvrir le CRM contenant la base historique.
2. Créer une sauvegarde manuelle dans
   **Paramètres → Données & technique → Sauvegardes & maintenance**.
3. Ouvrir **Paramètres → Intégrations → Mode équipe SharePoint**.
4. Coller le **Client ID Azure (application CRM)**.
5. Cliquer sur **Enregistrer Client ID**.
6. Cliquer sur **Connecter Microsoft**.
7. Se connecter avec le compte nominatif du conseiller et valider la MFA.
8. Activer **Activer le mode équipe SharePoint**.
9. Choisir **Conseiller** dans **Rôle sur cette installation**.
10. Renseigner les groupes Entra, la boîte cabinet, le hostname et le chemin SharePoint.
11. Cliquer sur **Enregistrer la configuration équipe**.

Le rôle effectif vient des groupes Entra ; le sélecteur local ne permet pas de s'octroyer des
droits supplémentaires.

## 11. Tester et provisionner SharePoint

Sur le poste du conseiller :

1. Cliquer sur **Tester SharePoint**.
2. Vérifier que le test affiche le site, le nombre de listes et les bibliothèques.
3. Vérifier que **ID site Graph** et **Nom / espace d'équipe** sont remplis.
4. Enregistrer à nouveau la configuration.
5. Cliquer sur **Provisionner listes CRM**.
6. Attendre le message confirmant le provisionnement.
7. Dans SharePoint, vérifier la présence de :
   - `CRM_Members` ;
   - `CRM_Presence` ;
   - `CRM_Locks` ;
   - `CRM_Audit` ;
   - `CRM_Data` ;
   - `CRM_Sequences`.
8. Vérifier également la bibliothèque native **Documents**.
9. Demander à l'administrateur de remplacer le grant `manage` par `write`, comme expliqué en 7.3.
10. Relancer **Tester SharePoint**.

## 12. Migrer la base historique

Toujours sur le poste du conseiller :

1. Cliquer sur **Préparer la migration**.
2. Contrôler le nombre d'enregistrements, les tables et le checksum SHA-256.
3. Lire tous les avertissements ; ne pas continuer en cas d'erreur.
4. Cliquer sur **Envoyer la copie test vers SharePoint**.
5. Vérifier que le rapport est terminé, sans échec.
6. Cliquer sur **Valider la restauration test**.
7. Vérifier :
   - checksum OK ;
   - intégrité SQLite OK ;
   - clés étrangères OK.
8. Cliquer sur **Activer la synchronisation équipe**.
9. Ne pas fermer le CRM pendant l'activation.
10. Vérifier le message **Cache équipe actif** et l'absence de bannière d'erreur.

La base historique reste conservée. Le cache équipe est séparé et scellé lorsqu'on verrouille ou
ferme le CRM.

## 13. Brancher chaque assistante

Répéter ces étapes séparément sur les deux postes.

1. Installer exactement la même version du CRM.
2. Démarrer avec un CRM vide et créer le mot de passe de verrouillage local.
3. Ouvrir **Paramètres → Intégrations → Mode équipe SharePoint**.
4. Coller le Client ID puis cliquer sur **Enregistrer Client ID**.
5. Cliquer sur **Connecter Microsoft**.
6. Se connecter avec le compte nominatif de l'assistante et valider la MFA.
7. Activer **Activer le mode équipe SharePoint**.
8. Choisir **Secrétaire** dans **Rôle sur cette installation**.
9. Saisir exactement les valeurs de la fiche de configuration, notamment l'ID Graph du site.
10. Cliquer sur **Enregistrer la configuration équipe**.
11. Vérifier que la configuration devient verrouillée pour ce rôle.
12. Cliquer sur **Rejoindre sur ce poste**.
13. Confirmer le téléchargement du CRM partagé.
14. Attendre le message indiquant le nombre d'enregistrements téléchargés.
15. Fermer puis rouvrir le CRM et vérifier que le déverrouillage fonctionne.

Si le CRM indique que le poste contient déjà des données, ne pas forcer : repartir d'une
installation locale vide.

## 14. Vérifier le fonctionnement avant les données réelles

Effectuer ce test avec des données fictives :

1. L'assistante 1 crée un contact fictif.
2. Le conseiller vérifie son apparition sous 10 secondes.
3. L'assistante 2 modifie ce contact.
4. Le conseiller vérifie la propagation.
5. Deux postes ouvrent ensuite la même fiche :
   - un poste obtient le verrou d'édition ;
   - l'autre doit rester en lecture seule.
6. Provoquer volontairement une modification concurrente et tester :
   - **Version SharePoint** ;
   - **Conserver ma version**.
7. Ajouter un document fictif, l'ouvrir sur un deuxième poste et vérifier son contenu.
8. Depuis une assistante, envoyer un email fictif :
   - l'expéditeur disponible doit être uniquement **Cabinet (...)** ;
   - le destinataire doit voir l'adresse du cabinet.
9. Depuis le conseiller, vérifier le choix entre l'adresse personnelle et l'adresse du cabinet.
10. Vérifier qu'une assistante ne peut lancer aucun export contacts, investissements, archive ou
    sauvegarde complète.
11. Verrouiller les trois CRM, puis les rouvrir.
12. Vérifier **Dernières actions partagées** dans les paramètres équipe.

Ne basculer les données réelles qu'après réussite de tous ces contrôles.

## 15. Usage quotidien

- Laisser Internet actif : la synchronisation s'exécute environ toutes les 10 secondes.
- Attendre la synchronisation avant d'éteindre un poste.
- Ne pas modifier hors ligne.
- En cas de bannière ambre, ouvrir les paramètres équipe avant de poursuivre.
- Résoudre les conflits avant une reconstruction.
- Verrouiller le CRM lorsqu'on quitte le poste.
- Ne jamais copier le cache SQLite équipe entre les postes.

## 16. Retirer une assistante

L'administrateur Microsoft 365 doit :

1. retirer la personne du groupe `CRM - Assistantes` ;
2. retirer **Full Access** et **Send As** de la boîte partagée ;
3. révoquer ses sessions Microsoft si le départ est immédiat ;
4. retirer son accès au site SharePoint ;
5. récupérer le poste puis désinstaller le CRM ou supprimer le profil utilisateur conformément à
   la politique informatique.

Le CRM bloque les écritures dès que l'autorité Entra actualisée ne reconnaît plus le compte.

## 17. Reconstruire un cache

Sur un poste conseiller dont la synchronisation est active :

1. vérifier qu'il n'existe aucune modification en attente ni conflit ;
2. ouvrir le panneau du mode équipe ;
3. cliquer sur **Reconstruire le cache depuis SharePoint** ;
4. confirmer ;
5. contrôler le nombre d'enregistrements et les plages d'identifiants restaurés.

Si le cache local est absent mais l'enrôlement du poste est encore valide, l'écran de
déverrouillage propose **Restaurer le cache équipe**.

## 18. Dépannage

- **Compte dans les deux groupes** : retirer l'utilisateur de l'un des groupes Entra.
- **Compte dans aucun groupe** : corriger l'appartenance puis attendre la propagation Entra.
- **Accès SharePoint refusé** : vérifier le consentement `Sites.Selected` et le grant du site.
- **Provisionnement refusé** : remettre temporairement le rôle `manage`.
- **Envoi cabinet refusé** : vérifier `Mail.Send.Shared`, Full Access, Send As et attendre la
  propagation Exchange.
- **Bouton Rejoindre indisponible** : vérifier connexion Microsoft, ID Graph et configuration
  enregistrée.
- **Synchronisation suspendue** : vérifier Internet, OAuth et conflits.
- **Cache incohérent** : ne supprimer aucun fichier au hasard ; utiliser la reconstruction depuis
  SharePoint.
- **Port OAuth 3847 occupé** : fermer toute autre instance du CRM puis recommencer la connexion.

## 19. Checklist finale

### Administrateur

- [ ] Trois comptes nominatifs licenciés et protégés par MFA
- [ ] Deux groupes Entra distincts avec appartenances exclusives
- [ ] Site SharePoint dédié et accessible aux trois personnes
- [ ] Application publique Entra et redirect URI `127.0.0.1:3847`
- [ ] Permissions Graph déléguées consenties
- [ ] Grant `Sites.Selected` limité au site, passé de `manage` à `write`
- [ ] Boîte partagée avec Full Access et Send As

### Conseiller

- [ ] Sauvegarde historique créée
- [ ] Test SharePoint réussi
- [ ] Six listes provisionnées
- [ ] Copie test envoyée
- [ ] Restauration test validée
- [ ] Synchronisation activée

### Chaque assistante

- [ ] Installation vide et à la même version
- [ ] Compte Microsoft nominatif connecté
- [ ] Configuration équipe enregistrée
- [ ] Espace rejoint
- [ ] Synchronisation, documents et email cabinet testés
- [ ] Exports effectivement indisponibles

