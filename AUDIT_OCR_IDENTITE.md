# Audit OCR — carte d'identité et passeport

_Date : 2026-11-21 · Périmètre : `src/lib/identity/`, `src/lib/documents/extraction/` · Analyse du code, sans mesure sur un jeu de documents réels._

## Comment ça marche aujourd'hui

1. Le fichier (photo ou PDF) est rendu en image, orienté selon l'EXIF, puis testé à 90° / 180° / 270°.
2. Des **zones fixes** sont découpées par proportion : bande MRZ = bas 42 % (CNI) ou 28 % (passeport), recto = haut de l'image.
3. **Tesseract.js** lit chaque zone avec le modèle **`fra`** (français généraliste) :
   - MRZ : mode bloc + liste de caractères autorisés (A–Z, 0–9, `<`), deux passes (brute + seuillage simple), on garde celle qui passe le mieux les **clés de contrôle ICAO** ;
   - champs visuels (nom, date, lieu de naissance) : mode automatique, puis analyse par expressions régulières.
4. Les champs MRZ vérifiés priment sur la lecture visuelle.

Points solides : clés de contrôle ICAO, choix de la meilleure passe, rotation, priorité MRZ > visuel, tout est local (rien ne sort du poste).

## Pourquoi ce n'est pas fiable

| # | Faiblesse | Effet pour l'utilisateur | Gravité |
|---|---|---|---|
| 1 | **Modèle `fra` pour la MRZ.** La MRZ est imprimée en police OCR-B ; un modèle texte généraliste confond `0/O`, `8/B`, `1/I`, `5/S` et rate les `<`. | « MRZ détectée mais illisible » alors que la photo est correcte. | **Haute** |
| 2 | **Découpe par proportions fixes.** Si la carte n'occupe pas toute la photo (fond, table, doigts, perspective), la bande MRZ coupée ne contient pas la MRZ. | Échec sur les photos prises au téléphone, qui sont le cas courant. | **Haute** |
| 3 | **Aucune correction guidée par les clés de contrôle.** On détecte une erreur, on ne tente pas de la corriger (ex. remplacer `O` par `0` dans un champ numérique jusqu'à ce que la clé soit bonne). | Une seule lettre mal lue invalide toute la date ou le n° de document. | Moyenne (gain facile) |
| 4 | **Seuillage global fixe** (seuils 95 / 145) et pas de redressement fin (seulement 90° / 180° / 270°). | Reflets, ombres, photo légèrement penchée → texte perdu. | Moyenne |
| 5 | **Aucun jeu de test réel mesuré.** Les tests unitaires couvrent l'analyse du texte, pas la lecture d'images. | Impossible de savoir si une modification améliore ou dégrade. | Moyenne |

## Ce qui existe déjà (open source et commercial)

| Option | Type | Local / RGPD | Intégration dans l'app | Fiabilité attendue |
|---|---|---|---|---|
| **Modèle Tesseract OCR-B / MRZ** (ex. `tessdata_ocrb`, modèle de *web-mrz-reader*) | Fichier `.traineddata` | Local | **Très simple** : remplacer `fra` par ce modèle pour les passes MRZ | Nette amélioration sur la MRZ |
| **PassportEye / mrzmini** | Python (MIT) : détection de la MRZ par morphologie + Tesseract | Local | L'algorithme de **détection de la bande MRZ** se porte en JS (canvas) | Corrige la faiblesse n° 2 |
| **FastMRZ** | Python, détection ONNX + modèle Tesseract MRZ | Local | Modèle ONNX réutilisable (onnxruntime-web ou Rust `ort`) ; **licence AGPL-3.0** à vérifier | Bonne |
| **MRZScanner (docsaid)** | Modèles ONNX détection + reconnaissance (2025) | Local | Via ONNX ; licence à vérifier | Bonne |
| **OCR natif Windows** (`Windows.Media.Ocr`) | API système, appelable depuis Rust (crate `windows`) | Local, gratuit | Commande Tauri côté Rust | Meilleur que Tesseract sur les champs visuels photographiés |
| **Dynamsoft MRZ Scanner** | SDK commercial C++ / .NET, hors ligne | Local | FFI Rust ; **licence payante** | Très élevée (détection du bord + redressement inclus) |
| **IA de vision en ligne** (Gemini, déjà connecté pour la newsletter) | API cloud | **Envoi de la CNI à un tiers** | Simple | Très élevée, mais **à éviter** : pièce d'identité = donnée sensible (RGPD, consentement, sous-traitance) |

## Recommandation

**Étape 1 — gains rapides, même technologie (1 à 2 jours) :**
1. Utiliser un **modèle OCR-B dédié à la MRZ** pour les passes MRZ (garder `fra` pour les champs visuels).
2. **Corriger avec les clés de contrôle** : pour chaque champ MRZ en échec, essayer les substitutions courantes (`O↔0`, `I↔1`, `B↔8`, `S↔5`, `Z↔2`) selon le type attendu (chiffre / lettre) jusqu'à ce que la clé soit valide.
3. **Seuillage adaptatif** (Otsu) et une passe supplémentaire à une autre échelle.

**Étape 2 — robustesse aux photos (2 à 3 jours) :**
4. **Détecter la bande MRZ** dans l'image (algorithme de PassportEye : gradient + morphologie) au lieu de proportions fixes ; découpe et redressement autour de la zone trouvée.

**Étape 3 — si l'étape 2 ne suffit pas :**
5. Passer les **champs visuels** sur l'OCR natif Windows (local, gratuit).
6. En dernier recours, **SDK commercial hors ligne** (Dynamsoft) : meilleure fiabilité, coût de licence.

**Préalable à tout :** constituer un **petit banc d'essai local** (10 à 20 photos et scans de CNI et passeports, **hors dépôt public**, cf. `donnees-sensibles.mdc`) et mesurer le taux de MRZ vérifiée avant / après chaque étape.

## Sources

- [PassportEye (GitHub)](https://github.com/xhook/PassportEye) · [PassportEye (PyPI)](https://pypi.org/project/PassportEye)
- [mrzmini (PyPI)](https://pypi.org/project/mrzmini/)
- [FastMRZ (PyPI)](https://pypi.org/project/fastmrz)
- [MRZScanner docsaid (PyPI)](https://pypi.org/project/mrzscanner-docsaid/)
- [tessdata_ocrb](https://awesome.ecosyste.ms/projects/github.com%2Fshreeshrii%2Ftessdata_ocrb)
- [Lecteur MRZ navigateur avec Tesseract.js](https://dev.to/ilhannegis/browser-based-passport-mrz-reader-with-tesseractjs-655)
- [Dynamsoft MRZ Scanner hors ligne](https://www.dynamsoft.com/use-cases/mrz-scanner/)
- [Extraction MRZ par réseaux convolutifs (arXiv)](https://arxiv.org/pdf/2009.05489)
