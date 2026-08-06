import type {
  CompareResponse,
  UcFundExpositionSnapshot,
  UcFundResultScore,
} from "@/lib/api/tauri-uc-comparator";
import {
  criterionDesignatesLeader,
  formatCriterionRawValue,
  fundsInRankOrder,
  metricsForIsin,
  resolveCriterionWinners,
  ucConfidenceThreshold,
} from "@/lib/fund-watchlist/uc-comparator-summary";

export type UcTechnicalAnalystSection = {
  title: string;
  paragraphs: string[];
};

export type UcTechnicalAnalystNote = {
  sections: UcTechnicalAnalystSection[];
};

const ASIA_GEO_LABELS = [
  "Taiwan",
  "Taïwan",
  "Chine",
  "Corée du Sud",
  "Hong Kong",
  "Singapour",
  "Japon",
];

const INDUSTRIAL_SECTOR_LABELS = ["Industriels", "Industrie", "Industrial"];

const PERF_HORIZON_LABELS: Record<string, string> = {
  perf_1an: "1 an",
  perf_3ans: "3 ans",
  perf_5ans: "5 ans",
};

function shortFundName(nom: string): string {
  return nom;
}

function fundByIsin(results: UcFundResultScore[], isin: string): UcFundResultScore | undefined {
  return results.find((f) => f.isin === isin);
}

function expositionForIsin(
  exposition: UcFundExpositionSnapshot[],
  isin: string
): UcFundExpositionSnapshot | undefined {
  return exposition.find((e) => e.isin === isin);
}

function weightInSlices(
  slices: { label: string; weight_percent: number }[],
  matcher: (label: string) => boolean
): number {
  return slices
    .filter((s) => matcher(s.label))
    .reduce((sum, s) => sum + s.weight_percent, 0);
}

function topSlices(
  slices: { label: string; weight_percent: number }[],
  limit = 2
): { label: string; weight_percent: number }[] {
  return [...slices].sort((a, b) => b.weight_percent - a.weight_percent).slice(0, limit);
}

function usWeight(expo: UcFundExpositionSnapshot): number {
  return weightInSlices(expo.geo, (l) => /états-unis|etats-unis/i.test(l));
}

function asiaWeight(expo: UcFundExpositionSnapshot): number {
  return weightInSlices(expo.geo, (l) =>
    ASIA_GEO_LABELS.some((region) => l.toLowerCase().includes(region.toLowerCase()))
  );
}

function dominantSector(expo: UcFundExpositionSnapshot): { label: string; weight: number } | null {
  const top = topSlices(expo.sectors, 1)[0];
  if (!top) return null;
  return { label: top.label, weight: top.weight_percent };
}

/**
 * Un secteur lourd chez un fonds et absent des autres change le moteur de performance, même quand
 * tous partagent le même secteur dominant. Trois fonds « or » notés ensemble avaient tous
 * « Matières premières de base » en dominant, et le tiers d'énergie de l'un d'eux (Exxon Mobil en
 * 4e ligne) n'apparaissait nulle part dans la note remise en comité.
 */
const SECTOR_DIVERGENCE_MIN_WEIGHT = 20;
const SECTOR_DIVERGENCE_MAX_OTHERS = 5;

function exclusiveExposures(
  funds: UcFundResultScore[],
  exposition: UcFundExpositionSnapshot[],
  pick: (expo: UcFundExpositionSnapshot) => { label: string; weight_percent: number }[]
): { label: string; nom: string; weight: number }[] {
  const snapshots = funds.flatMap((fund) => {
    const expo = expositionForIsin(exposition, fund.isin);
    return expo ? [{ fund, expo }] : [];
  });
  if (snapshots.length < 2) return [];

  const labels = new Set(snapshots.flatMap((s) => pick(s.expo).map((slice) => slice.label)));
  const divergences: { label: string; nom: string; weight: number }[] = [];

  for (const label of labels) {
    const weights = snapshots.map((s) => ({
      nom: s.fund.nom,
      weight: weightInSlices(pick(s.expo), (l) => l === label),
    }));
    const top = weights.reduce((a, b) => (b.weight > a.weight ? b : a));
    if (top.weight < SECTOR_DIVERGENCE_MIN_WEIGHT) continue;
    const others = weights.filter((w) => w !== top);
    if (others.some((w) => w.weight > SECTOR_DIVERGENCE_MAX_OTHERS)) continue;
    divergences.push({ label, nom: top.nom, weight: top.weight });
  }

  return divergences.sort((a, b) => b.weight - a.weight).slice(0, 2);
}

