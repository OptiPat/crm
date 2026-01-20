# 🏠 AGENT : Foyers & Familles

> **Objectif** : Gérer les foyers fiscaux directement depuis les contacts, avec regroupement visuel et détection automatique à l'import.

---

## ✅ STATUT : 100% TERMINÉ

### Ce qui est fait ✅
- [x] Champ `role_foyer` ajouté aux contacts (schema + Rust)
- [x] Détection automatique des couples à l'import ("Marie et Pierre")
- [x] Création automatique des foyers pour les couples
- [x] Modale post-import `FoyerGroupingModal` pour regrouper les familles
- [x] Regroupement visuel dans la liste des contacts (toggle)
- [x] Section Foyer dans la fiche contact (membres, patrimoine cumulé)
- [x] Boutons "Lier à un foyer existant" et "Créer un foyer" dans ContactDetail
- [x] Consolidation des investissements (même contact avec plusieurs lignes Excel)
- [x] Suppression en cascade : supprimer un contact → supprime le foyer si vide → supprime les investissements
- [x] Labels d'alertes corrigés (🔴 Jamais suivi, 🔴 Suivi +1 an, 🟠 Jamais contacté, 🟠 Suivi +6 mois)
- [x] Onglet "Foyers" supprimé de la navigation (tout géré depuis Contacts)
- [x] Nettoyage complet des console.log pour la production
- [x] Build de production réussi et testé

---

## 📋 Contexte

### Stack technique
- **Tauri 2.x** (Rust backend) + **React 18** + **TypeScript** + **Vite**
- **SQLite** via Tauri + **Drizzle ORM** (schéma uniquement)
- **Tailwind CSS 3** + **shadcn/ui**
- **Workspace** : `D:\crm`

### Commande de lancement obligatoire
```powershell
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1; if ($proc) { taskkill /F /PID $proc 2>$null }; cd D:\crm; npm run tauri:dev -- --release
```

### Si erreur de compilation (LNK1318)
```powershell
cd D:\crm\src-tauri
cargo clean
cd ..
npm run tauri:dev -- --release
```

---

## 🔧 Corrections appliquées

### 1. Import Excel - Consolidation des contacts individuels
**Problème** : Un contact avec plusieurs lignes (plusieurs investissements) créait des doublons.
**Solution** : Détection des couples AVANT le traitement des doublons. Si c'est un couple avec produit, forcer le statut à "pending".

```typescript
// src/components/contacts/ContactImport.tsx (ligne ~775)
if (isContactCouple(prenomCheck, nomCheck) && produitCheck) {
  row.status = "pending"; // Forcer le statut pour passer par la logique couple
}
```

### 2. Suppression en cascade
**Problème** : Supprimer un contact ne supprimait pas les investissements/foyers associés.
**Solution** : Modifier `delete_contact` dans Rust :

```rust
// src-tauri/src/database/operations.rs
pub fn delete_contact(&self, id: i64) -> Result<()> {
    // 1. Récupérer le foyer_id avant suppression
    let foyer_id = self.conn.query_row(...);
    
    // 2. Supprimer les investissements du contact
    self.conn.execute("DELETE FROM investissements WHERE contact_id = ?1", params![id])?;
    
    // 3. Supprimer le contact
    self.conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
    
    // 4. Si le foyer n'a plus de membres, le supprimer
    if remaining_members == 0 {
        self.delete_foyer(fid)?;
    }
    Ok(())
}
```

### 3. Labels d'alertes
**Nouveaux labels** :

| Catégorie | Condition | Label |
|-----------|-----------|-------|
| CLIENT | Jamais de date_dernier_contact | 🔴 Jamais suivi |
| CLIENT | date_dernier_contact > 12 mois | 🔴 Suivi +1 an |
| PROSPECT/SUSPECT | Jamais de date_dernier_contact | 🟠 Jamais contacté |
| PROSPECT/SUSPECT | date_dernier_contact > 6 mois | 🟠 Suivi +6 mois |

---

## 📁 Fichiers modifiés

| Fichier | Modifications |
|---------|---------------|
| `src/lib/db/schema.ts` | Ajout `roleFoyer` |
| `src-tauri/src/database/models.rs` | Ajout `role_foyer: Option<String>` |
| `src-tauri/src/database/operations.rs` | CRUD avec role_foyer + delete_contact cascade + nouveaux labels alertes |
| `src/pages/Contacts.tsx` | Toggle regroupement par foyer |
| `src/components/contacts/ContactDetail.tsx` | Section Foyer avec membres et patrimoine |
| `src/components/contacts/ContactImport.tsx` | Détection couples + consolidation + fix doublons |
| `src/components/foyers/FoyerGroupingModal.tsx` | Modale post-import pour regrouper familles |

---

## 🚀 Prochaines étapes suggérées

1. **Modale "Créer un foyer"** depuis la fiche contact (quand le contact n'a pas de foyer)
2. **Modale "Modifier le foyer"** pour changer les rôles des membres
3. **Bouton "Dissocier"** pour retirer un contact de son foyer
4. **Tests automatisés** pour la logique d'import

---

## 🐛 Scripts de diagnostic utiles

### Nettoyer les foyers/investissements orphelins
```javascript
// Exécuter avec Node.js
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db'));

// Supprimer investissements sur foyers vides
db.prepare(`DELETE FROM investissements WHERE foyer_id IN 
  (SELECT id FROM foyers WHERE id NOT IN 
    (SELECT DISTINCT foyer_id FROM contacts WHERE foyer_id IS NOT NULL)
  )`).run();

// Supprimer foyers vides
db.prepare(`DELETE FROM foyers WHERE id NOT IN 
  (SELECT DISTINCT foyer_id FROM contacts WHERE foyer_id IS NOT NULL)`).run();

db.close();
```

---

## 📌 Notes importantes

1. **Les investissements peuvent être liés à un contact OU un foyer** (via `contact_id` ou `foyer_id`)
2. **Les couples** (ex: "Marie et Pierre") créent un foyer avec 2 contacts séparés
3. **La détection des familles** se fait par nom de famille après l'import
4. **Le dashboard** compte l'encours total des investissements (tous types confondus)
