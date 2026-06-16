import { ArrowRight, Home, TrendingUp, User, Wallet } from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import {
  buildRioPreviewSummary,
  formatEuroCompact,
} from "@/lib/documents/rio-import-preview";

interface RioPreviewSummaryBarProps {
  data: ExtractedData;
}

export function RioPreviewSummaryBar({ data }: RioPreviewSummaryBarProps) {
  const summary = buildRioPreviewSummary(data);
  const isQpi = data.typeDocument === "QPI";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Contact
          </div>
          <div className="font-semibold text-sm truncate">{summary.contactLabel}</div>
          {summary.isCouple && (
            <div className="text-[11px] text-blue-700 mt-0.5">Import couple</div>
          )}
        </div>

        {!isQpi && (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Revenus / charges
            </div>
            <div className="font-semibold text-sm">
              {formatEuroCompact(summary.revenusTotal)}
              <span className="text-muted-foreground font-normal"> / </span>
              {formatEuroCompact(summary.chargesTotal)}
            </div>
          </div>
        )}

        {!isQpi && (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Home className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Patrimoine brut
            </div>
            <div className="font-semibold text-sm">{formatEuroCompact(summary.patrimoineBrut)}</div>
            {summary.patrimoineNet != null && summary.patrimoineNet > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Net {formatEuroCompact(summary.patrimoineNet)}
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Profil SRI
          </div>
          <div className="font-semibold text-sm">
            {summary.sri != null && summary.sri > 0 ? `${summary.sri} / 7` : "—"}
          </div>
        </div>
      </div>

      {!isQpi && summary.hasPatrimoineStep && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" aria-hidden />
          <p>
            <strong>Étape suivante :</strong> après validation du contact, vous trierez{" "}
            <strong>{summary.itemsToTri} investissement{summary.itemsToTri > 1 ? "s" : ""}</strong>{" "}
            « avec moi » / « à côté »
            {summary.itemsAutoCote > 0
              ? ` (${summary.itemsAutoCote} épargne${summary.itemsAutoCote > 1 ? "s" : ""} bancaire${summary.itemsAutoCote > 1 ? "s" : ""} classée${summary.itemsAutoCote > 1 ? "s" : ""} automatiquement « à côté »)`
              : ""}
            .
          </p>
        </div>
      )}
    </div>
  );
}
