# 📝 MODULE : Génération de PDF Pré-remplis

> **❌ MODULE NON COMMENCÉ**
>
> **Priorité : 🟠 Moyenne**
>
> Ce module permettra de générer des bulletins de souscription, lettres de mission, etc. pré-remplis avec les données clients.
>
> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Permettre de **pré-remplir automatiquement** des formulaires PDF (bulletins de souscription, lettres de mission, etc.) avec les données des clients.

---

## 📦 Dépendances à installer

```bash
npm install pdf-lib @pdf-lib/fontkit
```

---

## 📋 Types de documents à générer

| Document | Usage |
|----------|-------|
| **Bulletin de souscription SCPI** | Un modèle par SCPI/partenaire |
| **Fiche conseil** | Avant chaque investissement |
| **Annexe durabilité** | Obligations réglementaires |
| **Lettre de mission** | Engagement CGP/client |
| **Rapport d'adéquation** | Justification du conseil |

---

## ✨ Fonctionnalités à implémenter

### 1. Upload de modèles PDF

Interface pour uploader des PDF "vierges" comme modèles :
- Page dédiée dans Paramètres ou nouvelle page "Modèles PDF"
- Nom du modèle
- Type de document
- Partenaire associé (optionnel)
- Fichier PDF

---

### 2. Détection des champs de formulaire (AcroForms)

Pour les PDF avec champs de formulaire interactifs :

```typescript
import { PDFDocument } from 'pdf-lib';

async function getFormFields(pdfBytes: Uint8Array) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  return fields.map(field => ({
    name: field.getName(),
    type: field.constructor.name, // PDFTextField, PDFCheckBox, etc.
  }));
}
```

---

### 3. Mapping champs PDF ↔ données contact

Interface pour associer les champs du PDF aux données du CRM :

```
┌─────────────────────────────────────────────────────────────┐
│  📄 Mapping : Bulletin SCPI Corum                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Champ PDF              →    Donnée CRM                     │
│  ─────────────────────────────────────────────────────────  │
│  nom_souscripteur       →    [Contact: Nom        ▼]        │
│  prenom_souscripteur    →    [Contact: Prénom     ▼]        │
│  adresse                →    [Contact: Adresse    ▼]        │
│  code_postal            →    [Contact: Code postal▼]        │
│  ville                  →    [Contact: Ville      ▼]        │
│  email                  →    [Contact: Email      ▼]        │
│  date_naissance         →    [Contact: Date naiss.▼]        │
│  montant                →    [Saisie manuelle     ▼]        │
│  date_signature         →    [Date du jour        ▼]        │
│                                                             │
│           [Enregistrer le mapping]                          │
└─────────────────────────────────────────────────────────────┘
```

**Variables disponibles** :
- Toutes les propriétés de Contact
- Toutes les propriétés de Foyer
- Données du CGP (à configurer dans Paramètres)
- Date du jour
- Saisie manuelle (à remplir lors de la génération)

---

### 4. Génération du PDF rempli

```typescript
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function fillPDF(
  templateBytes: Uint8Array,
  mapping: Record<string, string>,
  data: Record<string, any>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  
  for (const [fieldName, dataKey] of Object.entries(mapping)) {
    try {
      const field = form.getTextField(fieldName);
      const value = data[dataKey] || '';
      field.setText(String(value));
    } catch (e) {
      console.warn(`Champ non trouvé: ${fieldName}`);
    }
  }
  
  // Optionnel : aplatir le formulaire (non modifiable)
  form.flatten();
  
  return pdfDoc.save();
}
```

---

### 5. Support des PDF sans champs (positionnement manuel)

Pour les PDF qui sont des images ou sans champs interactifs :

**Interface de positionnement** :
1. Afficher le PDF en preview
2. Permettre de cliquer pour placer des zones de texte
3. Définir la police, taille, couleur
4. Associer à une donnée CRM

```typescript
interface TextPosition {
  page: number;
  x: number;
  y: number;
  fontSize: number;
  dataKey: string;
}

async function fillPDFWithPositions(
  templateBytes: Uint8Array,
  positions: TextPosition[],
  data: Record<string, any>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  for (const pos of positions) {
    const page = pdfDoc.getPage(pos.page);
    const value = data[pos.dataKey] || '';
    
    page.drawText(String(value), {
      x: pos.x,
      y: pos.y,
      size: pos.fontSize,
      font,
    });
  }
  
  return pdfDoc.save();
}
```

---

### 6. Interface de génération depuis la fiche contact

Dans `ContactDetail.tsx` :
- Bouton "Générer un document"
- Liste des modèles disponibles
- Formulaire pour les champs manuels
- Prévisualisation
- Téléchargement

```
┌─────────────────────────────────────────────────────────────┐
│  📄 Générer un document pour Jean                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Modèle : [Bulletin SCPI Corum Origin    ▼]                │
│                                                             │
│  Champs à compléter :                                       │
│  ─────────────────────────────────────────────────────────  │
│  Montant de souscription : [________] €                     │
│  Mode de paiement        : [Virement ▼]                     │
│  Nombre de parts         : [________]                       │
│                                                             │
│  ┌─────────────────────────────────────┐                   │
│  │         Prévisualisation            │                   │
│  │            (PDF)                    │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│           [Annuler]        [Télécharger PDF]               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Fichiers à créer

```
src/pages/
└── ModelesPdf.tsx          # Gestion des modèles

src/components/pdf/
├── ModeleUpload.tsx        # Upload de modèle
├── FieldMapping.tsx        # Mapping des champs
├── PositionEditor.tsx      # Positionnement manuel
├── PdfGenerator.tsx        # Dialog de génération
└── PdfPreview.tsx          # Prévisualisation

src/lib/pdf/
├── generator.ts            # Fonctions de génération
└── types.ts                # Types

src/lib/api/
└── tauri-modeles-pdf.ts    # API TypeScript
```

### Base de données (nouvelle table)

```sql
CREATE TABLE modeles_pdf (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  type_document TEXT NOT NULL,
  partenaire_id INTEGER REFERENCES partenaires(id),
  chemin_fichier TEXT NOT NULL,
  mapping JSON,  -- { "champ_pdf": "donnee_crm" }
  positions JSON, -- Pour positionnement manuel
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## 📝 Ordre de développement

1. **Étape 1** : Créer la table `modeles_pdf` + migration
2. **Étape 2** : Page d'upload des modèles
3. **Étape 3** : Détection des champs de formulaire
4. **Étape 4** : Interface de mapping
5. **Étape 5** : Génération PDF avec AcroForms
6. **Étape 6** : Interface de positionnement manuel
7. **Étape 7** : Génération PDF par positionnement
8. **Étape 8** : Intégration dans la fiche contact

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [ ] Upload de modèles PDF fonctionne
- [ ] Les champs AcroForms sont détectés
- [ ] Le mapping est sauvegardé
- [ ] La génération PDF fonctionne
- [ ] Le positionnement manuel fonctionne
- [ ] Le PDF généré est correct et téléchargeable
