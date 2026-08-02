import type { ArbitrageFicheProductKind } from "@/lib/api/tauri-arbitrage-fiche";

function sanitizeFileNamePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_FILE_NAME_LEN = 180;

function fitArbitrageFicheFileName(
  productKind: ArbitrageFicheProductKind,
  client: string,
  contrat: string
): string {
  let clientPart = client;
  let contratPart = contrat;
  const build = () =>
    `Fiche conseil ${productKind} Arbitrage - ${clientPart} - ${contratPart}.pdf`;

  while (build().length > MAX_FILE_NAME_LEN && contratPart.length > 0) {
    contratPart = contratPart.slice(0, -1).trimEnd();
  }
  while (build().length > MAX_FILE_NAME_LEN && clientPart.length > 0) {
    clientPart = clientPart.slice(0, -1).trimEnd();
  }
  return build();
}

/** Ex. `Fiche conseil AV Arbitrage - DUPONT Jean - AV-123456.pdf` */
export function buildArbitrageFicheOutputFileName(
  productKind: ArbitrageFicheProductKind,
  nom: string,
  prenom: string,
  numeroContrat?: string | null
): string {
  const client = sanitizeFileNamePart(`${nom} ${prenom}`) || "contact";
  const contrat = sanitizeFileNamePart(numeroContrat ?? "") || "sans n° contrat";
  return fitArbitrageFicheFileName(productKind, client, contrat);
}

/** @deprecated */
export const buildArbitrageAvFicheOutputFileName = (
  nom: string,
  prenom: string,
  numeroContrat?: string | null
) => buildArbitrageFicheOutputFileName("AV", nom, prenom, numeroContrat);
