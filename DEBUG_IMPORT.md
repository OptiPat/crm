# 🐛 DEBUG - Import Excel Page Blanche

## Correction appliquée

✅ **Problème identifié** : Utilisation incorrecte de `asChild` avec `<span>` dans le bouton de sélection de fichier

✅ **Solution** : Remplacement par un bouton simple avec `onClick` qui déclenche le clic sur l'input file

## Comment vérifier si c'est résolu

### 1. L'application devrait se recharger automatiquement
- Vite détecte le changement et recharge l'app
- Vérifiez que vous voyez le message de rechargement dans votre navigateur

### 2. Testez l'import
1. Allez sur la page **Contacts**
2. Cliquez sur le bouton **"Importer"**
3. La modale devrait s'ouvrir correctement

### 3. Si toujours une page blanche

**Ouvrez la console JavaScript** :
- Appuyez sur `F12` dans votre navigateur
- Allez dans l'onglet "Console"
- Recherchez des erreurs en rouge

**Erreurs possibles** :
- `Cannot read property 'click' of null` → L'input file n'est pas trouvé
- `XLSX is not defined` → Problème d'import de la bibliothèque xlsx
- `Badge is not defined` → Problème d'import du composant Badge

### 4. Solution rapide : Relancer l'application

Si le hot reload ne fonctionne pas :

```powershell
# Arrêter l'application (Ctrl+C dans le terminal)
# Puis relancer
npm run tauri:dev:release
```

## Autres causes possibles

### Si l'erreur persiste après la correction

1. **Problème avec XLSX** :
   ```bash
   npm install xlsx --save
   ```

2. **Cache navigateur** :
   - Appuyez sur `Ctrl+Shift+R` pour forcer le rechargement
   - Ou videz le cache navigateur

3. **Problème de build** :
   ```bash
   # Nettoyer et rebuild
   rm -rf node_modules/.vite
   npm run dev
   ```

## Code corrigé

### AVANT (problématique)
```tsx
<label htmlFor="file-upload">
  <Button variant="outline" className="cursor-pointer" asChild>
    <span>
      <Upload className="h-4 w-4 mr-2" />
      Choisir un fichier
    </span>
  </Button>
</label>
```

### APRÈS (corrigé)
```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => document.getElementById('file-upload')?.click()}
>
  <Upload className="h-4 w-4 mr-2" />
  Choisir un fichier
</Button>
```

## Logs à vérifier

### Console JavaScript (F12)
Cherchez :
- ❌ Erreurs en rouge
- ⚠️ Avertissements en jaune
- 📝 Messages de chargement

### Terminal Vite
Cherchez :
- `✓ HMR update` → Hot reload réussi
- `error` → Erreur de compilation

## Contact

Si le problème persiste après ces étapes, partagez :
1. Les erreurs de la console JavaScript (F12)
2. Les dernières lignes du terminal Vite
3. Le fichier Excel que vous essayez d'importer (format)
