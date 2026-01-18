# CORRECTIFS APPLIQUÉS - Module Foyers

## 🐛 Problèmes identifiés

### 1. Champ `type_foyer` manquant ❌
**Erreur:** `missing field 'type_foyer'` lors de la création du foyer

**Solution:** Ajout du champ obligatoire `type_foyer: "COUPLE"` lors de la création

### 2. Noms composés mal gérés ❌
**Exemple:** "NOM1 et NOM2" → Devrait créer "Foyer NOM1-NOM2"

**Solution:** 
- Nouvelle fonction `extractCompositeName()` qui transforme "X et Y" en "X-Y"
- Les contacts gardent leur nom de famille respectif :
  - Virginie NOM1
  - Emmanuel NOM2
  - Foyer: "Foyer NOM1-NOM2"

### 3. Patrimoine disparu ❌
**Cause:** L'investissement était stocké mais pas créé à cause des erreurs précédentes

**Solution:** Avec les corrections ci-dessus, les investissements seront créés correctement

## ✅ Corrections appliquées

### 1. Fonction `extractCompositeName()`
```typescript
const extractCompositeName = (nom: string): string => {
  if (nom.includes(" et ") || nom.includes(" & ")) {
    const parts = nom.split(/ et | & /).map(p => p.trim());
    return parts.join("-"); // "NOM1 et NOM2" → "NOM1-NOM2"
  }
  return nom;
};
```

### 2. Création du foyer avec `type_foyer`
```typescript
const newFoyer = await createFoyer({ 
  nom: nomFoyer,
  type_foyer: "COUPLE" // ✅ Champ obligatoire ajouté
});
```

### 3. Gestion des noms composés pour les contacts
```typescript
// Pour "Sophie et Jean"
const nomContact1 = "NOM1";  // Premier nom
const nomContact2 = "NOM2";   // Deuxième nom
const nomFoyer = "Foyer NOM1-NOM2"; // Foyer composé
```

## 📋 Résultat attendu

### Exemple 1 : "Marie et Pierre"
```
Création automatique:
  ✓ Contact: Daniele EXEMPLE (DECLARANT_1)
  ✓ Contact: Richard EXEMPLE (DECLARANT_2)
  ✓ Foyer: "Foyer couple" (type: COUPLE)
  ✓ Investissement rattaché au foyer
```

### Exemple 2 : "Sophie et Jean"
```
Création automatique:
  ✓ Contact: Virgine NOM1 (DECLARANT_1)
  ✓ Contact: Emmanuel NOM2 (DECLARANT_2)
  ✓ Foyer: "Foyer NOM1-NOM2" (type: COUPLE)
  ✓ Investissement rattaché au foyer
```

## 🚀 Déploiement

```powershell
.\fix-couples-auto-create.ps1
```

## 🔍 Logs ajoutés

Les logs sont maintenant ultra-détaillés pour debug :
```
👫 [ContactImport] Détection d'un couple: Sophie et Jean
👫 [ContactImport] Prénoms extraits: "Virgine" et "Emmanuel"
👫 [ContactImport] Nom de famille extrait: "NOM1-NOM2" (original: "NOM1 et NOM2")
👫 [ContactImport] Noms contacts: "NOM1" et "NOM2"
👫 [ContactImport] ✓ Foyer 5 créé: Foyer NOM1-NOM2
👫 [ContactImport] ✓ Contact Virgine NOM1 créé (ID: 12)
👫 [ContactImport] ✓ Contact Emmanuel NOM2 créé (ID: 13)
👫 [ContactImport] ✓ Investissement ajouté à la file pour le foyer 5
```

## 🧪 Test

1. Relancez l'app avec le script
2. Réimportez votre fichier Excel
3. Les lignes couples devraient maintenant s'importer sans erreur
4. Vérifiez dans la vue "par foyer" que les patrimoines apparaissent

---

**Correctifs appliqués le 18/01/2026**