function sectorDivergences(
  funds: UcFundResultScore[],
  exposition: UcFundExpositionSnapshot[]
): string[] {
  return exclusiveExposures(funds, exposition, (expo) => expo.sectors).map(
    (d) =>
      `Divergence sectorielle — ${shortFundName(d.nom)} porte ${d.weight.toFixed(1)} % ${d.label}, ` +
      `secteur quasi absent des autres fonds comparés : son moteur de performance diffère malgré la catégorie commune.`
  );
}

/**
 * Même logique sur les zones. Indispensable pour les familles qui réunissent volontairement des
 * sous-catégories voisines : un fonds « Asie-Pacifique avec Japon » à 21 % de Japon face à des
 * fonds « hors Japon » n'a pas le même marché, et le cumul « Asie » de la note l'effaçait.
 */
function geoDivergences(
  funds: UcFundResultScore[],
  exposition: UcFundExpositionSnapshot[]
): string[] {
  return exclusiveExposures(funds, exposition, (expo) => expo.geo).map(
    (d) =>
      `Divergence géographique — ${shortFundName(d.nom)} porte ${d.weight.toFixed(1)} % ${d.label}, ` +
      `zone quasi absente des autres fonds comparés : cycle et devise distincts malgré la catégorie commune.`
  );
}

function isIndustrialHeavy(expo: UcFundExpositionSnapshot): boolean {
  const industrial = weightInSlices(expo.sectors, (l) =>
    INDUSTRIAL_SECTOR_LABELS.some((s) => l.toLowerCase().includes(s.toLowerCase()))
  );
  return industrial >= 40;
}

function criteriaWonByFund(
  response: CompareResponse,
  isin: string
): { key: string; label: string; raw: string }[] {
  const metrics = metricsForIsin(response.metrics ?? [], isin);
  return resolveCriterionWinners(response)
    .filter(
      (w) =>
        w.criterion.available &&
        w.winnerIsin === isin &&
        criterionDesignatesLeader(w.criterion)
    )
    .map((w) => ({
      key: w.criterion.key,
      label: w.criterion.label,
      raw: formatCriterionRawValue(w.criterion.key, metrics),
    }))
    .sort((a, b) => {
      const wa =
        response.criteria.find((c) => c.key === a.key)?.weight_global ?? 0;
      const wb =
        response.criteria.find((c) => c.key === b.key)?.weight_global ?? 0;
      return wb - wa;
    });
}

function formatCriteriaList(items: { label: string; raw: string }[]): string {
  if (items.length === 0) return "aucun critère dominant";
  return items.map((i) => `${i.label} (${i.raw})`).join(", ");
}

