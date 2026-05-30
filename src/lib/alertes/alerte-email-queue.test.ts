import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Alerte } from "@/lib/api/tauri-alertes";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import {
  alerteHasActiveEmailCampaign,
  resolveAlerteEmailAction,
} from "@/lib/alertes/alerte-email-queue";

vi.mock("@/lib/api/tauri-etiquettes", () => ({
  getEtiquetteEmailQueue: vi.fn(),
}));

import { getEtiquetteEmailQueue } from "@/lib/api/tauri-etiquettes";

const baseAlerte: Alerte = {
  id: 1,
  contact_id: 42,
  type_alerte: "SUIVI_CLIENT_1AN",
  message: "Dupont - suivi",
  date_alerte: 1,
  lue: false,
  traitee: false,
  created_at: 1,
};

const etiquettes: EtiquetteWithCount[] = [
  {
    id: 10,
    nom: "Suivi > 1 an",
    couleur: "#000",
    icone: null,
    description: null,
    priorite: 50,
    auto_condition_type: null,
    auto_condition_config: null,
    auto_categories: null,
    email_template_id: 1,
    email_delai_jours: 0,
    email_envoi_prevu: null,
    email_envoi_heure: null,
    email_actif: true,
    is_default: true,
    actif: true,
    created_at: 1,
    updated_at: 1,
    contact_count: 1,
  },
];

describe("alerte-email-queue", () => {
  beforeEach(() => {
    vi.mocked(getEtiquetteEmailQueue).mockReset();
  });

  it("alerteHasActiveEmailCampaign true si campagne active", () => {
    expect(alerteHasActiveEmailCampaign(baseAlerte, etiquettes)).toBe(true);
  });

  it("alerteHasActiveEmailCampaign false si email_actif off", () => {
    const off = [{ ...etiquettes[0], email_actif: false }];
    expect(alerteHasActiveEmailCampaign(baseAlerte, off)).toBe(false);
  });

  it("resolveAlerteEmailAction send si ready", async () => {
    vi.mocked(getEtiquetteEmailQueue).mockImplementation(async (status) => {
      if (status === "ready") {
        return [
          {
            contact_etiquette_id: 99,
            contact_id: 42,
            contact_nom: "Dupont",
            contact_prenom: "Jean",
            contact_email: "j@example.com",
            contact_telephone: null,
            etiquette_id: 10,
            etiquette_nom: "Suivi > 1 an",
            etiquette_couleur: "#000",
            email_date_prevue: 1,
            email_date_envoi: null,
            template_sujet: "Sujet",
            template_corps: "Corps",
            template_agenda_link_id: null,
            queue_issue: null,
          },
        ];
      }
      return [];
    });

    const r = await resolveAlerteEmailAction(baseAlerte, etiquettes);
    expect(r.kind).toBe("send");
  });

  it("resolveAlerteEmailAction followup", async () => {
    vi.mocked(getEtiquetteEmailQueue).mockImplementation(async (status) => {
      if (status === "followup") {
        return [
          {
            contact_etiquette_id: 99,
            contact_id: 42,
            contact_nom: "Dupont",
            contact_prenom: "Jean",
            contact_email: "j@example.com",
            contact_telephone: null,
            etiquette_id: 10,
            etiquette_nom: "Suivi > 1 an",
            etiquette_couleur: "#000",
            email_date_prevue: null,
            email_date_envoi: 1,
            template_sujet: "Sujet",
            template_corps: "Corps",
            template_agenda_link_id: null,
            queue_issue: "FOLLOWUP",
          },
        ];
      }
      return [];
    });

    const r = await resolveAlerteEmailAction(baseAlerte, etiquettes);
    expect(r.kind).toBe("followup");
  });
});
