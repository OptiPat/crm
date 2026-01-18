# DIAGNOSTIC & SOLUTION - Investissements de foyer

## 🔍 DIAGNOSTIC

### ✅ Ce qui fonctionne
- ✅ Détection des couples : "Sophie et Jean"
- ✅ Extraction des prénoms : "Virgine" et "Emmanuel"
- ✅ Création des contacts : Virgine NOM1 et Emmanuel NOM2
- ✅ Création du foyer : "Foyer NOM1-NOM2" (ID: 50)
- ✅ Stockage dans `couplesLines` : 2 lignes détectées
- ✅ Traitement des investissements : Boucle exécutée

### ❌ L'erreur identifiée

```
❌ Erreur investissement foyer: 
NOT NULL constraint failed: investissements.contact_id
```

**Cause :** La base de données SQLite a toujours la contrainte `NOT NULL` sur la colonne `contact_id` de la table `investissements`.

**Raison :** La migration SQL `0006_make_contact_id_optional.sql` n'a pas été appliquée à la base de données.

## 🔧 SOLUTION

### Option 1 : Script automatique (RECOMMANDÉ) ⭐

```powershell
.\fix-investissements-couples-final.ps1
```

Ce script :
1. Arrête l'app
2. Applique la migration SQL avec backup automatique
3. Relance l'app

### Option 2 : Manuel

```powershell
# 1. Arrêter l'app
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
taskkill /F /PID $proc

# 2. Appliquer la migration
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
$sql = Get-Content -Path "drizzle\0006_make_contact_id_optional.sql" -Raw
$sql | sqlite3 $dbPath

# 3. Relancer
npm run tauri:dev -- --release
```

## 📋 Vérification

Après avoir appliqué la solution :

1. **Réimportez votre fichier** avec les lignes couples
2. **Vérifiez les logs** :
   ```
   ✅ Investissement de foyer 50 créé avec succès
      Type: IMMOBILIER
      Nom: Pinel
      Montant: 188192.00 €
   ```

3. **Ouvrez les fiches contacts** :
   - Emmanuel NOM2 → Devrait afficher l'investissement Pinel
   - Virgine NOM1 → Devrait afficher le même investissement
   - Badge 🔵 "Foyer" sur l'investissement

4. **Vue par foyer** :
   - Cliquez sur "Afficher par foyer"
   - Le foyer "NOM1-NOM2" devrait afficher 188 192 € de patrimoine

## 🎯 Résultat attendu

### Exemple : "Marie et Pierre"

**Logs :**
```
👫 Ligne 32: Marie et Pierre
👫 Foyer ID: 51
👫 Produit: SCPI
👫 Montant: 39955
👫 Partenaire: Norma Capital
✅ Investissement de foyer 51 créé avec succès
   Type: SCPI
   Nom: SCPI
   Montant: 39955.00 €
```

**Fiche Richard EXEMPLE :**
```
Investissements (3)  ← +1 investissement
Total encours : 73 955,00 €  ← 34000 + 39955

- Assurance-Vie (👤 Daniele EXEMPLE) - 17 000 €
- Assurance-Vie (👤 Richard EXEMPLE) - 17 000 €
- SCPI (👤 Foyer 🔵) - 39 955 €  ← NOUVEAU
```

## 📝 Détails techniques

### Migration 0006

La migration recréé la table `investissements` en supprimant la contrainte `NOT NULL` sur `contact_id` :

```sql
CREATE TABLE investissements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE, 
    -- ↑ Plus de NOT NULL !
    foyer_id INTEGER REFERENCES foyers(id) ON DELETE SET NULL,
    -- ... autres colonnes
);
```

Puis :
1. Copie toutes les données existantes
2. Supprime l'ancienne table
3. Renomme la nouvelle table

**Aucune perte de données !** 🎉

---

**Correction finale - 18/01/2026**