function buildVerdictSection(response: CompareResponse, ranked: UcFundResultScore[]): string[] {
  const paragraphs: string[] = [];

  if (response.verdict === "CATEGORY_MISMATCH") {
    paragraphs.push(
      "Comparaison bloquée : les fonds ne relèvent pas de la même catégorie. Aucune note d'arbitrage score n'est produite."
    );
    return paragraphs;
  }

  if (response.verdict === "INSUFFICIENT_DATA") {
    const thresholdPct = Math.round(ucConfidenceThreshold(response.scoring_profile) * 100);
    const missing = response.criteria
      .filter((c) => !c.available)
      .map((c) => c.label.toLowerCase());
    paragraphs.push(
      `Confiance ${Math.round((response.confidence_index ?? 0) * 100)} % — en dessous du seuil opérationnel (${thresholdPct} %). ` +
        `Score global non retenu : historique incomplet sur au moins un fonds` +
        (missing.length > 0 ? ` (critères absents : ${missing.join(", ")}).` : ".")
    );
    paragraphs.push(
      response.scoring_profile === "obligations"
        ? "Lecture partielle possible sur Sharpe, perf. 1 an et exposition ci-dessous ; barème obligations sans perf. 5 ans ni Top 10."
        : "Lecture partielle possible sur Sharpe, perf. 1 an et exposition ci-dessous ; ne pas utiliser pour un arbitrage chiffré sans compléter les données long terme."
    );
    return paragraphs;
  }

  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (!leader) return paragraphs;

  if (response.category_warning) {
    paragraphs.push(response.category_warning);
  }

  if (response.verdict === "TIE" && runnerUp) {
    const gap =
      response.score_gap ??
      Math.abs(leader.score_relative_total - runnerUp.score_relative_total);
    const leaderWins = criteriaWonByFund(response, leader.isin);
    const runnerWins = criteriaWonByFund(response, runnerUp.isin);

    paragraphs.push(
      `Égalité technique entre ${shortFundName(leader.nom)} (${leader.score_relative_total.toFixed(1)}/100) ` +
        `et ${shortFundName(runnerUp.nom)} (${runnerUp.score_relative_total.toFixed(1)}/100) — écart ${gap.toFixed(1)} pt (seuil 2 pts). ` +
        `Moteurs de performance opposés : ${shortFundName(leader.nom)} domine sur ${formatCriteriaList(leaderWins)} ; ` +
        `${shortFundName(runnerUp.nom)} sur ${formatCriteriaList(runnerWins)}.`
    );

    const perf3 = response.criteria.find((c) => c.key === "perf_3ans");
    if (perf3?.available) {
      const leaderIdx = response.fund_order.indexOf(leader.isin);
      const runnerIdx = response.fund_order.indexOf(runnerUp.isin);
      const leader3 = formatCriterionRawValue(
        "perf_3ans",
        metricsForIsin(response.metrics ?? [], leader.isin)
      );
      const runner3 = formatCriterionRawValue(
        "perf_3ans",
        metricsForIsin(response.metrics ?? [], runnerUp.isin)
      );
      const runnerScore = perf3.scores[runnerIdx] ?? 0;
      const leaderScore = perf3.scores[leaderIdx] ?? 0;
      if (runnerScore >= 90 && leaderScore <= 30) {
        paragraphs.push(
          `Divergence structurelle sur 3 ans : ${shortFundName(runnerUp.nom)} affiche ${runner3} vs ${leader3} pour ${shortFundName(leader.nom)} — ` +
            `écart incompatible avec un choix automatique malgré un score global proche.`
        );
      }
    }
    return paragraphs;
  }

  const winner = fundByIsin(ranked, response.winner_isin ?? leader.isin) ?? leader;
  const second = ranked.find((f) => f.isin !== winner.isin);
  const gap =
    response.score_gap ??
    (second ? winner.score_relative_total - second.score_relative_total : 0);

  paragraphs.push(
    `${shortFundName(winner.nom)} est désigné (${winner.score_relative_total.toFixed(1)}/100` +
      (second ? `, +${gap.toFixed(1)} pt sur ${shortFundName(second.nom)}).` : ").") +
      ` Critères gagnants : ${formatCriteriaList(criteriaWonByFund(response, winner.isin))}.`
  );

  if (second) {
    const secondWins = criteriaWonByFund(response, second.isin);
    if (secondWins.length > 0) {
      paragraphs.push(
        `${shortFundName(second.nom)} conserve un avantage relatif sur : ${formatCriteriaList(secondWins)} — ` +
          `à intégrer si l'horizon d'investissement privilégie ces dimensions.`
      );
    }
  }

  return paragraphs;
}

