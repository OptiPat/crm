# Audit breaking changes — React 19 / Vite 8 / Tailwind 4 / lucide 1.x

Date : mai 2026

## Résumé

| Stack | Risque | Statut |
|-------|--------|--------|
| React 18 → 19 | Moyen | ✅ Compile, pas de `defaultProps` / APIs supprimées trouvées |
| Vite 5 → 8 | Moyen | ✅ `npm run build` OK |
| Tailwind 3 → 4 | Élevé (UI) | ✅ Thème migré + correctifs `outline-hidden` / `shrink-0` |
| lucide 0.x → 1.16 | Faible | ✅ Toutes les icônes importées valides (`npm run check:icons`) |
| pdfjs 5.4 → 5.7 | Moyen | ✅ Worker corrigé (était cassé avant upgrade) |
| Tauri 2.11 | Faible | ✅ npm ↔ Rust alignés |
| Recharts 3.8 | Faible | ✅ Compatible React 19 |

## Corrections appliquées

### 1. PDF.js — worker manquant (bug réel)

**Avant :** `workerSrc = '/pdf.worker.min.mjs'` — fichier absent de `public/`.

**Après :** import Vite depuis `pdfjs-dist/build/pdf.worker.min.mjs?url` dans `src/lib/pdf/extractor.ts`.

→ L’import / OCR PDF doit fonctionner en dev et en build.

### 2. Tailwind v4 — `outline-none`

En v4, `outline-none` ne masque plus l’outline comme en v3. Remplacé par `outline-hidden` dans les composants UI (button, input, dialog, select, etc.).

### 3. Tailwind v4 — `flex-shrink-0`

Renommé en `shrink-0` (alias encore supporté, mais aligné sur v4).

### 4. Animations shadcn

`tw-animate-css` ajouté dans `globals.css` pour `animate-in` / `animate-out` (dialogs, selects, popovers).

## Points à valider manuellement (UI)

Lancer `.\dev.ps1` et vérifier visuellement :

- [ ] **Login / Unlock** — champs, boutons, focus ring
- [ ] **Sidebar + Dashboard** — couleurs primaire/or, graphiques Recharts
- [ ] **Contacts** — liste, badges couleur, modals
- [ ] **Documents** — upload PDF + extraction texte (worker)
- [ ] **Dialogs / Selects** — animations ouverture/fermeture
- [ ] **Paramètres** — formulaire SMTP

## Breaking changes non bloquants (connus)

### React 19

- `StrictMode` peut double-appeler les effets en dev (comportement normal).
- `forwardRef` toujours utilisé dans shadcn/Radix — OK.

### Vite 8

- Bundler Rolldown par défaut — build OK.
- Chunk JS ~1.9 Mo (pdfjs + xlsx) — warning taille, pas une régression.

### Tailwind 4

- Config JS supprimée → `@theme inline` dans `globals.css`.
- Pas de mode sombre `.dark` configuré (projet en mode clair uniquement).

### lucide-react 1.x

- Aucune icône importée invalide détectée.

## Commandes de vérification

```powershell
npm run check:icons   # icônes lucide
npx tsc --noEmit      # TypeScript
npm run build         # build production frontend
npm run check:upgrade # les trois ci-dessus
```

## Si quelque chose est cassé visuellement

1. Noter la page / composant.
2. Inspecter les classes Tailwind dans le navigateur (devtools).
3. Ajuster `@theme inline` dans `src/styles/globals.css`.

Référence shadcn Tailwind v4 : https://ui.shadcn.com/docs/tailwind-v4
