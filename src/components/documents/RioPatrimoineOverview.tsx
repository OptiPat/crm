import { Building2, Home, PiggyBank } from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import { formatEuroCompact } from "@/lib/documents/rio-import-preview";
import { formatNomProduit } from "@/lib/investissements/investissement-display";

interface RioPatrimoineOverviewProps {
  data: ExtractedData;
}

function formatContratOrigine(origine?: string): string | null {
  if (origine === "MON_CONSEIL") return "Avec moi (RIO)";
  if (origine === "EXISTANT_CLIENT") return "À côté (RIO)";
  return null;
}

function immoTypeLabel(type: string): string {
  if (type === "RESIDENCE_PRINCIPALE" || type === "RP") return "RP";
  if (type === "RESIDENCE_SECONDAIRE" || type === "RS") return "RS";
  if (type === "SCPI") return "SCPI";
  if (type === "PINEL") return "Pinel";
  if (type === "LMNP") return "LMNP";
  if (type === "LMP") return "LMP";
  if (type === "LOCATIF") return "Locatif";
  return type;
}

export function RioPatrimoineOverview({ data }: RioPatrimoineOverviewProps) {
  const biens = data.biensImmobiliers ?? [];
  const contrats = data.contratsFinanciers ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Aperçu extrait du RIO — le détail sera confirmé à l&apos;étape de tri « avec moi » / « à côté ».
      </p>

      {(data.patrimoineTotal != null || data.patrimoineNet != null) && (
        <div className="grid grid-cols-2 gap-3">
          {data.patrimoineTotal != null && (
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Patrimoine brut</div>
              <div className="text-lg font-bold">{formatEuroCompact(data.patrimoineTotal)}</div>
            </div>
          )}
          {data.patrimoineNet != null && (
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Patrimoine net</div>
              <div className="text-lg font-bold">{formatEuroCompact(data.patrimoineNet)}</div>
            </div>
          )}
        </div>
      )}

      {biens.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
            Immobilier ({biens.length})
          </h4>
          <div className="space-y-2">
            {biens.map((bien) => (
              <div key={bien.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  <span className="font-medium">{bien.nom}</span>
                  <span className="text-muted-foreground">({immoTypeLabel(bien.type)})</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {bien.valeur != null && bien.valeur > 0 && (
                    <span>Valeur {formatEuroCompact(bien.valeur)}</span>
                  )}
                  {bien.creditCRD != null && bien.creditCRD > 0 && (
                    <span>CRD {formatEuroCompact(bien.creditCRD)}</span>
                  )}
                  {bien.mensualiteCredit != null && bien.mensualiteCredit > 0 && (
                    <span>Mensualité {formatEuroCompact(bien.mensualiteCredit)}/mois</span>
                  )}
                  {bien.dateFinCredit && <span>Fin prêt {bien.dateFinCredit}</span>}
                  {bien.loyersAnnuels != null && bien.loyersAnnuels > 0 && (
                    <span>Loyers {formatEuroCompact(bien.loyersAnnuels)}/an</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {contrats.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-muted-foreground" aria-hidden />
            Contrats financiers ({contrats.length})
          </h4>
          <div className="space-y-2">
            {contrats.map((contrat) => {
              const origine = formatContratOrigine(contrat.autoOrigine);
              return (
                <div key={contrat.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{contrat.nom}</span>
                    <span className="text-muted-foreground">({formatNomProduit(contrat.type)})</span>
                    {origine && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{origine}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    Encours {formatEuroCompact(contrat.montant)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