function buildExposureSection(
  response: CompareResponse,
  ranked: UcFundResultScore[]
): string[] {
  const paragraphs: string[] = [];
  const exposition = response.exposition ?? [];
  if (exposition.length === 0 || exposition.every((e) => e.geo.length === 0 && e.sectors.length === 0)) {
    paragraphs.push("Exposition sectorielle / géographique non disponible (cache Boursorama vide ou incomplet).");
    return paragraphs;
  }

  const focusFunds =
    response.verdict === "TIE" && ranked.length >= 2
      ? ranked.slice(0, 2)
      : ranked.slice(0, Math.min(4, ranked.length));

  for (const fund of focusFunds) {
    const expo = expositionForIsin(exposition, fund.isin);
    if (!expo) continue;

    const dom = dominantSector(expo);
    const us = usWeight(expo);
    const asia = asiaWeight(expo);
    const parts: string[] = [];

    if (dom) {
      parts.push(`secteur dominant ${dom.label} (${dom.weight.toFixed(1)} %)`);
    }
    if (us >= 50) parts.push(`USA ${us.toFixed(1)} %`);
    if (asia >= 15) parts.push(`Asie ${asia.toFixed(1)} % (cumul TW/CN/KR/HK/SG/JP)`);
    if (expo.style_box?.label_fr) parts.push(`style ${expo.style_box.label_fr}`);

    if (parts.length > 0) {
      paragraphs.push(`${shortFundName(fund.nom)} : ${parts.join(" ; ")}.`);
    }

    if (isIndustrialHeavy(expo) && dom && dom.weight < 50) {
      const industrial = weightInSlices(expo.sectors, (l) =>
        INDUSTRIAL_SECTOR_LABELS.some((s) => l.toLowerCase().includes(s.toLowerCase()))
      );
      const tech = weightInSlices(expo.sectors, (l) => /technolog/i.test(l));
      paragraphs.push(
        `Alerte composition — ${shortFundName(fund.nom)} : profil ${industrial.toFixed(1)} % Industriel / ${tech.toFixed(1)} % Tech. ` +
          `La surperformance long terme peut refléter ce biais sectoriel plutôt qu'une pure alpha technologique.`
      );
    }
  }

  if (focusFunds.length >= 2) {
    const [a, b] = focusFunds;
    const expoA = expositionForIsin(exposition, a.isin);
    const expoB = expositionForIsin(exposition, b.isin);
    if (expoA && expoB) {
      const domA = dominantSector(expoA);
      const domB = dominantSector(expoB);
      if (
        domA &&
        domB &&
        domA.label !== domB.label &&
        Math.abs(domA.weight - domB.weight) >= 20
      ) {
        paragraphs.push(
          `Fausse corrélation intra-catégorie : ${shortFundName(a.nom)} (${domA.label} ${domA.weight.toFixed(1)} %) ` +
            `et ${shortFundName(b.nom)} (${domB.label} ${domB.weight.toFixed(1)} %) partagent la même catégorie Morningstar ` +
            `mais des bêtas sectorielles distinctes.`
        );
      }

      const usA = usWeight(expoA);
      const usB = usWeight(expoB);
      if (Math.abs(usA - usB) >= 15) {
        paragraphs.push(
          `Écart géographique USA : ${shortFundName(a.nom)} ${usA.toFixed(1)} % vs ${shortFundName(b.nom)} ${usB.toFixed(1)} % — ` +
            `sensibilité dollar et cycle américain différente.`
        );
      }
    }
  }

  // Balayage sur tous les fonds comparés : l'atypique du groupe est souvent celui que le
  // classement relègue, donc hors de la comparaison par paire ci-dessus.
  paragraphs.push(...sectorDivergences(focusFunds, exposition));
  paragraphs.push(...geoDivergences(focusFunds, exposition));

  const others = ranked.filter((f) => !focusFunds.some((ff) => ff.isin === f.isin));
  for (const fund of others.slice(0, 2)) {
    const expo = expositionForIsin(exposition, fund.isin);
    if (!expo) continue;
    const asia = asiaWeight(expo);
    const us = usWeight(expo);
    const highlights: string[] = [];
    for (const slice of topSlices(expo.geo, 3)) {
      if (/corée|taiwan|taïwan/i.test(slice.label) && slice.weight_percent >= 8) {
        highlights.push(`${slice.label} ${slice.weight_percent.toFixed(1)} %`);
      }
    }
    if (highlights.length > 0) {
      paragraphs.push(
        `${shortFundName(fund.nom)} apporte une exposition Asie explicite (${highlights.join(", ")}) ` +
          `vs profil plus US-centré des leaders — diversification géopolitique si mandat autorisé.`
      );
    } else if (asia >= 20 && us < 60) {
      paragraphs.push(
        `${shortFundName(fund.nom)} : profil géographique plus diversifié (USA ${us.toFixed(1)} %, Asie ${asia.toFixed(1)} %).`
      );
    }
  }

  return paragraphs;
}

