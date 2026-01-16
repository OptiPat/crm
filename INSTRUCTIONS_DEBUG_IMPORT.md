# 🔍 INSTRUCTIONS POUR DÉBOGUER L'IMPORT EXCEL

## ✅ Corrections appliquées

J'ai ajouté :
1. **Logging détaillé** dans la console JavaScript
2. **Affichage des erreurs** dans l'interface
3. **Validation de la taille** du fichier (max 10MB)
4. **Gestion d'erreurs améliorée** à chaque étape

## 📋 SUIVEZ CES ÉTAPES EXACTEMENT :

### 1. Ouvrir la Console JavaScript (OBLIGATOIRE)
**Appuyez sur `F12` dans votre navigateur**
- Allez dans l'onglet **"Console"**
- Gardez cette console ouverte pendant le test

### 2. Tester l'import
1. Allez sur la page **Contacts**
2. Cliquez sur le bouton **"Importer"**
3. La modale devrait s'ouvrir
4. Cliquez sur **"Choisir un fichier"**
5. Sélectionnez votre fichier Excel

### 3. Observez la console
Vous devriez voir des messages comme :
```
File selected: nom_du_fichier.xlsx 12345 bytes
Reading file...
File read, parsing workbook...
Workbook parsed, sheets: ["Feuil1"]
Converting to JSON...
JSON data: 50 rows
Columns detected: ["Nom", "Prénom", "Email", ...]
Mapping detected: {Nom: "nom", Prénom: "prenom", ...}
Moving to mapping step
```

### 4. Identifiez le problème

#### ❌ Si vous voyez une ERREUR ROUGE dans la console :
**Copiez l'erreur complète** et partagez-la avec moi. Par exemple :
- `XLSX is not defined`
- `Cannot read property 'xxx' of undefined`
- `Unexpected token`

#### ⚠️ Si la console s'arrête à une étape :
Notez la **dernière ligne affichée**. Par exemple :
- S'arrête à "Reading file..." → Problème de lecture du fichier
- S'arrête à "Workbook parsed..." → Problème de conversion
- S'arrête à "Columns detected..." → Problème de mapping

#### ✅ Si tout se passe bien mais la page reste blanche :
- Vérifiez qu'il n'y a pas d'erreur en rouge
- Essayez de fermer et réouvrir la modale

## 🔧 SOLUTIONS RAPIDES

### Problème : "XLSX is not defined"
```bash
npm install xlsx --save
# Puis redémarrer l'app
npm run tauri:dev:release
```

### Problème : Le fichier est trop volumineux
- Réduisez le nombre de lignes dans votre Excel
- Ou divisez-le en plusieurs fichiers
- Limite actuelle : 10MB

### Problème : Format Excel non reconnu
- Assurez-vous que le fichier est en format **.xlsx** (pas .xls ancien format)
- Essayez d'ouvrir le fichier dans Excel et de le "Enregistrer sous" en .xlsx

### Problème : La console ne montre RIEN
Cela signifie que :
1. Le bouton "Choisir un fichier" ne fonctionne pas
2. Ou la sélection du fichier est annulée

**Solution** : Vérifiez que vous voyez bien la boîte de dialogue de sélection de fichier s'ouvrir.

## 📊 INFORMATIONS À ME COMMUNIQUER

Si le problème persiste, donnez-moi :

1. **Les erreurs de la console** (copier-coller)
2. **La dernière ligne de log** visible
3. **Les caractéristiques de votre fichier** :
   - Nom du fichier
   - Taille (en Ko ou Mo)
   - Nombre de lignes approximatif
   - Nom des colonnes (première ligne)
4. **Ce qui se passe** :
   - La modale s'ouvre-t-elle ?
   - La sélection de fichier s'ouvre-t-elle ?
   - Voyez-vous un message d'erreur ?

## 🧪 TEST AVEC UN FICHIER SIMPLE

Si vous voulez tester rapidement, créez un Excel avec seulement :

| Nom | Prénom | Email |
|-----|--------|-------|
| NOM1 | Jean | jean@test.fr |
| NOM2 | Marie | marie@test.fr |

Enregistrez en .xlsx et testez l'import.

---

**Avec ces logs détaillés, nous allons identifier le problème exact !** 🎯
