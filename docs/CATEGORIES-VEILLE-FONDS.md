# Catégories Veille fonds — table de comparabilité

Table de référence : chaque libellé Cristalliance appartient à **une seule** famille. Les
libellés d'une même famille sont comparables entre eux — ils servent de pairs pour la médiane
de repli du badge (quand la référence Boursorama manque) et pour la compatibilité du
comparateur.

Cette table remplace la reconnaissance par mots-clés, source de deux erreurs constatées :
l'immobilier zone euro classé en actions européennes par effet d'ordre des règles, et
« Global Diversified Bond » pris pour un fonds diversifié à cause du mot anglais.

Les seuils de déclenchement du badge sont déduits de la **volatilité 3 ans mesurée** de chaque
fonds, apportée par l'import Cristalliance. La table porte seulement le profil de **repli**
(champ `volatility` de `fund-categories.json`), utilisé quand cette mesure manque ; il sert
aussi au comparateur pour reconnaître les fonds obligataires que le mot-clé « oblig » rate.

Trois règles complètent le calcul du badge, côté `fund-watchlist-diagnostic.ts` :

- Les seuils de **performance absolue** (horizon faible, correction à 1 mois, année solide)
  suivent le même profil que les seuils d'écart. Un recul de 3 % en un mois est du bruit pour un
  fonds actions et un accident pour un fonds à capital garanti : un seuil unique donnait deux
  sens opposés au même chiffre.
- Un fonds **devant sa référence** sur un an ne passe pas sous surveillance du seul fait d'une
  faiblesse absolue : le repli vient alors du marché, pas du fonds. La faiblesse est signalée en
  contexte, ce qui évite de tout allumer lors d'une baisse générale.
- La médiane de repli exige au moins `FUND_DIAGNOSTIC_MIN_PEERS` pairs (4) **hors le fonds
  lui-même**, et le libellé de la référence annonce le nombre de fonds retenus. Sous ce seuil,
  aucun badge : une médiane de deux fonds n'a pas le poids statistique que l'écart suggère, et
  l'ajout d'un seul fonds dans la famille pouvait faire disparaître l'alerte.

95 libellés Cristalliance : 94 répartis dans **32 familles**, plus le FCPR exclu du diagnostic.

Le regroupement suit un principe : la watchlist est l'**univers investissable des contrats**, pas
un échantillon de marché. Sur 438 fonds importés, 339 ne sont détenus par aucun client : la
médiane d'une famille répond donc à « ai-je mieux à proposer sur ce contrat ? », la seule question
qui débouche sur un arbitrage faisable. Une famille trop étroite ne produit aucun badge, faute des
4 pairs exigés — c'est ce qui a motivé la fusion de la Chine avec l'Asie, de la biotechnologie
avec la santé, de l'eau et des énergies alternatives avec l'écologie, du market neutral avec le
long/short, des emprunts d'État et des indexées inflation avec le crédit euro, et de l'allocation
« Autres » avec la flexible. Après ces fusions, un seul fonds favori reste sans pair : Axiom
European Banks, seul fonds de banques de l'offre.

---

## Actions — Europe

Décision : une seule zone Europe (France, Allemagne, Italie, Suisse, pays nordiques et zone
euro confondus), mais **scindée par capitalisation**. Les libellés sans mention de taille,
dont les Flex Cap, rejoignent les grandes.

### actions_europe_grandes

- Actions Zone Euro Grandes Cap.
- Actions Zone Euro Flex Cap
- Actions Europe Flex Cap
- Actions Europe Gdes Cap. "Value"
- Actions Europe Gdes Cap. Croissance
- Actions Europe Gdes Cap. Mixte
- Actions Europe du Nord
- Actions France Grandes Cap.
- Actions Allemagne Gdes Cap.
- Actions Italie
- Actions Suisse Grandes Cap.

### actions_europe_petites_moyennes

- Actions Zone Euro Moyennes Cap.
- Actions Zone Euro Petites Cap.
- Actions Europe Moyennes Cap.
- Actions Europe Petites Cap.
- Actions Europe hors UK Petites & Moy. Cap.
- Actions Europe du Nord Petites & Moy. Cap.
- Actions France Petites & Moy. Cap.

---

