import { describe, expect, it } from "vitest";
import {
  CIF_RECAP_CONTINUATION_SUFFIX,
  applyPaginationToPreview,
  flattenPageToBlocks,
  mergePaginatedPages,
  packBlocksIntoPages,
  pageNeedsPagination,
  paginateSinglePage,
  splitProseSegments,
  textToSegments,
} from "@/lib/souscription-cif/cif-pagination";
import type { ScpiLmPagePreview } from "@/lib/souscription-cif/render-template";

describe("pageNeedsPagination", () => {
  it("active le tableau récap rapport de mission marqué dynamicPagination", () => {
    expect(
      pageNeedsPagination({
        pageNumber: 2,
        bodySegments: [],
        footerSegments: [],
        dynamicPagination: true,
        rapportRecapRows: [{ title: "A", contentSegments: textToSegments("x") }],
      })
    ).toBe(true);
  });

  it("active la page annexes préconisations marquée dynamicPagination", () => {
    expect(
      pageNeedsPagination({
        pageNumber: 5,
        bodySegments: textToSegments("Mes préconisations…"),
        footerSegments: [],
        dynamicPagination: true,
        paginationSliceId: "annexes-page-5",
      })
    ).toBe(true);
  });

  it("ignore la page 1 avec titre", () => {
    expect(
      pageNeedsPagination({
        pageNumber: 1,
        title: "RAPPORT",
        bodySegments: textToSegments("Intro"),
        footerSegments: [],
      })
    ).toBe(false);
  });

  it("ignore le tableau récap annexes adéquation (page 6) sans dynamicPagination", () => {
    expect(
      pageNeedsPagination({
        pageNumber: 6,
        bodySegments: [],
        footerSegments: [],
        rapportRecapTableHeader: "TABLEAU RÉCAPITULATIF",
        rapportRecapRows: [{ title: "A", contentSegments: textToSegments("x") }],
        showAnnexesCostsTable: true,
      })
    ).toBe(false);
  });

  it("ignore les pages annexes fixes (pages 2–3)", () => {
    expect(
      pageNeedsPagination({
        pageNumber: 2,
        bodySegments: textToSegments("Texte juridique fixe"),
        footerSegments: [],
      })
    ).toBe(false);
  });
});

describe("splitProseSegments", () => {
  it("découpe sur les paragraphes", () => {
    const chunks = splitProseSegments(
      textToSegments("Préconisations.\n\nDescriptions SCPI.")
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0][0]).toMatchObject({ value: "Préconisations." });
    expect(chunks[1][0]).toMatchObject({ value: "Descriptions SCPI." });
  });
});

describe("packBlocksIntoPages", () => {
  it("crée une page de continuation avec en-tête (suite)", () => {
    const blocks = flattenPageToBlocks({
      pageNumber: 6,
      bodySegments: [],
      footerSegments: [],
      rapportRecapTableHeader: "TABLEAU RÉCAPITULATIF",
      rapportRecapRows: [
        { title: "Ligne A", contentSegments: textToSegments("a") },
        { title: "Ligne B", contentSegments: textToSegments("b") },
      ],
    });

    const heights = new Map<string, number>([
      ["recap-header", 20],
      ["recap-header:TABLEAU RÉCAPITULATIF", 20],
      [`recap-header:TABLEAU RÉCAPITULATIF${CIF_RECAP_CONTINUATION_SUFFIX}`, 20],
      [blocks[1]!.id, 50],
      [blocks[2]!.id, 50],
    ]);

    const pages = packBlocksIntoPages(blocks, heights, 80);
    expect(pages).toHaveLength(2);
    expect(pages[1]![0]).toMatchObject({
      kind: "recap-header",
      header: `TABLEAU RÉCAPITULATIF${CIF_RECAP_CONTINUATION_SUFFIX}`,
    });
  });
});

describe("paginateSinglePage", () => {
  it("scinde une page prose en plusieurs pages", () => {
    const page: ScpiLmPagePreview = {
      pageNumber: 5,
      bodySegments: textToSegments("Bloc A\n\nBloc B\n\nBloc C"),
      footerSegments: [{ kind: "text", value: "footer" }],
    };

    const measure = (block: { id: string; kind: string }) => {
      if (block.kind === "prose" && block.id.includes("part")) {
        return 40;
      }
      if (block.kind === "prose") {
        return 50;
      }
      return 30;
    };

    const heights = new Map<string, number>();
    const result = paginateSinglePage(page, heights, 60, measure);
    expect(result.length).toBeGreaterThan(1);
  });
});

