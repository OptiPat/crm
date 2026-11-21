# Audit UI — CRM (impact utilisateur uniquement)

_Date : 2026-11-21 · Périmètre : `src/`. Analyse statique, sans test visuel. Ne sont retenus que les points **visibles ou ressentis par l'utilisateur** ; la maintenabilité du code est hors sujet._

## Synthèse

| Axe | Note | Ce que l'utilisateur ressent |
|---|---|---|
| Lisibilité du texte | 🔴 D | Beaucoup de texte en 9–11 px, fatigant à lire, peu de hiérarchie. |
| Cohérence des couleurs | 🟠 C | Un même statut (succès, alerte) n'a pas la même couleur d'un écran à l'autre. |
| Infobulles & boutons icône | 🟠 C | Les boutons icône ne s'expliquent qu'au survol prolongé de la souris (`title`). |
| Comportements inattendus | 🟠 C | Des boutons peuvent envoyer un formulaire par erreur ; des listes peuvent mélanger les saisies. |
| Chargement & états vides | 🟠 C+ | Spinners qui font sauter la page ; listes vides peu guidantes. |
| Mise en page | 🟢 B- | Quelques zones à largeur fixe trop larges pour une petite fenêtre. |

---

## 1. Lisibilité — priorité haute

- `text-[10px]` ×185, `text-[11px]` ×159, `text-[9px]` ×14, `text-[7px]` ×1 dans l'interface (hors aperçus PDF/étiquettes en `mm`/`pt`, qui sont légitimes).
- Les titres sont rares (`text-lg` 80, `text-xl` 16) face à 2 800 textes en `xs`/`sm` : l'œil ne sait pas où regarder.

✅ _Lot D fait (plancher)_ : tous les textes de 7 à 10 px de l'interface passent à 11 px, dans environ 85 fichiers. Exceptions volontaires : aperçus simulés (document CIF, cadre téléphone, boîte mail newsletter) et libellés de carte et de camembert. Les titres plus marqués restent à faire.

## 2. Couleurs de statut — priorité haute

- Succès affiché tantôt en `green`, tantôt en `emerald` ; alertes en `amber`/`orange` selon les écrans ; ~1 450 couleurs choisies au cas par cas.
- Conséquence : un badge « Validé » ou un encart d'alerte n'a pas le même aspect partout, et l'utilisateur doit réapprendre chaque écran.

⚠️ _Lot C réévalué_ : en vérifiant contexte par contexte, les couleurs « mélangées » sont presque toutes **des catégories voulues** et non des statuts incohérents. Le vert désigne le type « Client » et l'émeraude les filleuls et biens. L'orange sert aux niveaux de priorité, aux étapes du pipe, aux rangs et aux confiances (rouge → orange → vert). Les remplacer en masse effacerait des distinctions utiles. Seul correctif appliqué : « Confirmé » (aperçu agenda) passe en émeraude comme le reste de la carte.

## 3. Boutons icône & infobulles — priorité haute

- 121 boutons icône sur 135 n'ont ni libellé ni vraie infobulle. 381 éléments s'expliquent uniquement par l'attribut `title` : il apparaît tard, avec un style système, et jamais au clavier.
- 12 images sans texte alternatif (ex. `TemplateEmailTutoiementPanel.tsx`).

✅ _Lot B fait_ : en réalité, chaque bouton icône avait déjà un `aria-label` ou un `title`. `Button` affiche désormais une infobulle Radix (300 ms, visible au focus clavier) à partir de `title`, ou de l'`aria-label` pour `size="icon"`. Un focus clavier visible par défaut est ajouté dans `globals.css` pour les ~200 boutons natifs qui n'en avaient pas.

## 4. Comportements inattendus — priorité haute

- ✅ _Lot A fait_ : 226 boutons cliquables (`<button>`/`<Button>`) sans `type` ont reçu `type="button"`. Aucun n'était dans un `<form>` du même fichier ; le correctif protège ceux qui sont rendus dans le formulaire d'un composant parent.
- ✅ _Vérifié_ : les clés d'index (59) ne concernent qu'une liste éditable (`ConditionBuilder`), entièrement contrôlée par ses props → aucun bug visible, pas de changement.
- 214 boutons « maison » n'ont pas le contour de focus des boutons standards : à la navigation clavier, on perd la trace de l'élément actif.

**À faire** : `type="button"` partout hors bouton d'envoi ; identifiant stable pour les listes éditables ; focus visible sur tous les boutons.

## 5. Chargement & états vides — priorité moyenne

- Spinner (`Loader2`) dans 78 fichiers contre des squelettes dans 23 : le contenu « saute » quand les données arrivent.
- Une vingtaine d'états vides, rédigés différemment, souvent sans action proposée.

✅ _Lot E fait_ : nouveau `ui/skeleton.tsx` (`Skeleton`, `ListSkeleton`). Les « Chargement… » en texte sont remplacés par des squelettes dans Documents, Investissements, Tâches, Suivi (contacts par étiquette), Pipe (liste + tableau) et Pipe parrainage. Les états vides de ces pages étaient déjà bons (icône, explication, actions) : inchangés.

_Proposition initiale_ : squelettes sur les listes et tableaux principaux (Contacts, Documents, Investissements, Pipe) ; état vide uniforme avec icône, phrase courte et bouton d'action (« Ajouter un contact »).

## 6. Mise en page — priorité basse

✅ _Lot F fait_ : les « 1600 px » étaient des `max-w` (aucun défilement) et les z-index passent par un contexte de calques. Le seul calque fait à la main (fusion d'identité RIO) se ferme maintenant avec Échap et prend le focus. Les tailles de dialogue n'ont pas été modifiées.

- ~~`w-[1600px]` ×12 : défilement horizontal dès que la fenêtre est réduite.~~
- Dialogues de hauteurs variables (`90vh` ×30, `85vh` ×12) : tailles différentes pour des usages similaires.
- Ordre d'empilement (11 valeurs de z-index, jusqu'à `z-[200]`) : risque de menu ou popover caché sous une modale.

---

## Plan d'action

| Lot | Contenu visible | Effort | Impact utilisateur |
|---|---|---|---|
| **A** | `type="button"` + clés stables dans les listes éditables | S | Fort : supprime des bugs réels |
| **B** | Infobulles + libellés sur les boutons icône, focus visible | M | Fort |
| **C** | Couleurs de statut unifiées (badges, encarts) | M | Fort |
| **D** | Taille de texte minimale + titres plus marqués | M | Fort |
| **E** | Squelettes de chargement + états vides avec action | M | Moyen |
| **F** | Largeurs fixes, tailles de dialogue, empilement | S | Faible à moyen |

Ordre conseillé : A → B → C → D → E → F.
