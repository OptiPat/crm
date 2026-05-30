# 📘 Guide d'utilisation - Patrimoine CRM

## 🎉 Fonctionnalités implémentées (Priorités 1 & 2)

### ✅ **PRIORITÉ 1 - COMPLÉTÉ**

#### 1. Catégories de contacts conformes
- CLIENT
- PROSPECT_CLIENT
- PROSPECT_FILLEUL
- SUSPECT_CLIENT
- SUSPECT_FILLEUL

#### 2. Code couleur automatique sur les contacts
- 🔴 **Rouge** : Client sans contact depuis > 12 mois (URGENT)
- 🟠 **Orange** : Suspect sans contact depuis > 6 mois (Relance recommandée)
- 🟢 **Vert** : Suivi à jour
- **Tri automatique** : Les contacts urgents apparaissent en premier

#### 3. Chiffrement de la base de données
- ✅ SQLCipher implémenté (AES-256)
- ⚠️ **Temporairement désactivé** (nécessite OpenSSL sur Windows)
- Voir `INSTALLATION_OPENSSL.md` pour réactiver le chiffrement

---

### ✅ **PRIORITÉ 2 - COMPLÉTÉ**

#### 1. Import Excel/CSV
**Accès** : Page Contacts > Bouton "Importer"

**Fonctionnalités** :
- ✅ Import de fichiers .xlsx, .xls, .csv
- ✅ **Détection automatique intelligente** des colonnes (nom, prénom, email, téléphone, etc.)
- ✅ **Mapping manuel** : Associez chaque colonne du fichier aux champs du CRM
- ✅ **Prévisualisation** avant import
- ✅ **Détection des doublons** par email ou téléphone
- ✅ Option : Ignorer ou importer les doublons

**Comment l'utiliser** :
1. Allez dans "Contacts"
2. Cliquez sur "Importer"
3. Sélectionnez votre fichier Excel/CSV
4. Vérifiez/ajustez le mapping des colonnes
5. Prévisualisez et importez

---

#### 2. Système de templates d'emails
**Accès** : Menu latéral > "Templates Email"

**Fonctionnalités** :
- ✅ Création de modèles d'emails réutilisables
- ✅ **Variables dynamiques** :
  - `{{prenom}}` - Prénom du contact
  - `{{nom}}` - Nom du contact
  - `{{email}}` - Email du contact
  - `{{telephone}}` - Téléphone du contact
  - `{{lien_agenda}}` - Lien Google Agenda choisi pour ce template (Paramètres → plusieurs liens)
  - `{{lien_agenda_<id>}}` - Lien fixe par identifiant (ex. `{{lien_agenda_suivi}}`)
  - `{{cgp_nom}}`, `{{cgp_prenom}}`, etc. - Vos informations
- ✅ **6 catégories prédéfinies** :
  - Suivi annuel
  - Arbitrage
  - Fiscalité
  - Bienvenue
  - Relance
  - Autre
- ✅ Aperçu en temps réel

**Comment l'utiliser** :
1. Allez dans "Templates Email"
2. Cliquez sur "Nouveau template"
3. Remplissez le nom, la catégorie, le sujet et le corps
4. Cliquez sur les variables pour les insérer
5. Enregistrez

---

#### 3. Configuration SMTP et envoi d'emails
**Accès** : Paramètres > "Configuration Email (SMTP)"

**Fonctionnalités** :
- ✅ Support **Gmail** (configuration automatique)
- ✅ Support **Outlook / Office 365** (configuration automatique)
- ✅ Support **autre fournisseur SMTP** (configuration manuelle)
- ✅ **Test de connexion** intégré
- ✅ Fonction d'envoi d'emails depuis l'application

**Configuration Gmail** :
1. Allez dans Paramètres > "Configurer mon compte email"
2. Sélectionnez "Gmail"
3. Entrez votre email Gmail
4. ⚠️ **IMPORTANT** : Utilisez un "mot de passe d'application" :
   - Allez sur https://myaccount.google.com/apppasswords
   - Créez un mot de passe d'application
   - Utilisez ce mot de passe (pas votre mot de passe Gmail principal)
5. Remplissez votre nom d'expéditeur
6. Cliquez sur "Tester" pour vérifier
7. Enregistrez

**Configuration Outlook** :
1. Sélectionnez "Outlook / Office 365"
2. Entrez votre email Outlook
3. Entrez votre mot de passe
4. Testez et enregistrez

---

#### 4. Système d'alertes automatiques de suivi
**Accès** : Menu latéral > "Suivi"

**Fonctionnalités** :
- ✅ **Génération automatique** des alertes basée sur les règles métier :
  - Clients : alerte si > 12 mois sans contact
  - Suspects : alerte si > 6 mois sans contact
