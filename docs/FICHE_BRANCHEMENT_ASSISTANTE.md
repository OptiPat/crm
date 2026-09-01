# Fiche assistante — rejoindre le CRM partagé

Un ordinateur = une personne = **son** compte Microsoft. CRM **0.5.42**, le même numéro que Tony
(en bas à gauche : `Version 0.5.42`, ou badge `v0.5.42` en haut des Paramètres). 15 à 30 minutes.

La version imprimable A4 est [`GUIDE_ASSISTANTE.html`](GUIDE_ASSISTANTE.html)
(ouvrir dans le navigateur → Imprimer) et [`GUIDE_ASSISTANTE.pdf`](GUIDE_ASSISTANTE.pdf).

Tony vous envoie le fichier d’installation et une fiche (plusieurs lignes).
Pas de mot de passe, pas de fichier `.db`. **Il n’y a pas une seule case « coller tout »** :
chaque ligne va dans un champ.

**Ne cliquez pas** sur Provisionner, Préparer la migration, Envoyer, Valider, Activer,
Tester SharePoint, Copier la fiche. Ces boutons peuvent encore s’afficher : c’est normal
tant que vous n’avez pas enregistré en Secrétaire. Ignorez-les.
Chez vous, le bouton qui compte est **Rejoindre sur ce poste**.

## Avant

- [ ] Tony a **Cache équipe actif** chez lui.
- [ ] Internet. Votre e-mail professionnel s’ouvre (code à 2 facteurs).
- [ ] Le disque de ce PC est chiffré (BitLocker ou FileVault — Tony / informatique).

## 1. Installer à vide

1. Windows : lancer le `.exe` (si Windows bloque : Informations complémentaires → Exécuter quand même).
   Mac : ouvrir le `.dmg`, glisser dans **Applications**, lancer *depuis Applications*
   (si macOS refuse : clic droit → Ouvrir).
2. Écran **Créer un mot de passe** : au moins 8 caractères, deux fois.
   C’est pour *cet* ordinateur, pas Microsoft.
3. Assistant : **Vos informations** (prénom, nom, cabinet) → **Terminer**.
   Connexion email et partenaires : plus tard, dans Paramètres. Microsoft : étape 2.

Aucun fichier copié depuis un autre PC. Pas de dossier CRM dans OneDrive.
Pas Hotmail, pas le compte de Tony, pas la boîte office@.

## 2. Connecter Microsoft

1. À gauche : **Paramètres** (roue). Dans Paramètres, colonne de gauche, groupe
   Automatisations → **Intégrations**. Le bloc **Mode équipe SharePoint** est en haut
   (ignorez Telegram et OneDrive).
2. 1re ligne de la fiche Tony → champ **Client ID Azure** → **Enregistrer Client ID**.
3. **Connecter Microsoft** → un navigateur s’ouvre : **votre** e-mail du cabinet, mot de passe,
   code à 2 facteurs. Si Microsoft demande d’autoriser l’application : **Accepter**.
   Revenez au CRM. Laissez le CRM ouvert.

Bandeau beige « identité nominative » : normal, il part une fois connecté.
L’adresse affichée doit être la vôtre. Sinon : **Déconnecter**, recommencer.

## 3. Recopier la fiche, puis Rejoindre

1. Interrupteur **Activer le mode équipe SharePoint** : ON.
   **Rôle sur cette installation** : **Secrétaire** (le menu propose Conseiller par défaut —
   changez-le *avant* d’enregistrer).
2. Recopiez **chaque ligne** dans le champ indiqué. Ne collez pas tout le bloc dans une seule case.

| Ligne de la fiche Tony | Champ à l’écran |
|---|---|
| Client ID Azure | Déjà fait en haut (étape 2) |
| Object ID groupe Conseillers | Groupe Entra — conseillers |
| Object ID groupe Assistantes | Groupe Entra — secrétaires |
| Hostname SharePoint | Hostname SharePoint |
| Chemin du site | Chemin du site |
| ID site Graph | ID site Graph — **obligatoire** malgré « optionnel » |
| Nom du site | Nom / espace d’équipe |
| Boîte e-mail cabinet | Boîte cabinet Microsoft 365 |

3. **Enregistrer la configuration équipe**. Après ça, les champs se verrouillent.
4. Les boutons Provisionner / migration doivent avoir disparu. S’ils sont encore là :
   vous avez enregistré en Conseiller — **arrêtez**, prévenez Tony, ne cliquez rien.
5. **Rejoindre sur ce poste** → OK. Internet allumé, CRM ouvert, quelques minutes possibles.
   Ne pas éteindre.
6. Message vert *Espace équipe rejoint* (ou *Cache équipe actif*). À gauche : **Contacts**.
   Les fiches du cabinet doivent apparaître. Liste vide alors que Tony en a : 30 secondes,
   ou fermer / rouvrir.

**STOP** si le CRM dit *Ce poste contient déjà des données CRM* : prévenir Tony.
Les étiquettes posées toutes seules au premier ouverture ne bloquent plus.

## 4. Essai 5 minutes (avec Tony, internet)

1. Vous créez un contact **TEST Equipe**.
2. Chez Tony : il apparaît en moins de 20 secondes.
3. Les deux ouvrent la même fiche : une seule peut modifier.
4. Chez vous : pas de bouton Exporter / copie de secours. Normal.

## Tous les jours

Internet allumé. Mot de passe CRM pour ouvrir. Avant d’éteindre : 20 secondes, ou cadenas.
Bandeau orange : d’abord le Wi‑Fi. Si **Reconnecter le compte Microsoft** : cliquez, code à
2 facteurs, puis déverrouillez encore. Si **Accès équipe révoqué** : prévenir Tony, ne pas forcer.

## Si ça bloque

| Vous voyez | Que faire |
|---|---|
| Rejoindre grisé | Lire le bandeau jaune. Souvent ID site oublié. Si déjà enregistré : **ne réinstallez pas toute seule** (le CRM garde les réglages) — prévenez Tony. |
| « Ce poste contient déjà des données CRM » | Arrêter, prévenir Tony. Ne rien supprimer sur le disque. |
| Mauvais e-mail / Microsoft refuse | Déconnecter, votre compte. Si ça refuse encore : licence ou mot de passe — Tony / informatique. |
| N’appartient à aucun groupe | Vous mettre dans le groupe Assistantes *seulement* (pas les deux). |
| Autre message rouge | Copier le texte exact, l’envoyer à Tony. |
