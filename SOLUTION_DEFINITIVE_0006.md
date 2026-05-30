# SOLUTION DÉFINITIVE - Migration 0006

## 🔍 Problème persistant

Malgré l'exécution du script de migration, l'erreur persiste :
```
NOT NULL constraint failed: investissements.contact_id
```

**Cause probable :** La migration SQL n'a pas été appliquée ou a échoué silencieusement.

## 🛠️ Solution en 2 étapes

### Étape 1 : Diagnostic (IMPORTANT) ⚠️

Avant toute chose, vérifiez la structure actuelle :

```powershell
.\diagnostic-table-investissements.ps1
```

Vous devriez voir quelque chose comme :
```
0|id|INTEGER|0||1
1|contact_id|INTEGER|1||0  ← Le "1" ici = NOT NULL actif
2|foyer_id|INTEGER|0||0
...
```

**Si `contact_id` a un "1" dans la 3ème colonne, c'est le problème !**

### Étape 2 : Migration forcée ✅

Arrêtez l'app ET lancez ce script :

```powershell
.\migration-forcee-0006.ps1
```

**Ce script fait :**
1. ⏹️ Arrête l'app (obligatoire !)
2. 💾 Backup automatique horodaté
3. 🔍 Vérifie la structure actuelle
4. 🔧 Applique la migration en 4 étapes séparées
5. ✅ Vérifie la nouvelle structure
6. 🚀 Relance l'app

## 📋 Vérification après migration

Après l'exécution du script, vous devriez voir :

```
Verification nouvelle structure...
0|id|INTEGER|0||1
1|contact_id|INTEGER|0||0  ← Le "0" ici = Plus de NOT NULL !
2|foyer_id|INTEGER|0||0
...

SUCCES : contact_id est maintenant OPTIONNEL !
```

## 🧪 Test final

1. **Réimportez** votre fichier avec les lignes couples
2. **Vérifiez les logs** - Devrait afficher :
   ```
   ✅ Investissement de foyer 55 créé avec succès
      Type: IMMOBILIER
      Nom: Pinel
      Montant: 188192.00 €
   ```

3. **Ouvrez les fiches** :
   - Jean → Investissement Pinel visible
   - Sophie  → Même investissement visible
   - Badge 🔵 "Foyer"

## ⚠️ Si ça ne fonctionne toujours pas

### Option 1 : Migration manuelle SQLite

```powershell
# Arrêter l'app
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
taskkill /F /PID $proc

# Ouvrir SQLite
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
sqlite3 $dbPath
```

Puis dans SQLite :
```sql
-- Vérifier structure
PRAGMA table_info(investissements);

-- Si contact_id a NOT NULL, appliquer manuellement :
BEGIN TRANSACTION;

CREATE TABLE investissements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    foyer_id INTEGER REFERENCES foyers(id) ON DELETE SET NULL,
    type_produit TEXT NOT NULL,
    nom_produit TEXT NOT NULL,
    partenaire_id INTEGER REFERENCES partenaires(id) ON DELETE SET NULL,
    montant_initial INTEGER,
    date_souscription INTEGER,
    date_fin_demembrement INTEGER,
    versement_programme INTEGER DEFAULT 0,
    montant_versement_programme INTEGER,
    frequence_versement TEXT,
    reinvestissement_dividendes INTEGER DEFAULT 0,
    notes TEXT,
    origine TEXT DEFAULT 'MON_CONSEIL',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

INSERT INTO investissements_new SELECT * FROM investissements;
DROP TABLE investissements;
ALTER TABLE investissements_new RENAME TO investissements;

COMMIT;

-- Vérifier
PRAGMA table_info(investissements);
.quit
```

### Option 2 : Recréer la base (dernier recours)

Si rien ne fonctionne, supprimez la base et relancez :

```powershell
# Arrêter l'app
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
taskkill /F /PID $proc

# Backup
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
$backupPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db.backup-full"
Copy-Item $dbPath $backupPath

# Supprimer
Remove-Item $dbPath

# Relancer (créera une nouvelle DB)
npm run tauri:dev -- --release
```

⚠️ **Attention : Vous perdrez vos données !** Faites un backup avant.

---

**Guide de dépannage - 18/01/2026**
