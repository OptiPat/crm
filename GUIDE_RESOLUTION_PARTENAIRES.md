# 🔧 Guide de résolution - Partenaires vides

## 🎯 Problème
L'onglet "Partenaires" est vide malgré la migration.

## ✅ Solution

### Méthode 1 : Redémarrage de l'application

1. **Ferme complètement l'application** Patrimoine CRM
2. **Relance avec** :
```powershell
npm run tauri dev
```

3. **Va dans l'onglet "Partenaires"** → Les 43 partenaires devraient apparaître !

### Méthode 2 : Script manuel (si redémarrage insuffisant)

1. **Ferme l'app**
2. **Exécute** :
```powershell
.\init-partenaires.ps1
```
3. **Relance l'app**

### Méthode 3 : Test avec base vierge

1. **Ferme l'app**
2. **Teste la migration** :
```powershell
.\test-migration-partenaires.ps1
```
3. **Relance l'app**

---

## 🔍 Vérification

### Dans l'onglet "Partenaires", tu devrais voir :

✅ **6 Assureurs** : Oddo, Vie Plus, Apicil, Eres Swisslife, Eres Spirica, Eres Entreprise  
✅ **11 SCPI** : Advenis, Altarea IM, Alderan, Voisin, Sofidy, Norma Capital, Mata Capital, Perial AM, Arkea Reim, Atream, La Française  
✅ **12 Promoteurs** : Cogedim, Colosseum, Histoire & Patrimoine, CIR, Caractere, Edouard Denis, Tagerim, Corim, Urbis, Bouygues Immobilier, Sporting Promotion, Helenis  
✅ **4 FIP/FCPI** : Odyssée Venture, Elevation, NextStage, Eiffeil  
✅ **1 G3F** : Inter Invest  

**Total : 43 partenaires**

---

## 🐛 Si le problème persiste

1. **Ouvre la console développeur** dans l'app (F12 ou Ctrl+Shift+I)
2. **Regarde les erreurs** dans l'onglet Console
3. **Partage le message d'erreur**

---

## 💡 Ce qui a été modifié

**Fichier modifié** : `src-tauri/src/database/mod.rs`

**Ajout** : Une nouvelle fonction `init_default_partenaires()` qui :
- Vérifie si des partenaires existent déjà
- Si la table est vide → Insert automatique des 43 partenaires
- Si des partenaires existent → Ne fait rien (évite les doublons)

Cette fonction est appelée **automatiquement** lors de l'initialisation de la base de données au premier lancement.

---

**🎉 Redémarre l'app maintenant !**
