import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  curateEspaceDemandeOptions,
  loadEspaceDemandeOptions,
  resolveEspaceDemandeSelection,
  type EspaceDemandeOption,
} from "./espace-demande-options";

vi.mock("@/lib/pipe/pipe-checklist-template", () => ({
  loadPipeChecklistTemplates: vi.fn(),
}));

vi.mock("@/lib/pipe/r3-immo-checklist-template", () => ({
  loadR3ImmoChecklistTemplate: vi.fn(() =>
    Promise.reject(new Error("mock"))
  ),
  cloneDefaultR3ImmoChecklistTemplate: vi.fn(() => ({
    sections: [],
    items: [
      {
        id: "cni_emprunteurs",
        section: "Id",
        label: "Carte nationale d'identité du ou des emprunteur(s)",
        rule: "always",
      },
      { id: "rib", section: "Id", label: "RIB", rule: "always" },
      { id: "livret_famille", section: "Id", label: "Livret de famille complet", rule: "always" },
      {
        id: "avis_imposition_salarie",
        section: "Rev",
        label: "Les 2 derniers avis d'imposition",
        rule: "always",
      },
      { id: "bilans_3", section: "Rev", label: "Les 3 derniers bilans", rule: "always" },
      { id: "releves_epargne", section: "Pat", label: "Relevés d'épargne…", rule: "always" },
      {
        id: "bulletin_souscription_scpi",
        section: "Objet",
        label: "Bulletin de souscription",
        rule: "always",
      },
      {
        id: "mandat_recherche_capitaux",
        section: "Divers",
        label: "Mandat de recherche en capitaux à signer",
        rule: "always",
      },
    ],
  })),
}));

const loadPipeChecklistTemplates = vi.mocked(
  (await import("@/lib/pipe/pipe-checklist-template")).loadPipeChecklistTemplates
);

describe("espace-demande-options", () => {
  beforeEach(() => {
    loadPipeChecklistTemplates.mockReset();
    loadPipeChecklistTemplates.mockResolvedValue({
      R1: [
        { id: "avis_imposition", label: "Dernier avis d'imposition", profiles: ["base"] },
        {
          id: "bilans_comptables",
          label: "3 derniers bilans comptables",
          profiles: ["chef"],
        },
        {
          id: "avis_impot_chef_entreprise",
          label: "3 derniers avis d'impôt",
          profiles: ["chef"],
        },
        {
          id: "bulletin_salaire_decembre",
          label: "Bulletin de salaire de décembre (année précédente)",
          profiles: ["salarie"],
        },
      ],
      R2: [],
      R3: [
        { id: "der", label: "DER (signé)", profiles: ["base"] },
        { id: "cni", label: "CNI", profiles: ["base"] },
        { id: "rib", label: "RIB", profiles: ["base"] },
      ],
    });
  });

  it("agrège R1, R3 placements et R3 immo", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(options.some((o) => o.templateKey === "R1:avis_imposition")).toBe(true);
    expect(options.some((o) => o.templateKey === "R3:rib")).toBe(true);
    expect(options.some((o) => o.templateKey === "R3_IMMO:livret_famille")).toBe(true);
    expect(options.some((o) => o.templateKey === "custom")).toBe(true);
  });

  it("retire les pièces pipe inutiles à l'espace client", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(options.some((o) => o.templateKey === "R3:der")).toBe(false);
    expect(options.some((o) => o.templateKey === "R3_IMMO:cni_emprunteurs")).toBe(false);
    const identite = options.find((o) => o.templateKey === "R3:cni");
    expect(identite?.label).toBe("Carte d'identité ou passeport en cours de validité");
    expect(
      options.find((o) => o.templateKey === "R1:bulletin_salaire_decembre")?.label
    ).toBe("Bulletin de salaire de décembre");
  });

  it("ne garde qu'un seul RIB", async () => {
    const options = await loadEspaceDemandeOptions();
    const ribs = options.filter((o) => /^rib\b/i.test(o.label.trim()));
    expect(ribs).toHaveLength(1);
    expect(ribs[0]?.templateKey).toBe("R3:rib");
  });

  it("retire les doublons R3 Immo déjà couverts par R1", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(options.some((o) => o.templateKey === "R3_IMMO:avis_imposition_salarie")).toBe(
      false
    );
    expect(options.some((o) => o.templateKey === "R3_IMMO:bilans_3")).toBe(false);
    expect(options.some((o) => o.templateKey === "R3_IMMO:releves_epargne")).toBe(false);
  });

  it("découpe les lots de 3 années en demandes séparées", () => {
    const input: EspaceDemandeOption[] = [
      {
        group: "R1",
        templateKey: "R1:avis_imposition",
        label: "Dernier avis d'imposition",
        typeDocument: "FISCAL",
      },
      {
        group: "R1",
        templateKey: "R1:bilans_comptables",
        label: "3 derniers bilans comptables",
        typeDocument: "FISCAL",
      },
      {
        group: "R1",
        templateKey: "R1:avis_impot_chef_entreprise",
        label: "3 derniers avis d'impôt",
        typeDocument: "FISCAL",
      },
      {
        group: "R1",
        templateKey: "R1:bulletin_salaire",
        label: "Dernier bulletin de salaire",
        typeDocument: "FISCAL",
      },
      {
        group: "R3_IMMO",
        templateKey: "R3_IMMO:releves_compte_courant",
        label: "Les 3 derniers relevés de compte courant (perso, joint)",
        typeDocument: "PATRIMOINE",
      },
    ];
    const labels = curateEspaceDemandeOptions(input).map((o) => o.label);
    expect(labels).toEqual([
      "Dernier avis d'imposition",
      "Avis d'imposition N-2",
      "Avis d'imposition N-3",
      "Dernier bilan comptable",
      "Bilan comptable N-2",
      "Bilan comptable N-3",
      "Dernier bulletin de salaire",
      "Bulletin de salaire M-2",
      "Bulletin de salaire M-3",
      "Dernier relevé de compte",
      "Relevé de compte M-2",
      "Relevé de compte M-3",
    ]);
  });

  it("retire le bulletin de souscription et le mandat de recherche", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(
      options.some((o) => o.templateKey === "R3_IMMO:bulletin_souscription_scpi")
    ).toBe(false);
    expect(options.some((o) => /souscription/i.test(o.label))).toBe(false);
    expect(
      options.some((o) => o.templateKey === "R3_IMMO:mandat_recherche_capitaux")
    ).toBe(false);
    expect(options.some((o) => /mandat de recherche/i.test(o.label))).toBe(false);
  });

  it("trie les libellés par ordre alphabétique, Autre en dernier", async () => {
    const options = await loadEspaceDemandeOptions();
    const labels = options.map((o) => o.label);
    expect(labels.at(-1)).toBe("Autre (libellé personnalisé)");
    const avisAt = labels.indexOf("Dernier avis d'imposition");
    expect(labels.slice(avisAt, avisAt + 3)).toEqual([
      "Dernier avis d'imposition",
      "Avis d'imposition N-2",
      "Avis d'imposition N-3",
    ]);
    const bilanAt = labels.indexOf("Dernier bilan comptable");
    expect(labels.slice(bilanAt, bilanAt + 3)).toEqual([
      "Dernier bilan comptable",
      "Bilan comptable N-2",
      "Bilan comptable N-3",
    ]);
  });

  it("résout une sélection custom", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(
      resolveEspaceDemandeSelection(options, "custom", "Attestation employeur")
    ).toEqual({
      libelle: "Attestation employeur",
      typeDocument: "AUTRE",
      templateKey: null,
    });
  });
});
