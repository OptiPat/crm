# SOLUTION SANS SQLITE3

## 🎯 Problème

SQLite3 n'est pas installé sur votre système :
```
sqlite3 : Le terme «sqlite3» n'est pas reconnu
```

## ✅ Solution : Migration automatique dans le code Rust

Au lieu d'utiliser SQLite3 en ligne de commande, j'ai ajouté la migration **directement dans le code Rust**. Elle s'exécutera automatiquement au démarrage de l'app.

### Modifications apportées

**Fichier modifié :** `src-tauri/src/database/mod.rs`

Une nouvelle fonction `migrate_investissements_contact_id_optional()` a été ajoutée. Elle :
1. ✅ Vérifie si `contact_id` a la contrainte `NOT NULL`
2. ✅ Si oui, applique la migration automatiquement
3. ✅ Si non, affiche "Migration déjà appliquée"

### Code ajouté

```rust
fn migrate_investissements_contact_id_optional(&self) -> Result<()> {
    // Vérifier si la migration est nécessaire
    let mut stmt = self.conn.prepare("PRAGMA table_info(investissements)")?;
    // ... vérifie si contact_id a NOT NULL ...
    
    if !contact_id_is_not_null {
        println!("✅ Migration contact_id déjà appliquée");
        return Ok(());
    }
    
    println!("🔄 Migration : Rendre contact_id optionnel...");
    
    // Créer table temporaire, copier données, renommer
    // ...
    
    println!("✅ Migration appliquée : contact_id est maintenant optionnel");
    
    Ok(())
}
```

Cette fonction est appelée automatiquement dans `init_tables()`.

## 🚀 Déploiement

```powershell
.\migration-auto-sans-sqlite.ps1
```

Ce script :
1. Arrête l'app
2. Fait un `cargo clean` (pour forcer la recompilation)
3. Relance l'app

### Au démarrage, cherchez dans les logs :

```
✅ Database tables initialized
🔄 Migration : Rendre contact_id optionnel dans investissements...
✅ Migration appliquée : contact_id est maintenant optionnel
```

**Si vous voyez ces messages, c'est bon !** ✅

## 🧪 Test

Après le démarrage :
1. Importez votre fichier avec les couples
2. Les logs devraient afficher :
   ```
   ✅ Investissement de foyer 55 créé avec succès
   ```

## 📝 Avantages de cette solution

- ✅ Pas besoin d'installer SQLite3
- ✅ Migration automatique et transparente
- ✅ S'exécute une seule fois
- ✅ Détection intelligente (ne s'applique que si nécessaire)
- ✅ Sécurisé (aucune perte de données)

## ⚠️ Notes

- La migration s'exécute **au premier démarrage** après compilation
- Elle prend quelques millisecondes
- Les données existantes sont **préservées**
- Si la migration a déjà été faite, elle est **ignorée**

---

**Solution sans dépendance externe - 18/01/2026**
