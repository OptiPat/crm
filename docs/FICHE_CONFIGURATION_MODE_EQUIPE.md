# Fiche de configuration — mode équipe SharePoint

À compléter par l'administrateur Microsoft 365 et le conseiller avant de toucher aux postes des
assistantes.

Cette fiche ne contient normalement aucun secret : le Client ID, les Object ID et l'ID du site
sont des identifiants techniques. Ne jamais y inscrire de mot de passe, token OAuth ou clé privée.

## 1. Personnes et postes

- Conseiller :
  - nom : ______________________________________________
  - email Microsoft 365 : _______________________________
  - système : ☐ Windows ☐ macOS
- Assistante 1 :
  - nom : ______________________________________________
  - email Microsoft 365 : _______________________________
  - système : ☐ Windows ☐ macOS
- Assistante 2 :
  - nom : ______________________________________________
  - email Microsoft 365 : _______________________________
  - système : ☐ Windows ☐ macOS

Contrôles :

- [ ] Chaque personne dispose de son propre compte Microsoft 365.
- [ ] La MFA est activée et testée sur les trois comptes.
- [ ] Chaque compte possède SharePoint Online et Exchange Online.
- [ ] BitLocker ou FileVault est activé sur les trois postes.
- [ ] Les deux postes assistantes contiennent un CRM vide.

## 2. Groupes Microsoft Entra

- Groupe conseillers :
  - nom : ______________________________________________
  - Object ID : _________________________________________
- Groupe assistantes :
  - nom : ______________________________________________
  - Object ID : _________________________________________

Contrôles :

- [ ] Le conseiller appartient uniquement au groupe conseillers.
- [ ] Les deux assistantes appartiennent uniquement au groupe assistantes.
- [ ] Aucun compte n'appartient aux deux groupes.

## 3. Application Entra du CRM

- Nom de l'application : _________________________________
- Application (client) ID : ______________________________
- Redirect URI : `http://127.0.0.1:3847/callback`

Permissions déléguées :

- [ ] `User.Read`
- [ ] `GroupMember.Read.All`
- [ ] `Sites.Selected`
- [ ] `Mail.Send.Shared`
- [ ] `offline_access`
- [ ] `openid`
- [ ] `email`
- [ ] Consentement administrateur accordé
- [ ] Flux client public / PKCE autorisé
- [ ] Aucun secret client créé pour le CRM desktop

## 4. Site SharePoint

- URL complète : _________________________________________
- Hostname, sans `https://` : ____________________________
- Chemin commençant par `/sites/` : ______________________
- ID Graph du site : _____________________________________
- Nom lisible du site : __________________________________

Contrôles :

- [ ] Le conseiller ouvre le site dans son navigateur.
- [ ] L'assistante 1 ouvre le site.
- [ ] L'assistante 2 ouvre le site.
- [ ] Le grant `Sites.Selected` de l'application CRM est en rôle `manage`.

Après **Provisionner listes CRM** :

- [ ] Les six listes `CRM_*` sont présentes.
- [ ] La bibliothèque **Documents** est accessible.
- [ ] Le grant `manage` a été supprimé.
- [ ] Un nouveau grant limité à `write` a été créé.
- [ ] **Tester SharePoint** réussit encore après la réduction à `write`.

## 5. Boîte partagée

- Nom : _________________________________________________
- Adresse : _____________________________________________

Contrôles :

- [ ] Le conseiller dispose de **Full Access** et **Send As**.
- [ ] L'assistante 1 dispose de **Full Access** et **Send As**.
- [ ] L'assistante 2 dispose de **Full Access** et **Send As**.
- [ ] Le délai de propagation Exchange, jusqu'à 60 minutes, est écoulé.
- [ ] Aucun utilisateur ne se connecte directement avec la boîte partagée.

## 6. État du poste conseiller

- Version CRM installée : ________________________________
- Date de la sauvegarde historique : _____________________
- Emplacement vérifié de la sauvegarde : _________________

Progression :

- [ ] **Enregistrer Client ID**
- [ ] **Connecter Microsoft**
- [ ] **Enregistrer la configuration équipe**
- [ ] **Tester SharePoint**
- [ ] **Provisionner listes CRM**
- [ ] **Préparer la migration**
- [ ] **Envoyer la copie test vers SharePoint**
- [ ] **Valider la restauration test**
- [ ] **Activer la synchronisation équipe**
- [ ] Message **Cache équipe actif**

## 7. Transmission aux assistantes

Transmettre uniquement :

- le Client ID ;
- le hostname et le chemin SharePoint ;
- l'ID Graph et le nom du site ;
- les Object ID des deux groupes ;
- l'adresse de la boîte partagée.

Ne jamais transmettre :

- un mot de passe ;
- un token OAuth ;
- `secrets.key` ;
- `auth.json` ;
- une base `.db` ;
- le compte Microsoft du conseiller.

Date de remise :

- Assistante 1 : __________________
- Assistante 2 : __________________