- ✅ Page dédiée avec liste des alertes
- ✅ **Actions rapides** :
  - Marquer comme traité
  - Reporter le suivi (3, 6 ou 12 mois)
  - Envoyer un email (bientôt disponible)
  - Supprimer l'alerte

**Comment l'utiliser** :
1. Allez dans "Suivi"
2. Cliquez sur "Générer les alertes" pour lancer l'analyse
3. Les alertes apparaissent triées par priorité
4. Traitez chaque alerte avec les boutons d'action

---

## 🎨 Design & UX

### Palette de couleurs (conforme au prompt)
- **Primaire** : Bleu profond #1E3A5F (confiance, professionnalisme)
- **Accent** : Or #C9A227 (patrimoine, luxe discret)
- **Fond** : Gris très clair #F8FAFC
- **Typographies** :
  - Titres : Playfair Display (serif, élégant)
  - Corps : Plus Jakarta Sans (sans-serif, moderne)

### Interface
- Navigation latérale avec icônes
- Recherche globale dans le header
- Cartes et tableaux responsive
- Filtres avancés
- Animations subtiles

---

## 🗂️ Structure des données

### Base de données
- **SQLite** local (actuellement non chiffré)
- **10 tables** : contacts, foyers, partenaires, investissements, documents, interactions, emails, templates_email, alertes, parametres
- **Relations** : Contacts ↔ Foyers, Contacts ↔ Investissements, etc.

### Emplacement
```
%APPDATA%\com.patrimoine-crm.app\
├── patrimoine-crm.db      # Base de données
├── auth.json              # Configuration authentification
└── smtp_config.json       # Configuration email
```

---

## 🔒 Sécurité

### Actuellement implémenté
- ✅ Mot de passe maître avec Argon2 (hachage sécurisé)
- ✅ Clé de récupération (8 mots aléatoires)
- ✅ Écran de déverrouillage au démarrage
- ⚠️ Base de données NON chiffrée (temporaire - nécessite OpenSSL)

### À venir
- Verrouillage automatique après 15 min d'inactivité
- Déverrouillage biométrique (Windows Hello, Touch ID)
- Activation de SQLCipher après installation d'OpenSSL

---

## 📋 Checklist de test

### Test des fonctionnalités de base
- [ ] Créer un nouveau contact
- [ ] Modifier un contact existant
- [ ] Rechercher un contact
- [ ] Filtrer par catégorie
- [ ] Créer un foyer
- [ ] Lier un contact à un foyer

### Test de l'import
- [ ] Préparer un fichier Excel avec des contacts
- [ ] Importer le fichier
- [ ] Vérifier la détection automatique des colonnes
- [ ] Vérifier la détection des doublons
- [ ] Importer avec succès

### Test des templates
- [ ] Créer un template d'email
- [ ] Utiliser les variables {{prenom}}, {{nom}}
- [ ] Prévisualiser le template
- [ ] Modifier un template existant

### Test SMTP
- [ ] Configurer votre compte email (Gmail ou Outlook)
- [ ] Tester la connexion
- [ ] Vérifier la réception de l'email de test

### Test des alertes
- [ ] Créer un contact "Client" avec une date de dernier contact > 12 mois
- [ ] Aller dans "Suivi"
- [ ] Cliquer sur "Générer les alertes"
- [ ] Vérifier qu'une alerte rouge apparaît
- [ ] Marquer l'alerte comme traitée

---

## 🐛 Problèmes connus

### 1. SQLCipher désactivé temporairement
**Cause** : Nécessite OpenSSL sur Windows
**Impact** : Base de données non chiffrée
**Solution** : Voir `INSTALLATION_OPENSSL.md`

### 2. Erreur LNK1318 lors de la compilation
**Cause** : Trop de symboles de debug pour le linker Visual Studio
**Solution** : Ajout de `debug = 0` dans `Cargo.toml` (déjà fait)

---

## 📞 Support

En cas de problème :
1. Vérifiez les logs dans le terminal
2. Consultez le fichier `INSTALLATION_OPENSSL.md` pour le chiffrement
3. Nettoyez le cache : `cargo clean` dans `src-tauri/`
4. Relancez : `npm run tauri:dev`

---

## 🚀 Prochaines fonctionnalités (PHASE 2)

- Import/lecture de PDF avec OCR (Tesseract.js)
- Génération de PDF pré-remplis
- Tableau de bord avec KPIs et graphiques
- Suivi des investissements
- Gestion documentaire (GED)
- Workflows multi-étapes
- Intégration calendrier (Google/Outlook)
- Comparaison de RIO

---

**Version** : 0.1.0
**Dernière mise à jour** : 15 janvier 2026
