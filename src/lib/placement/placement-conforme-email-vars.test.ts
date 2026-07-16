import { describe, expect, it } from "vitest";
import {
  buildPlacementConformeEmailExtraVariables,
  buildPlacementConformeEmailExtraVariablesForSend,
} from "@/lib/placement/placement-conforme-email-vars";

describe("placement-conforme-email-vars", () => {
  it("build extra variables", () => {
    const vars = buildPlacementConformeEmailExtraVariables({
      operation_type: "ARBITRAGE",
      product_label: "Cristalliance Evoluvie",
      stellium_label: "Arbitrage libre",
      email_received_at: 1_700_000_000,
    });
    expect(vars.type_operation).toBe("Arbitrage libre");
    expect(vars.produit).toBe("Cristalliance Evoluvie");
    expect(vars.libelle_stellium).toBe("Arbitrage libre");
    expect(vars.libelle_client).toBe("l'arbitrage");
    expect(vars.date_operation.length).toBeGreaterThan(5);
  });

  it("échappe les champs Stellium pour l'envoi HTML", () => {
    const vars = buildPlacementConformeEmailExtraVariablesForSend({
      operation_type: "ARBITRAGE",
      product_label: "<script>alert(1)</script>",
      stellium_label: "Arbitrage <b>libre</b>",
      email_received_at: null,
    });
    expect(vars.produit).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(vars.libelle_stellium).toBe("Arbitrage &lt;b&gt;libre&lt;/b&gt;");
  });

  it("affiche le produit sans ALPSI/CIF dans le mail client", () => {
    const vars = buildPlacementConformeEmailExtraVariables({
      operation_type: "AUTRE",
      product_label: "Comète (ALPSI)",
      stellium_label: "Souscription",
      email_received_at: null,
    });
    expect(vars.produit).toBe("Comète");
  });

  it("neutralise les retours ligne dans les variables d'envoi", () => {
    const vars = buildPlacementConformeEmailExtraVariablesForSend({
      operation_type: "ARBITRAGE",
      product_label: "Cristalliance\r\nAvenir",
      stellium_label: "Arbitrage libre\ninjection",
      email_received_at: null,
    });
    expect(vars.produit).toBe("Cristalliance Avenir");
    expect(vars.libelle_stellium).toBe("Arbitrage libre injection");
  });
});
