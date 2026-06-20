# Bulletins SCPI trimestriels — workflow CGP

Checklist à chaque trimestre (T1, T2, T3, T4). Durée typique : dépôt PDF → envoi clients en ~30 min.

## 1. Déposer les PDF

- Dossier Windows : `D:\n8n_bridge\scpi\a-traiter\`
- Nom de fichier : inclure le **nom SCPI** reconnu dans le CRM (`nom_produit` investissement), ex. `Comete_T1_2026.pdf`, `Transitions_Europe_T1_2026.pdf`
- Plusieurs PDF possibles (10+)

## 2. Lancer n8n

**Depuis le CRM (recommandé)** — Suivi → Envois → **Lancer workflow n8n** (après avoir collé l’URL webhook ci-dessous dans Paramètres → Intégrations).

**URL webhook production** (workflow activé, n8n démarré — pas besoin d’ouvrir la page n8n) :

`http://localhost:5678/webhook/scpi-campagne-trimestre`

**Alternative** : bouton manuel **« Lancer résumé bulletins »** dans n8n (même workflow).

- Mistral produit un `.md` par bulletin dans `D:\n8n_bridge\scpi\resumes\`
- PDF archivés dans `traites\`
- Fin du workflow : `POST prepare` automatique vers le CRM

## 3. Préparer la campagne CRM

- **Avant le prepare** (recommandé) : `GET /api/scpi/products` avec le même token Bearer → liste des `nom_produit` SCPI présents dans le portefeuille CRM. n8n choisit le nom **le plus long** qui matche le fichier PDF (ex. `Transitions_Europe_T1.pdf` → `Transitions Europe`, pas `Europe`).
- Fin du workflow n8n : appel `POST /api/scpi/campaigns/prepare` (Bearer token Paramètres → Intégrations)
- Corps JSON : `{ "periode": "T1 2026", "bulletins": [ { "nom_produit": "…", "summary_markdown": "…" } ] }`
- Le CRM matche `nom_produit` ↔ investissements SCPI clients et remplit **Suivi → Envois → Prêts à envoyer**

## 4. Contrôler avant envoi

- Ouvrir **1 contact** : bouton envoi → dialogue avec **objet + corps HTML** (digest complet)
- Vérifier les noms SCPI et le contenu ; corriger le prompt n8n si besoin, puis **relancer prepare** (étape 3)
- **Retirer** / **Ne plus proposer** = nettoyer la file (pas définitif) ; relancer n8n au trimestre suivant ou après prepare

## 5. Envoyer

- Envoi individuel (aperçu) ou **sélection + envoi groupé**
- Historique : onglet **Journal** (pas Envoyés / À relancer pour les bulletins SCPI)

## Rappels

| Situation | Action |
|-----------|--------|
| Digest ancien après mise à jour CRM | Relancer n8n prepare (étape 3) |
| Client absent de la file | Vérifier email, catégorie CLIENT, investissement SCPI + `nom_produit` |
| Déjà envoyé ce trimestre | Normal : pas de doublon même période |
| Enfant foyer | SCPI **foyer commun** : pas d’envoi ; SCPI **perso** : oui |

## URLs & token

**Paramètres → Intégrations** : port API locale, token Bearer, URLs n8n Docker :

- `GET …/api/scpi/products` — noms SCPI du portefeuille
- `POST …/api/scpi/campaigns/prepare` — remplir la file Envois
- **Webhook n8n (CRM → workflow)** : `http://localhost:5678/webhook/scpi-campagne-trimestre`

Modèle email : **Bulletin SCPI trimestriel** (+ variante tu). Variables injectées : `{{periode}}`, `{{scpi_intro_tu}}`, `{{bulletin_resume_html}}`, etc.
