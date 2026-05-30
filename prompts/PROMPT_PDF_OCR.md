# 📄 MODULE : Import et Lecture de PDF avec OCR

> **✅ MODULE PARTIELLEMENT TERMINÉ - 17 janvier 2026**
>
> **Ce qui est fait :**
> - ✅ Extraction texte PDF natif (PDF.js)
> - ✅ Parsers RIO (standard, advanced, patrimoine)
> - ✅ Parser générique (email, téléphone, nom, adresse)
> - ✅ Interface de prévisualisation des données extraites
> - ✅ Tri patrimoine "Avec moi" / "À côté" (PatrimoineTriDialog)
> - ✅ Champ `origine` (MON_CONSEIL / EXISTANT_CLIENT)
> - ✅ Badge gris pour investissements "À côté"
> - ✅ Mise à jour catégorie contact après import RIO
>
> **Ce qui reste à faire :**
> - ⚠️ OCR Tesseract.js (PDF scannés)
> - ⚠️ Détection doublons investissements
> - ⚠️ Détection couples (multi-personnes)
>
> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Permettre d'**importer des PDF** et d'**extraire automatiquement les données** pour pré-remplir les fiches clients.

**100% local** : Aucune donnée ne transite par Internet (Tesseract.js).

---

## 📦 Dépendances à installer

```bash
npm install tesseract.js pdf-parse pdfjs-dist
```

Ou côté Rust (si préféré) :
```toml
# Cargo.toml
pdf-extract = "0.7"
image = "0.24"
```

---

## 📋 Types de documents à lire

| Document | Données à extraire |
|----------|-------------------|
| **RIO** | Nom, prénom, adresse, patrimoine, revenus, objectifs |
| **Fiche profil risque** | SRI (1-7), horizon de placement |
| **DER** | Identité, coordonnées |
| **Relevé de compte** | Solde, mouvements |
| **RIB** | IBAN, BIC, titulaire |
| **Avis d'imposition** | Revenus, situation familiale |

---

## ✨ Fonctionnalités à implémenter

### 1. Upload de PDF dans la fiche contact

Dans `ContactDetail.tsx` ou `Documents.tsx` :
- Bouton "Importer un PDF"
- Dialog de sélection de fichier
- Choix du type de document
- Option : "Extraire les données automatiquement"

---

### 2. Extraction de texte (PDF texte)

Pour les PDF natifs (texte sélectionnable) :
```typescript
import * as pdfjsLib from 'pdfjs-dist';

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ');
  }
  
  return text;
}
```

---

### 3. OCR pour PDF scannés (images)

Pour les PDF qui sont des images scannées :
```typescript
import Tesseract from 'tesseract.js';

async function ocrFromImage(imageData: ImageData): Promise<string> {
  const result = await Tesseract.recognize(imageData, 'fra', {
    logger: (m) => console.log(m), // Progress
  });
  return result.data.text;
}
```

**Workflow** :
1. Convertir les pages PDF en images (canvas)
2. Appliquer l'OCR sur chaque image
3. Combiner le texte extrait

---

### 4. Parsing intelligent des données

Créer des parsers spécifiques pour chaque type de document :

```typescript
// src/lib/pdf/parsers/rio-parser.ts
export function parseRIO(text: string): Partial<Contact> {
  const data: Partial<Contact> = {};
  
  // Regex pour nom/prénom
  const nomMatch = text.match(/Nom\s*:\s*([A-Z]+)/i);
  if (nomMatch) data.nom = nomMatch[1];
  
  const prenomMatch = text.match(/Prénom\s*:\s*([A-Za-z]+)/i);
  if (prenomMatch) data.prenom = prenomMatch[1];
  
  // Regex pour email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) data.email = emailMatch[0];
  
  // Regex pour téléphone français
  const telMatch = text.match(/(?:0|\+33)[1-9](?:[\s.-]?\d{2}){4}/);
  if (telMatch) data.telephone = telMatch[0].replace(/[\s.-]/g, '');
  
  // Etc.
  return data;
}
```

---

### 5. Interface de validation

Après extraction, afficher un dialog :
- Données extraites (modifiables)
- Comparaison avec données existantes si contact déjà rempli
- Boutons : "Appliquer", "Modifier", "Ignorer"

```
┌─────────────────────────────────────────────────┐
│  📄 Données extraites du RIO                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Nom        : [NOM1          ] ← [NOM1]        │
│  Prénom     : [Jean          ] ← [Jean]        │
│  Email      : [client@mail   ] ← (nouveau)     │
│  Téléphone  : [0612345678    ] ← [0612345678]  │
│  ...                                            │
│                                                 │
├─────────────────────────────────────────────────┤
│  [Ignorer]        [Modifier]        [Appliquer] │
└─────────────────────────────────────────────────┘
```

---

### 6. Gestion des PDF multi-personnes (couples)

Certains RIO contiennent 2 personnes (couple).

**Détection** :
- Chercher patterns comme "Conjoint", "Co-titulaire", "M." et "Mme"
- Si détecté, proposer de créer/lier 2 contacts

**Interface** :
```
┌─────────────────────────────────────────────────┐
│  ⚠️ 2 personnes détectées dans ce document      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Personne 1 : Jean                              │
│  Personne 2 : Marie                             │
│                                                 │
│  [ ] Créer les 2 contacts                       │
│  [ ] Lier à un foyer existant                   │
│  [ ] Créer un nouveau foyer                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Fichiers à créer

```
src/lib/pdf/
├── index.ts           # Export principal
├── extractor.ts       # Extraction texte/OCR
├── parsers/
│   ├── index.ts
│   ├── rio-parser.ts
│   ├── avis-imposition-parser.ts
│   ├── rib-parser.ts
│   └── generic-parser.ts
└── types.ts           # Types pour extraction

src/components/documents/
├── PdfImport.tsx      # Dialog d'import
├── ExtractedDataPreview.tsx  # Prévisualisation
└── MultiPersonDetection.tsx  # Gestion couples
```

---

## ⚠️ Limitations connues

- **OCR** : Précision ~85-90% avec Tesseract (acceptable)
- **PDF scannés de mauvaise qualité** : Résultats variables
- **Formats non standards** : Certains documents peuvent nécessiter des parsers spécifiques

---

## 📝 Ordre de développement

1. **Étape 1** : Extraction de texte PDF natif (pdfjs-dist)
2. **Étape 2** : OCR basique avec Tesseract.js
3. **Étape 3** : Parser générique (email, téléphone, nom)
4. **Étape 4** : Interface de prévisualisation/validation
5. **Étape 5** : Parser spécifique RIO
6. **Étape 6** : Détection multi-personnes
7. **Étape 7** : Parsers additionnels (avis imposition, RIB...)

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [x] L'extraction de texte fonctionne sur PDF natifs
- [ ] L'OCR fonctionne sur PDF scannés ⚠️ À FAIRE
- [x] Les données extraites sont correctes (>80% de précision)
- [x] L'interface de validation est fonctionnelle
- [ ] La détection de couples fonctionne ⚠️ À FAIRE
- [x] Aucune donnée n'est envoyée sur Internet
- [x] Tri "Avec moi" / "À côté" fonctionne
- [x] Badge gris pour investissements "À côté"
- [ ] Détection doublons investissements ⚠️ À FAIRE