## Actions — autres zones

### actions_us

- Actions Etats-Unis Gdes Cap. "Value"
- Actions Etats-Unis Gdes Cap. Croissance
- Actions Etats-Unis Gdes Cap. Mixte
- US Equity Income

### actions_asie_pacifique

Décision : séparer le Japon, l'Asie hors Japon et l'Asie-Pacifique serait trop fin. Une seule
famille, la Chine incluse : elle pèse près d'un tiers des indices Asie hors Japon, et les deux
fonds chinois de l'offre n'auraient jamais eu de pair. Contrepartie assumée : un fonds japonais
se juge contre une médiane où le Japon est minoritaire, cycle et devise distincts — le comparateur
signale cette divergence géographique dans sa note de synthèse.

- Actions Asie hors Japon
- Actions Asie hors Japon Petites & Moy. Cap.
- Actions Asie-Pacifique avec Japon
- Actions Asie-Pacifique hors Japon
- Actions Chine
- Actions Chine - A Shares
- Japan Large-Cap Blend Equity
- Japan Large-Cap Growth Equity

### actions_emergents

- Actions Marchés Emergents
- Actions Marchés Emergents Petites & Moy. Cap.
- Actions Inde
- Allocation Marchés Emergents — *décision assumée : ce fonds détient aussi des obligations,
  donc il apparaîtra en retard face aux actions pures et tirera la médiane de la famille vers
  le bas. À revoir si les badges de cette famille paraissent trop flatteurs.*

### actions_international

- Actions International Flex-Cap.
- Actions International Gdes Cap. Croissance
- Actions International Gdes Cap. Mixte
- Actions International Petites Cap.
- Actions International Rendement
- Actions International Chariah Islamique

---

## Actions — sectorielles

Décision révisée : **une famille par libellé**, sauf trois regroupements thématiques. La santé
absorbe la biotechnologie, qui en est un sous-segment. L'écologie absorbe l'eau et les énergies
alternatives, qui partagent le thème de la transition. Les ressources naturelles et les métaux
précieux restent réunis. Sans ces fusions, cinq secteurs de l'offre comptaient un ou deux fonds
et n'obtenaient jamais de badge, dont deux favoris — BNP Aqua et Pictet Clean Energy.

- Actions Secteur Technologies
- Actions Secteur Finance — *seul fonds de banques de l'offre, aucun pair : pas de badge, c'est le
  seul cas où la référence de catégorie Boursorama garde une utilité.*
- Actions Secteur Matériaux & Industrie
- Actions Secteur Biens Conso. & Services
- Actions Secteur Autres

### actions_secteur_sante

- Actions Secteur Santé
- Actions Secteur Biotechnologie

### actions_secteur_ecologie

- Actions Secteur Ecologie
- Actions Secteur Eau
- Actions Secteur Energies Alternatives

### actions_secteur_ressources_metaux

Décision révisée : les deux libellés forment **une seule famille**. La source range des fonds
aurifères dans les ressources naturelles (AXA Or et Matières Premières), ce qui bloquait la
comparaison de trois fonds sur l'or. Contrepartie assumée : un fonds énergie ou agriculture
devient comparable à un fonds de mines d'or, alors que l'or suit les taux réels et le pétrole
le cycle. À revoir si les badges ou les verdicts de cette famille paraissent incohérents.

- Actions Secteur Métaux Précieux
- Actions Secteur Ressources Naturelles

---

## Diversifiés / allocation

Décision : scission par niveau de risque. Une allocation prudente et une allocation agressive
ne cherchent pas le même résultat, les comparer n'apprend rien.

### allocation_prudente

- Allocation EUR Prudente
- Allocation EUR Prudente - International

### allocation_moderee

- Allocation EUR Modérée
- Allocation EUR Modérée - International
- Allocation USD Modérée

### allocation_agressive

- Allocation EUR Agressive
- Allocation EUR Agressive - International
- Allocation USD Agressive

### allocation_flexible

La catégorie fourre-tout « Autres » rejoint la flexible, faute de mandat identifiable et d'un
second fonds pour lui faire une famille.

- Allocation EUR Flexible
- Allocation EUR Flexible - International
- Allocation Autres

---

## Obligations

