import type { Tache } from "@/lib/api/tauri-taches";
import { getContactById } from "@/lib/api/tauri-contacts";
import { getPartenaireById } from "@/lib/api/tauri-partenaires";
import {
  getInvestissementById,
  getInvestissementsByContact,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { listPlacementOperationsForPipe } from "@/lib/api/tauri-box-placement";
import { createPipe, listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import { defaultSuiviPipeTitre, PIPE_TYPE_SUIVI } from "@/lib/pipe/pipe-suivi";
import { applySuiviStelliumActsAfterPipeCreate } from "@/lib/placement/suivi-stellium-acts";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";
import {
  parseArbitrageInvestissementId,
  resolveArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import {
  filterFicheConseilEligibleInvestissements,
  investissementToFicheProductKind,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";
import {
  FICHE_CONSEIL_ARBITRAGE_ACT_LABEL,
  resolveStelliumProductLabelFromInvestissement,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";

async function resolvePartenaireNom(partenaireId?: number): Promise<string | null> {
  if (!partenaireId) return null;
  try {
    const partenaire = await getPartenaireById(partenaireId);
    return partenaire.raison_sociale?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveInvestissementForFicheConseilTask(tache: Tache): Promise<Investissement | null> {
  const contactId = tache.contacts[0]?.contact_id;
  if (!contactId) return null;

  const embeddedId = parseArbitrageInvestissementId(tache.description);
  if (embeddedId) {
    try {
      const inv = await getInvestissementById(embeddedId);
      if (
        inv.contact_id === contactId &&
        filterFicheConseilEligibleInvestissements([inv]).length > 0
      ) {
        return inv;
      }
    } catch {
      // investissement introuvable — on continue avec la liste.
    }
  }

  const eligible = filterFicheConseilEligibleInvestissements(
    await getInvestissementsByContact(contactId)
  );
  const kindFromTitle = resolveArbitrageFicheProductKind(tache);
  if (kindFromTitle) {
    const filtered = eligible.filter(
      (inv) => investissementToFicheProductKind(inv.type_produit) === kindFromTitle
    );
    if (filtered.length === 1) return filtered[0];
    return null;
  }
  if (eligible.length === 1) return eligible[0];
  return null;
}

/** Titre du pipe Suivi créé depuis une tâche fiche conseil (nom de la tâche, pas « suivi mois »). */
export function suiviPipeTitreFromFicheConseilTask(
  tache: Pick<Tache, "titre">,
  contact?: Parameters<typeof defaultSuiviPipeTitre>[0]
): string {
  const fromTask = tache.titre.trim();
  if (fromTask) return fromTask;
  return contact ? defaultSuiviPipeTitre(contact) : "Suivi";
}

/** Nouveau pipe Suivi + acte arbitrage libre (draft) si le produit Stellium est déductible. */
export async function findExistingSuiviPipeForFicheConseilTask(
  tache: Tache,
  contactId: number
): Promise<PipeRecord | null> {
  const titre = suiviPipeTitreFromFicheConseilTask(tache).trim();
  if (!titre) return null;
  const pipes = await listPipes(false);
  return (
    pipes.find(
      (pipe) =>
        pipe.contact_id === contactId &&
        pipe.pipe_type === PIPE_TYPE_SUIVI &&
        pipe.titre?.trim() === titre
    ) ?? null
  );
}

/** Nouveau pipe Suivi + acte arbitrage libre (draft) si le produit Stellium est déductible. */
export async function createSuiviPipeFromFicheConseilTask(tache: Tache): Promise<{
  suivi: PipeRecord;
  actDraftCreated: boolean;
}> {
  const contactId = tache.contacts[0]?.contact_id;
  if (!contactId) {
    throw new Error("Aucun contact lié à cette tâche.");
  }

  const contact = await getContactById(contactId);
  const existing = await findExistingSuiviPipeForFicheConseilTask(tache, contactId);
  if (existing) {
    return { suivi: existing, actDraftCreated: false };
  }

  const suivi = await createPipe({
    contact_id: contactId,
    pipe_type: PIPE_TYPE_SUIVI,
    parent_pipe_id: null,
    titre: suiviPipeTitreFromFicheConseilTask(tache, contact),
    stage: null,
    notes: null,
  });

  const investissement = await resolveInvestissementForFicheConseilTask(tache);
  const partenaireNom = investissement
    ? await resolvePartenaireNom(investissement.partenaire_id)
    : null;
  const productLabel = investissement
    ? resolveStelliumProductLabelFromInvestissement(investissement, partenaireNom)
    : null;

  if (productLabel) {
    await applySuiviStelliumActsAfterPipeCreate(suivi, [
      {
        actLabel: FICHE_CONSEIL_ARBITRAGE_ACT_LABEL,
        productLabel,
        investissementId: investissement?.id,
      },
    ]);
  }

  return { suivi, actDraftCreated: Boolean(productLabel) };
}

/** Ajoute le brouillon arbitrage libre sur un suivi existant s'il manque encore. */
export async function ensureSuiviStelliumActDraftForFicheConseilTask(
  tache: Tache,
  suivi: PipeRecord
): Promise<boolean> {
  const operations = await listPlacementOperationsForPipe(suivi.id);
  const hasArbitrageDraft = operations.some(
    (operation) =>
      placementOperationIsSuiviDraft(operation) &&
      operation.stellium_label?.trim() === FICHE_CONSEIL_ARBITRAGE_ACT_LABEL
  );
  if (hasArbitrageDraft) return false;

  const investissement = await resolveInvestissementForFicheConseilTask(tache);
  const partenaireNom = investissement
    ? await resolvePartenaireNom(investissement.partenaire_id)
    : null;
  const productLabel = investissement
    ? resolveStelliumProductLabelFromInvestissement(investissement, partenaireNom)
    : null;
  if (!productLabel) return false;

  await applySuiviStelliumActsAfterPipeCreate(suivi, [
    {
      actLabel: FICHE_CONSEIL_ARBITRAGE_ACT_LABEL,
      productLabel,
      investissementId: investissement?.id,
    },
  ]);
  return true;
}
