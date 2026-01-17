# 📁 MODULE : Gestion Électronique des Documents (GED)

> **⚠️ MODULE PARTIELLEMENT COMMENCÉ**
>
> **Ce qui existe :**
> - ✅ Upload de documents basique (`DocumentUpload.tsx`)
> - ✅ Table `documents` en base de données
> - ✅ Liaison documents ↔ contacts
>
> **Ce qui reste à faire :**
> - ❌ Arborescence automatique par client
> - ❌ Navigation visuelle dans les dossiers
> - ❌ Prévisualisation PDF intégrée
> - ❌ Actions (renommer, déplacer, supprimer)
> - ❌ Recherche dans les documents
> - ❌ Hash SHA-256 pour intégrité
>
> **Priorité : 🟡 Basse**
>
> **Prérequis** : Lire `CONTEXTE_GLOBAL.md` avant de commencer

---

## 🎯 Objectif

Créer une **arborescence documentaire automatique** par client pour organiser tous les documents (PDF, images, etc.).

---

## 📂 Structure d'arborescence souhaitée

```
📁 Documents/
└── 📁 [NOM Prénom - ID]/
    ├── 📁 Identité/
    │   ├── CNI.pdf
    │   └── Justificatif_domicile.pdf
    ├── 📁 Fiscalité/
    │   ├── Avis_imposition_2024.pdf
    │   └── Avis_imposition_2023.pdf
    ├── 📁 Investissements/
    │   ├── 📁 SCPI_Corum_Origin/
    │   │   ├── Bulletin_souscription.pdf
    │   │   └── Releve_annuel_2024.pdf
    │   └── 📁 Assurance_vie_Generali/
    │       └── Contrat.pdf
    ├── 📁 RIO/
    │   ├── RIO_2024.pdf
    │   └── RIO_2023.pdf
    └── 📁 Correspondance/
        ├── Email_suivi_2024-01-15.pdf
        └── Courrier_bienvenue.pdf
```

---

## ✨ Fonctionnalités à implémenter

### 1. Arborescence automatique

À la création d'un contact, créer automatiquement les dossiers :
- `[NOM Prénom - ID]/`
  - `Identité/`
  - `Fiscalité/`
  - `Investissements/`
  - `RIO/`
  - `Correspondance/`

---

### 2. Interface de navigation

Dans la page Documents ou dans la fiche contact :

```
┌─────────────────────────────────────────────────────────────┐
│  📁 Documents de Jean MARTIN                                │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│  📁 Identité   │  Nom           Type      Date      Actions │
│  📁 Fiscalité  │  ─────────────────────────────────────────│
│  📁 Invest...  │  CNI.pdf       PDF    15/01/2024  👁️ ⬇️ 🗑️ │
│    └ SCPI Co.. │  Justif...pdf  PDF    10/01/2024  👁️ ⬇️ 🗑️ │
│    └ Ass. vie  │                                            │
│  📁 RIO        │                                            │
│  📁 Corresp.   │      [Déposer un fichier ici]              │
│                │                                            │
└────────────────┴────────────────────────────────────────────┘
```

---

### 3. Upload par drag & drop

- Zone de drop dans chaque dossier
- Sélection du type de document
- Renommage automatique avec date
- Calcul du hash pour vérification d'intégrité

```typescript
const handleDrop = async (files: FileList, folder: string) => {
  for (const file of files) {
    const hash = await calculateHash(file);
    const newName = `${formatDate(new Date())}_${file.name}`;
    
    await uploadDocument({
      contactId,
      typeDocument: getTypeFromFolder(folder),
      file,
      nomFichier: newName,
      hash,
    });
  }
};
```

---

### 4. Prévisualisation intégrée

- **PDF** : Affichage inline avec pdf.js
- **Images** : Affichage direct
- **Autres** : Icône + téléchargement

```typescript
const PreviewModal = ({ document }) => {
  if (document.type === 'PDF') {
    return <PdfViewer src={document.path} />;
  }
  if (['JPG', 'PNG', 'GIF'].includes(document.type)) {
    return <img src={document.path} alt={document.name} />;
  }
  return <DownloadPrompt document={document} />;
};
```

---

### 5. Recherche dans les documents

- Recherche par nom de fichier
- Filtre par type de document
- Filtre par date

---

### 6. Actions sur les documents

| Action | Description |
|--------|-------------|
| 👁️ Voir | Ouvrir la prévisualisation |
| ⬇️ Télécharger | Télécharger le fichier |
| ✏️ Renommer | Changer le nom |
| 📂 Déplacer | Changer de dossier |
| 🗑️ Supprimer | Supprimer (avec confirmation) |

---

### 7. Stockage des fichiers

**Emplacement** : `{app_data}/documents/{contact_id}/`

**Sécurité** :
- Noms de fichiers hashés (optionnel, pour confidentialité)
- Hash SHA-256 stocké en DB pour vérification d'intégrité

```typescript
// Structure de stockage
interface StoredDocument {
  id: number;
  contactId: number;
  typeDocument: string;
  nomFichier: string;        // Nom affiché
  cheminFichier: string;     // Chemin réel (hashé ou non)
  hashFichier: string;       // SHA-256 pour intégrité
  dateDocument: Date;
  createdAt: Date;
}
```

---

## 🗂️ Fichiers à créer/modifier

### Nouveaux fichiers
```
src/components/documents/
├── DocumentTree.tsx        # Arborescence de dossiers
├── DocumentList.tsx        # Liste de fichiers
├── DocumentUpload.tsx      # Upload drag & drop (améliorer existant)
├── DocumentPreview.tsx     # Prévisualisation
├── PdfViewer.tsx           # Viewer PDF
└── DocumentActions.tsx     # Menu d'actions

src/lib/documents/
├── storage.ts              # Gestion du stockage
├── hash.ts                 # Calcul de hash
└── types.ts
```

### Modifications
- `src/pages/Documents.tsx` - Refonte complète
- `src/components/contacts/ContactDetail.tsx` - Intégrer vue documents
- `src-tauri/src/commands.rs` - Commandes fichiers

### Backend Rust (recommandé)
```rust
// Commandes Tauri
#[tauri::command]
fn create_contact_folders(contact_id: i64, contact_name: String) -> Result<(), String>

#[tauri::command]
fn save_document(contact_id: i64, folder: String, file_data: Vec<u8>, file_name: String) -> Result<Document, String>

#[tauri::command]
fn get_document_path(document_id: i64) -> Result<String, String>

#[tauri::command]
fn delete_document_file(document_id: i64) -> Result<(), String>
```

---

## 📝 Ordre de développement

1. **Étape 1** : Créer les dossiers automatiquement à la création d'un contact
2. **Étape 2** : Interface d'arborescence (navigation)
3. **Étape 3** : Upload de fichiers avec stockage
4. **Étape 4** : Liste des documents par dossier
5. **Étape 5** : Prévisualisation PDF
6. **Étape 6** : Actions (télécharger, renommer, supprimer)
7. **Étape 7** : Drag & drop
8. **Étape 8** : Recherche

**Attends ma validation après chaque étape.**

---

## ✅ Critères de validation

- [ ] Les dossiers sont créés automatiquement ❌
- [ ] L'arborescence s'affiche correctement ❌
- [x] L'upload fonctionne (basique)
- [x] Les fichiers sont bien stockés localement
- [ ] La prévisualisation PDF fonctionne ❌
- [ ] Le téléchargement fonctionne ❌
- [ ] La suppression fonctionne avec confirmation ❌