function buildArbitrationSection(
  response: CompareResponse,
  ranked: UcFundResultScore[]
): string[] {
  const paragraphs: string[] = [];

  if (response.verdict === "CATEGORY_MISMATCH") {
    paragraphs.push("Ne pas arbitrer sur ce périmètre : reclasser ou comparer dans une catégorie homogène.");
    return paragraphs;
  }

  if (response.verdict === "INSUFFICIENT_DATA") {
    paragraphs.push(
      "Conseil : compléter les historiques 3/5 ans (ou retirer le fonds récent du comparatif) avant arbitrage. " +
        "Utiliser uniquement le détail critère disponible et la matrice d'exposition en lecture indicative."
    );
    return paragraphs;
  }

  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (!leader) return paragraphs;

  if (response.verdict === "TIE" && runnerUp) {
    const leaderWins = criteriaWonByFund(response, leader.isin);
    const runnerWins = criteriaWonByFund(response, runnerUp.isin);
    const leaderShort = shortHorizonKeys(leaderWins.map((w) => w.key));
    const runnerShort = shortHorizonKeys(runnerWins.map((w) => w.key));

    paragraphs.push(
      `Arbitrage non automatique. Horizon court / risque ajusté : privilégier le fonds dominant sur ${leaderShort || "Sharpe et perf. 1 an"}. ` +
        `Horizon long / rattrapage cyclique : évaluer ${shortFundName(runnerUp.nom)} (forces : ${runnerShort || "perf. 3-5 ans"}).`
    );
    paragraphs.push(
      "Valider adéquation sectorielle au mandat (pure tech vs industriel/tech) et tolérance géographique (USA concentré vs Asie) avant engagement."
    );
    return paragraphs;
  }

  const winner = fundByIsin(ranked, response.winner_isin ?? leader.isin) ?? leader;
  // Créditer le Sharpe serait faux quand il ne départage pas : on nomme les critères décisifs.
  // `shortHorizonKeys` ne connaît que les horizons de perf : il masquerait le rang, la volatilité
  // et la pire année, qui sont souvent les critères décisifs.
  const winnerWins = criteriaWonByFund(response, winner.isin)
    .map((w) => w.label.toLowerCase())
    .join(", ");
  paragraphs.push(
    `Lecture technique : ${shortFundName(winner.nom)} sur la base du score agrégé pondéré` +
      `${winnerWins ? `, départagé sur ${winnerWins}` : ""}. ` +
      `Documenter l'écart ${response.score_gap?.toFixed(1) ?? "—"} pt dans le comité d'investissement / dossier conseil.`
  );

  const exposition = response.exposition ?? [];
  const winnerExpo = expositionForIsin(exposition, winner.isin);
  if (winnerExpo && usWeight(winnerExpo) >= 65) {
    paragraphs.push(
      `Point de vigilance : exposition USA élevée (${usWeight(winnerExpo).toFixed(1)} %) — vérifier cohérence avec la conviction macro du cabinet.`
    );
  }

  const challenger = ranked.find((f) => f.isin !== winner.isin);
  if (challenger) {
    const challWins = criteriaWonByFund(response, challenger.isin);
    // Nommer les horizons réellement gagnés : annoncer « 3-5 ans » quand le challenger ne mène
    // que le 3 ans (le gagnant tenant le 5 ans) est un contresens devant un client.
    const horizons = challWins
      .map((w) => PERF_HORIZON_LABELS[w.key])
      .filter((label): label is string => label != null);
    if (horizons.length > 0) {
      paragraphs.push(
        `${shortFundName(challenger.nom)} reste une alternative crédible si le mandat client ` +
          `privilégie la performance brute à ${horizons.join(" et ")} plutôt que le score pondéré d'ensemble.`
      );
    }
  }

  return paragraphs;
}

function shortHorizonKeys(keys: string[]): string {
  const labels: string[] = [];
  if (keys.some((k) => k === "perf_1an" || k === "sharpe_3y")) labels.push("Sharpe / 1 an");
  if (keys.some((k) => k === "perf_3ans")) labels.push("3 ans");
  if (keys.some((k) => k === "perf_5ans")) labels.push("5 ans");
  return labels.join(" et ");
}

export function buildUcTechnicalAnalystNote(response: CompareResponse): UcTechnicalAnalystNote | null {
  const ranked = fundsInRankOrder(response.results ?? []);
  if (ranked.length === 0) return null;

  const verdictTitle =
    response.verdict === "TIE"
      ? "Analyse du cas d'égalité"
      : response.verdict === "WINNER_DECLARED"
        ? "Analyse du classement"
        : response.verdict === "INSUFFICIENT_DATA"
          ? "Analyse — données partielles"
          : "Analyse du comparatif";

  const sections: UcTechnicalAnalystSection[] = [
    {
      title: `1. ${verdictTitle}`,
      paragraphs: buildVerdictSection(response, ranked),
    },
    {
      title: "2. Profils d'exposition & fausses corrélations",
      paragraphs: buildExposureSection(response, ranked),
    },
    {
      title: "3. Piste d'arbitrage (conseiller)",
      paragraphs: buildArbitrationSection(response, ranked),
    },
  ].filter((s) => s.paragraphs.length > 0);

  if (sections.length === 0) return null;
  return { sections };
}
