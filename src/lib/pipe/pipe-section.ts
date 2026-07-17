import {
  PIPE_BOARD_TAB_KEY,
  PIPE_VIEW_MODE_KEY,
  type PipeBoardTab,
  type PipeViewMode,
} from "@/lib/pipe/pipe-board-utils";

export const PIPE_SECTION_KEY = "crm:pipe-section";

/** Destination unique dans la page Pipe (remplace Tableau/Liste + onglets board). */
export type PipeSection = "affaires" | "suivi_stellium" | "remuneration" | "liste";

export const PIPE_SECTIONS: PipeSection[] = [
  "affaires",
  "suivi_stellium",
  "liste",
  "remuneration",
];

export const PIPE_SECTION_LABELS: Record<PipeSection, string> = {
  affaires: "Affaires",
  suivi_stellium: "Suivi Stellium",
  remuneration: "Rémunération",
  liste: "Liste complète",
};

export function pipeSectionIsListe(section: PipeSection): boolean {
  return section === "liste";
}

export function pipeSectionNeedsPlacementBoard(section: PipeSection): boolean {
  return section === "suivi_stellium" || section === "liste";
}

function legacyViewModeFromSection(section: PipeSection): PipeViewMode {
  return section === "liste" ? "list" : "board";
}

function legacyBoardTabFromSection(section: PipeSection): PipeBoardTab {
  if (section === "suivi_stellium") return "actes";
  if (section === "remuneration") return "remuneration";
  return "affaires";
}

function sectionFromLegacy(viewMode: PipeViewMode, boardTab: PipeBoardTab): PipeSection {
  if (viewMode === "list") return "liste";
  if (boardTab === "actes") return "suivi_stellium";
  if (boardTab === "remuneration") return "remuneration";
  return "affaires";
}

export function loadPipeSection(): PipeSection {
  try {
    const raw = localStorage.getItem(PIPE_SECTION_KEY);
    if (
      raw === "affaires" ||
      raw === "suivi_stellium" ||
      raw === "remuneration" ||
      raw === "liste"
    ) {
      return raw;
    }

    const viewMode = localStorage.getItem(PIPE_VIEW_MODE_KEY);
    const boardTab = localStorage.getItem(PIPE_BOARD_TAB_KEY);
    const legacyView: PipeViewMode = viewMode === "list" ? "list" : "board";
    const legacyTab: PipeBoardTab =
      boardTab === "actes" || boardTab === "remuneration" ? boardTab : "affaires";
    return sectionFromLegacy(legacyView, legacyTab);
  } catch {
    return "affaires";
  }
}

/** Persiste la section et garde les clés legacy synchronisées (autres onglets / sessions). */
export function savePipeSection(section: PipeSection): void {
  try {
    localStorage.setItem(PIPE_SECTION_KEY, section);
    localStorage.setItem(PIPE_VIEW_MODE_KEY, legacyViewModeFromSection(section));
    localStorage.setItem(PIPE_BOARD_TAB_KEY, legacyBoardTabFromSection(section));
  } catch {
    /* ignore */
  }
}
