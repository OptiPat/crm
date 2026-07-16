# Bulletins SCPI trimestriels — workflow CGP

Checklist à chaque trimestre (T1, T2, T3, T4). Durée typique : sélection PDF → envoi clients en ~30 min.

## 1. Préparer la campagne (dans le CRM)

- **Suivi → Envois** — checklist **Campagne bulletins SCPI** → bouton **Préparer**
- Sélectionner un ou plusieurs PDF bulletins reçus des sociétés de gestion
- Nom de fichier : inclure le **nom SCPI** reconnu dans le CRM (`nom_produit` investissement), ex. `Comete_T1_2026.pdf`, `Transitions_Europe_T1_2026.pdf`

## 2. Traitement automatique

- **OCR Mistral** sur chaque PDF (bulletins scannés ou layout complexe)
- **Résumé Mistral** (markdown court par SCPI)
- **Prepare CRM** : matching `nom_produit` ↔ investissements clients → file **Suivi → Envois → Prêts à envoyer**

**Prérequis** : clé API Mistral dans **Newsletter → Paramètres** (même clé que les newsletters).

Le CRM aligne chaque bulletin sur le **nom SCPI le plus long** présent en portefeuille (ex. `Transitions_Europe_T1.pdf` → `Transitions Europe`, pas `Europe`).

## 3. Contrôler avant envoi

- Ouvrir **1 contact** : bouton envoi → dialogue avec **objet + corps HTML** (digest complet)
- Vérifier les noms SCPI et le contenu ; relancer **Préparer** si besoin
- **Retirer** / **Ne plus proposer** = nettoyer la file (pas définitif) ; relancer au trimestre suivant ou après prepare

## 4. Envoyer

- Envoi individuel (aperçu) ou **sélection + envoi groupé**
- Historique : onglet **Journal** (pas Envoyés / À relancer pour les bulletins SCPI)

## Rappels

| Situation | Action |
|-----------|--------|
| Digest ancien après mise à jour CRM | Relancer Préparer (étape 1) |
| Client absent de la file | Vérifier email, catégorie CLIENT, investissement SCPI + `nom_produit` |
| Déjà envoyé ce trimestre | Normal : pas de doublon même période |
| Enfant foyer | SCPI **foyer commun** : pas d'envoi ; SCPI **perso** : oui |

Modèle email : **Bulletin SCPI trimestriel** (+ variante tu). Variables injectées : `{{periode}}`, `{{scpi_intro_tu}}`, `{{bulletin_resume_html}}`, etc.
