# 📝 Template pour le prochain module

Copiez ce message dans une **nouvelle discussion Cursor** :

---

```markdown
# 🎯 Mission : Module PDF OCR (Import et Lecture)

## Contexte
Je développe **Patrimoine CRM**, un logiciel desktop pour CGP.
- Stack : Tauri 2 + React + TypeScript + Tailwind + SQLite
- **Phase 1 terminée** : Contacts, Emails, Alertes ✅
- **Dashboard terminé** : KPIs + graphiques ✅
- **Investissements terminé** : CRUD complet ✅
- Je travaille maintenant sur : **PDF OCR**

## État actuel
- L'upload basique de documents existe déjà
- Les types de documents sont définis en DB
- **Il manque** : L'extraction automatique des données (OCR)

## Fichiers à lire
1. @prompts/CONTEXTE_GLOBAL.md
2. @prompts/PROMPT_PDF_OCR.md
3. @d:\crm\

## Ce que je veux
1. Extraction de texte depuis PDF natifs (pdfjs-dist)
2. OCR pour PDF scannés (Tesseract.js - 100% local)
3. Parsers intelligents pour détecter les données (RIO, avis imposition, RIB...)
4. Interface de validation des données extraites
5. Support des PDF multi-personnes (couples)

## Documents à lire
- RIO (Recueil d'Informations et d'Objectifs)
- Fiche profil risque
- DER (Document d'Entrée en Relation)
- Relevés de compte
- RIB
- Avis d'imposition

## Règles strictes
1. **UNE fonctionnalité à la fois** - Stop après chaque étape
2. **Attends ma validation** - Ne continue jamais sans mon "OK"
3. **Code complet** - Jamais de "...", jamais de raccourcis
4. **Mode Agent** - Tu dois créer/modifier les fichiers directement
5. **100% local** - Aucune API cloud (pas Google Vision, etc.)

## On commence
Lis les fichiers, puis propose-moi l'étape 1.
Explique ce que tu vas faire AVANT de le faire.
```

---

## 💡 Pourquoi commencer par PDF OCR ?

1. **Très utile** : Évite de retaper manuellement les infos des clients
2. **Gain de temps** : Import automatique depuis les documents reçus
3. **Différenciant** : Peu de CRM ont cette fonctionnalité
4. **Local** : Tesseract.js garantit la confidentialité

---

## ⏱️ Durée estimée

| Étape | Temps |
|-------|-------|
| 1. Extraction PDF natif | 15 min |
| 2. OCR Tesseract | 20 min |
| 3. Parser générique | 20 min |
| 4. Interface validation | 15 min |
| 5. Parser RIO | 20 min |
| 6. Détection couples | 15 min |
| 7. Autres parsers | 30 min |

**Total estimé : 2h - 2h30**
