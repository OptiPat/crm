# Newsletter patrimoniale

Module **Newsletter** du CRM : rédaction assistée (Mistral), choix des destinataires, envoi groupé via Gmail, historique et désinscriptions.

## Parcours type

1. **Newsletter → Paramètres** : clé API Mistral, ton éditorial, délai entre envois.
2. **Paramètres → Emails & envois → Connexion** : connexion Gmail (OAuth).
3. **Newsletter → Composer** :
   - Cocher / décocher les destinataires (tous avec email par défaut, sauf désinscrits).
   - Générer le contenu avec Mistral ou **Dupliquer la dernière édition**.
   - Affiner via le chat Mistral.
   - **M'envoyer un test** puis **Préparer la campagne**.
4. **Envoyer la campagne** : confirmation obligatoire ; bouton **Annuler l'envoi** pendant le déroulement.

## Destinataires

- Liste complète des contacts avec recherche.
- Coché par défaut : email renseigné et non désinscrit newsletter (prescripteurs inclus).
- Décocher manuellement pour exclure quelqu'un de **cette édition** uniquement.
- La sélection est mémorisée dans le brouillon (session) tant que vous n'avez pas rechargé après préparation.

## Désinscription

- Lien **Se désinscrire** dans le pied de page du mail (mailto prérempli).
- Enregistrement automatique dans le CRM ; le contact n'est plus coché aux éditions suivantes.
- Pas de case manuelle sur la fiche contact.

## Modèle email

- Un seul modèle **Newsletter** est réutilisé et mis à jour à chaque préparation (pas de multiplication de templates).

## Historique

- Chaque **Préparer la campagne** crée une édition dans **Historique des éditions**.
- Détail : destinataires, date d'envoi par contact, erreurs éventuelles.

## Fichiers utiles (développeurs)

| Zone | Emplacement |
|------|-------------|
| UI | `src/pages/Newsletter.tsx`, `src/components/newsletter/` |
| HTML email | `src/lib/newsletter/newsletter-html.ts` |
| API Tauri | `src/lib/api/tauri-newsletter.ts` |
| Backend | `src-tauri/src/newsletter/`, `operations.rs` (audience + historique) |
| Tables | `newsletter_editions`, `newsletter_edition_recipients` |

## Connexion Gmail

Voir [GUIDE_CONNEXION_GMAIL.md](./GUIDE_CONNEXION_GMAIL.md) et [EMAIL_OAUTH_SETUP.md](./EMAIL_OAUTH_SETUP.md).