Décision : scission par segment de risque. Le haut rendement se comporte à mi-chemin des
actions, l'emprunt d'État non — mais l'État et les indexées inflation rejoignent le crédit euro,
seuls fonds de leur libellé dans l'offre et dominés par le même facteur, la duration.

### oblig_credit_euro

- Obligations EUR Emprunts Privés
- Obligations EUR Diversifiées
- Obligations EUR Flexibles
- Obligations EUR Emprunts d'Etat
- Obligations Internationales Indexées sur l'Inflation Couvertes en EUR

### oblig_court_terme_euro

- Obligations EUR Très Court Terme
- Obligations EUR Diversifiées Court Terme
- Obligations EUR Emprunts Privés Court Terme

### oblig_haut_rendement

- Obligations EUR Haut Rendement
- Obligations International Haut Rendement Couvertes en EUR

### oblig_emergents

- Obligations Marchés Emergents
- Global Emerging Markets Corporate Bond - EUR Hedged

### oblig_international_flexible

- Obligations Internationales Flexibles
- Obligations Internationales Flexibles Couvertes en EUR
- Obligations Internationales Flexibles Couvertes en USD
- Global Diversified Bond
- Global Diversified Bond - EUR Hedged

### oblig_echeance

- Obligations à échéance
- Fonds à horizon 2026-2030

### oblig_subordonnees

- EUR Subordinated Bond

### oblig_chariah

- Obligations International Chariah Islamique

---

## Convertibles

### convertibles

- Convertibles Europe
- Convertibles International

---

## Alternatifs

### alt_event_driven

- Alt - Event Driven

### alt_long_short

Le market neutral rejoint le long/short actions : même moteur (sélection de titres avec couverture
du marché), même usage en portefeuille, et deux fonds seuls ne faisaient pas de médiane. Les
seuils du diagnostic ne s'en trouvent pas modifiés : ils viennent de la volatilité 3 ans **mesurée**
du fonds, la classe de la famille ne servant de repli qu'à défaut de mesure.

- Alt - Long/Short Actions - Europe
- Alt - Long/Short Actions - International
- Alt - Market Neutral - Actions

---

## Immobilier

Décision : deux familles, le direct et l'indirect n'ont pas le même comportement.

### immobilier_indirect

- Immobilier - Indirect Zone Euro

### immobilier_direct

- IMMOBILIER - DIRECT AUTRES

---

## Capital garanti / protégé

Décision : une seule famille, garanti et protégé sont comparables entre eux.

### capital_garanti_protege

- FONDS A CAPITAL GARANTI
- FONDS A CAPITAL PROTEGE

---

## Exclus du diagnostic

Décision : aucun badge sur ces catégories, plutôt qu'un badge trompeur. La valorisation est
trimestrielle et lissée, un écart de performance contre une catégorie n'y a pas de sens.

- FCPR

---

## Libellés inconnus

Décision : repli sur la reconnaissance par mots-clés actuelle. Un libellé absent de la table
reste donc classé approximativement, mais n'est jamais laissé sans famille.

---

## Défauts retenus faute d'arbitrage explicite

Ces points n'ont pas été tranchés. J'ai retenu la structure telle qu'elle était écrite ; dis
si tu veux changer.

| Point | Défaut retenu |
|---|---|
| US Equity Income | Avec les grandes cap. américaines |
| Actions International Chariah Islamique | Avec les autres Actions International |
| Allocation « - International » et USD | Avec leur équivalent EUR de même niveau de risque |
| Obligations court terme | Famille séparée, tous segments confondus |
| Obligations couvertes / non couvertes | Comparables entre elles |
| Fonds à horizon 2026-2030 | Avec les obligations à échéance |
| Convertibles Europe / International | Comparables entre elles |
| Alt Long/Short Europe / International | Comparables entre elles |

### Scission par capitalisation : Europe uniquement

Décision : la scission grandes / petites et moyennes ne s'applique qu'à l'Europe. Ailleurs,
une seule zone ne compte qu'un libellé de petites capitalisations — `Actions Asie hors Japon
Petites & Moy. Cap.`, `Actions Marchés Emergents Petites & Moy. Cap.` et `Actions
International Petites Cap.` — et les isoler produirait trois familles sans aucun pair.