describe("mergePaginatedPages", () => {
  it("remplace une page et renumérote", () => {
    const pages: ScpiLmPagePreview[] = [
      { pageNumber: 1, bodySegments: textToSegments("p1"), footerSegments: [] },
      { pageNumber: 2, bodySegments: textToSegments("p2"), footerSegments: [] },
      { pageNumber: 3, bodySegments: textToSegments("p3"), footerSegments: [] },
    ];
    const replacements = new Map<number, ScpiLmPagePreview[]>([
      [
        1,
        [
          { pageNumber: 2, bodySegments: textToSegments("p2a"), footerSegments: [] },
          { pageNumber: 2, bodySegments: textToSegments("p2b"), footerSegments: [] },
        ],
      ],
    ]);
    const merged = mergePaginatedPages(pages, replacements);
    expect(merged).toHaveLength(4);
    expect(merged.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4]);
  });
});

describe("applyPaginationToPreview", () => {
  it("renumérote les pages du preview", () => {
    const out = applyPaginationToPreview(
      { pages: [], missingKeys: [] },
      [
        { pageNumber: 99, bodySegments: [], footerSegments: [] },
        { pageNumber: 99, bodySegments: [], footerSegments: [] },
      ]
    );
    expect(out.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
  });
});

describe("overlayRawContentOnDisplayPages", () => {
  it("conserve la structure paginée quand le texte dossier change", async () => {
    const { buildRapportMissionPreview } = await import(
      "@/lib/souscription-cif/render-rapport-mission"
    );
    const {
      overlayRawContentOnDisplayPages,
      paginatePageFromEstimate,
    } = await import("@/lib/souscription-cif/cif-pagination-from-dom");

    const variables = {
      client_nom_prenom: "Luc BERNARD",
      client_adresse: "12 rue Example",
      client_cp_ville: "34000 Montpellier",
      client_ville: "Montpellier",
      client_telephone: "06 12 34 56 78",
      client_date_naissance: "01/01/1980",
      client_lieu_naissance: "Montpellier",
      date_document: "14/06/2026",
      cgp_nom_complet: "Jean DUPONT",
      cgp_rcs_ville: "Montpellier",
      cgp_siren: "843 139 148",
      cgp_adresse_ligne: "4 impasse des arbousiers",
      cgp_cp_ville: "34660 Cournonsec",
      cgp_anacofi_numero: "E011507",
      cgp_orias: "19000736",
      cgp_siren_compact: "843139148",
      rappel_demande: "Diversification patrimoniale",
      rappel_situation_client: "➞ Âge : 45 ans",
    };

    const raw = buildRapportMissionPreview(variables);
    const structure = raw.pages.flatMap((page) =>
      page.dynamicPagination ? paginatePageFromEstimate(page) : [page]
    );
    const edited = buildRapportMissionPreview({
      ...variables,
      rappel_situation_client: "➞ Âge : 45 ans\n➞ Situation matrimoniale : Marié(e)\n➞ Enfants : 2",
    });

    const overlaid = overlayRawContentOnDisplayPages(structure, edited.pages);
    expect(overlaid.length).toBe(structure.length);
    expect(
      overlaid.some((p) =>
        p.rapportRecapRows?.some((r) =>
          r.title.includes("SITUATION") &&
          r.contentSegments.some((s) => s.kind === "text" && s.value.includes("Enfants"))
        )
      )
    ).toBe(true);
  });

  it("ne remplace pas les pages annexes fixes par le texte de la page 5", async () => {
    const { buildAnnexesRapportPreview } = await import(
      "@/lib/souscription-cif/render-annexes-rapport"
    );
    const { overlayRawContentOnDisplayPages } = await import(
      "@/lib/souscription-cif/cif-pagination-from-dom"
    );
    const { defaultSouscriptionDossierFields } = await import(
      "@/lib/souscription-cif/dossier-fields"
    );

    const raw = buildAnnexesRapportPreview(
      "scpi",
      { mes_preconisations: "Préco A", descriptions_scpi: "Desc A" },
      defaultSouscriptionDossierFields()
    );
    const page2Text = raw.pages[1]!.bodySegments
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");

    const structure = raw.pages.map((p) => ({ ...p }));
    const edited = buildAnnexesRapportPreview(
      "scpi",
      { mes_preconisations: "Préco B modifiée", descriptions_scpi: "Desc B" },
      defaultSouscriptionDossierFields()
    );

    const overlaid = overlayRawContentOnDisplayPages(structure, edited.pages);
    expect(overlaid).toHaveLength(9);
    const page2Body = overlaid[1]!.bodySegments
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
    expect(page2Body).toBe(page2Text.replace(/\r\n/g, "\n"));
    expect(page2Body).not.toContain("Préco B");
    expect(
      overlaid[4]!.bodySegments
        .map((s) => (s.kind === "text" ? s.value : ""))
        .join("")
    ).toContain("Préco B modifiée");
  });
});
