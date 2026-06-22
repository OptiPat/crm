import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEuroAmountCif } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import {
  CAPITAL_INVEST_TYPE_OPTIONS,
  computeCapitalInvestDroitEntreeEur,
  computeCapitalInvestMontantSouscrit,
  computeCapitalInvestTotalVerse,
  DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT,
  type CapitalInvestAnnexeSouscription,
  type CapitalInvestAnnexeType,
} from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";

type CapitalInvestAnnexeSouscriptionsPanelProps = {
  rows: readonly CapitalInvestAnnexeSouscription[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPatch: <K extends keyof CapitalInvestAnnexeSouscription>(
    id: string,
    field: K,
    value: CapitalInvestAnnexeSouscription[K]
  ) => void;
};

export function CapitalInvestAnnexeSouscriptionsPanel({
  rows,
  onAdd,
  onRemove,
  onPatch,
}: CapitalInvestAnnexeSouscriptionsPanelProps) {
  return (
    <div id="cif-capital-invest-souscriptions" className="space-y-2 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Souscriptions (FCPI, FIP, FCPR…)</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Ajouter une souscription
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Une ligne par fonds — vous pouvez combiner plusieurs types (ex. un FCPI et un FIP). Saisir le
        nombre de parts et le prix de part ; le montant souscrit est calculé (parts × prix). Droit
        d&apos;entrée par défaut : {DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT} %, en sus du montant
        souscrit. Les taux EMT (07110 / 07130 / 07140) se reprennent du fichier EMT — distincts du
        droit d&apos;entrée.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune souscription — cliquez sur Ajouter.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {rows.map((row, index) => {
            const montant = computeCapitalInvestMontantSouscrit(row);
            const droitEntree = computeCapitalInvestDroitEntreeEur(row);
            const totalVerse = computeCapitalInvestTotalVerse(row);
            return (
              <div key={row.id} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Souscription {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => onRemove(row.id)}
                    aria-label={`Supprimer la souscription ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`cif-ci-nom-${row.id}`} className="text-xs text-muted-foreground">
                      Nom du fonds
                    </Label>
                    <Input
                      id={`cif-ci-nom-${row.id}`}
                      value={row.nomFonds}
                      onChange={(e) => onPatch(row.id, "nomFonds", e.target.value)}
                      placeholder="Ex. Odyssée Capital Croissance 2025"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`cif-ci-type-${row.id}`} className="text-xs text-muted-foreground">
                      Type
                    </Label>
                    <Select
                      key={`${row.id}-type`}
                      value={row.type}
                      onValueChange={(v) => onPatch(row.id, "type", v as CapitalInvestAnnexeType)}
                    >
                      <SelectTrigger id={`cif-ci-type-${row.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPITAL_INVEST_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`cif-ci-millesime-${row.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Millésime
                    </Label>
                    <Input
                      id={`cif-ci-millesime-${row.id}`}
                      value={row.millesime}
                      onChange={(e) => onPatch(row.id, "millesime", e.target.value)}
                      placeholder="Ex. 2025"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`cif-ci-parts-${row.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Nombre de parts
                    </Label>
                    <Input
                      id={`cif-ci-parts-${row.id}`}
                      inputMode="numeric"
                      value={row.nbParts}
                      onChange={(e) => onPatch(row.id, "nbParts", e.target.value)}
                      placeholder="Ex. 100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`cif-ci-part-${row.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Prix de la part (€)
                    </Label>
                    <Input
                      id={`cif-ci-part-${row.id}`}
                      inputMode="decimal"
                      value={row.partPriceEur}
                      onChange={(e) => onPatch(row.id, "partPriceEur", e.target.value)}
                      placeholder="Ex. 105"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`cif-ci-droit-${row.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Droit d&apos;entrée (%)
                    </Label>
                    <Input
                      id={`cif-ci-droit-${row.id}`}
                      inputMode="decimal"
                      value={row.droitEntreePct}
                      onChange={(e) => onPatch(row.id, "droitEntreePct", e.target.value)}
                      placeholder={DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-dashed bg-muted/10 p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Coûts EMT — lignes 07110 / 07130 / 07140
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reprendre la valeur telle quelle du fichier EMT (sans %), comme pour les SCPI
                    en catalogue — ex. 0,005 pour 0,5 % du montant souscrit. Ne pas confondre avec
                    le droit d&apos;entrée ci-dessus.
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`cif-ci-emt-07110-${row.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        07110
                      </Label>
                      <Input
                        id={`cif-ci-emt-07110-${row.id}`}
                        inputMode="decimal"
                        value={row.emtLine07110Pct}
                        onChange={(e) => onPatch(row.id, "emtLine07110Pct", e.target.value)}
                        placeholder="Ex. 0,005"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`cif-ci-emt-07130-${row.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        07130
                      </Label>
                      <Input
                        id={`cif-ci-emt-07130-${row.id}`}
                        inputMode="decimal"
                        value={row.emtLine07130Pct}
                        onChange={(e) => onPatch(row.id, "emtLine07130Pct", e.target.value)}
                        placeholder="Ex. 0,0267"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`cif-ci-emt-07140-${row.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        07140
                      </Label>
                      <Input
                        id={`cif-ci-emt-07140-${row.id}`}
                        inputMode="decimal"
                        value={row.emtLine07140Pct}
                        onChange={(e) => onPatch(row.id, "emtLine07140Pct", e.target.value)}
                        placeholder="Ex. 0"
                      />
                    </div>
                  </div>
                </div>

                {montant != null && (
                  <p className="text-xs text-muted-foreground">
                    Montant souscrit : {formatEuroAmountCif(montant)}
                    {droitEntree != null && totalVerse != null && (
                      <>
                        {" "}
                        — droit d&apos;entrée {formatEuroAmountCif(droitEntree)} — total versé{" "}
                        {formatEuroAmountCif(totalVerse)}
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
